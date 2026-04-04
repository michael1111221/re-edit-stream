"""
Telegram Channel Monitor (MTProto / Telethon)
=============================================
Runs locally to monitor source channels and forward new posts 
to the Lovable Cloud ingest-post edge function.

Supports media groups (albums) — multiple photos/videos sent together
are buffered and forwarded as a single album.

Setup:
  1. pip install telethon aiohttp
  2. Get API credentials from https://my.telegram.org/apps
  3. Set environment variables or edit config below
  4. python monitor.py

Environment variables:
  TELEGRAM_API_ID       - Your Telegram API ID (from my.telegram.org)
  TELEGRAM_API_HASH     - Your Telegram API Hash
  TELEGRAM_PHONE        - Phone number for the user account
  INGEST_URL            - Edge function URL (e.g. https://xxx.supabase.co/functions/v1/ingest-post)
  INGEST_API_KEY        - Secret key shared with the edge function for auth
  SESSION_NAME          - Telethon session file name (default: monitor_session)
"""

import os
import asyncio
import logging
import json
import base64
import shutil
import tempfile
from datetime import datetime
from collections import defaultdict

from telethon import TelegramClient, events
from telethon.tl.functions.messages import CheckChatInviteRequest
from telethon.tl.types import (
    ChatInviteAlready,
    MessageMediaPhoto,
    MessageMediaDocument,
    DocumentAttributeVideo,
    DocumentAttributeAnimated,
    ReplyInlineMarkup,
)
from telethon.utils import get_peer_id
import aiohttp

# ── Load .env file if present ───────────────────────────────────────
from pathlib import Path
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

# ── Config ──────────────────────────────────────────────────────────

API_ID = int(os.environ.get("TELEGRAM_API_ID", "0"))
API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
PHONE = os.environ.get("TELEGRAM_PHONE", "")
INGEST_URL = os.environ.get("INGEST_URL", "")
INGEST_API_KEY = os.environ.get("INGEST_API_KEY", "")
SESSION_NAME = os.environ.get("SESSION_NAME", "monitor_session")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
BOT_UPLOAD_CHAT = os.environ.get("BOT_UPLOAD_CHAT", "").strip()

# Channels to monitor — set via MONITOR_CHANNELS env var as comma-separated handles
MONITOR_CHANNELS = [
    ch.strip() for ch in os.environ.get("MONITOR_CHANNELS", "").split(",") if ch.strip()
]

# Resolved mapping from Telegram chat ID to the original configured handle/invite link
RESOLVED_CHANNEL_HANDLES: dict[int, str] = {}
# Additional aliases (normalized forms) for each resolved channel ID so private links keep matching.
RESOLVED_CHANNEL_ALIASES: dict[int, set[str]] = defaultdict(set)

# How long to wait for more messages in a media group before sending (seconds)
MEDIA_GROUP_WAIT = float(os.environ.get("MEDIA_GROUP_WAIT", "2.5"))

# Throughput controls for large installations (hundreds of channels / thousands of posts)
MAX_CONCURRENT_MEDIA_DOWNLOADS = int(os.environ.get("MAX_CONCURRENT_MEDIA_DOWNLOADS", "4"))
MAX_CONCURRENT_BOT_UPLOADS = int(os.environ.get("MAX_CONCURRENT_BOT_UPLOADS", "4"))
MAX_CONCURRENT_GROUP_ITEMS = int(os.environ.get("MAX_CONCURRENT_GROUP_ITEMS", "4"))
MAX_CONCURRENT_INGEST_REQUESTS = int(os.environ.get("MAX_CONCURRENT_INGEST_REQUESTS", "8"))
INGEST_QUEUE_MAXSIZE = int(os.environ.get("INGEST_QUEUE_MAXSIZE", "2000"))
INGEST_TIMEOUT_SECONDS = int(os.environ.get("INGEST_TIMEOUT_SECONDS", "180"))
INGEST_RETRIES = int(os.environ.get("INGEST_RETRIES", "4"))
INGEST_RETRY_BASE_DELAY = float(os.environ.get("INGEST_RETRY_BASE_DELAY", "2"))
HTTP_CONNECTION_LIMIT = int(os.environ.get("HTTP_CONNECTION_LIMIT", "100"))
HTTP_CONNECTIONS_PER_HOST = int(os.environ.get("HTTP_CONNECTIONS_PER_HOST", "30"))
RETRYABLE_INGEST_STATUSES = {408, 425, 429, 500, 502, 503, 504, 546}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("monitor")

# ── Media group buffer ──────────────────────────────────────────────

# { grouped_id: { "messages": [...], "handle": str, "timer": asyncio.TimerHandle } }
media_group_buffer: dict[int, dict] = {}
media_group_lock = asyncio.Lock()

download_semaphore = asyncio.Semaphore(MAX_CONCURRENT_MEDIA_DOWNLOADS)
bot_upload_semaphore = asyncio.Semaphore(MAX_CONCURRENT_BOT_UPLOADS)
group_item_semaphore = asyncio.Semaphore(MAX_CONCURRENT_GROUP_ITEMS)
ingest_queue: asyncio.Queue | None = None

# Max file size to send as base64. Keep this low so the backend does not hit
# compute limits while processing multipart uploads.
MAX_BASE64_SIZE = int(os.environ.get("MAX_BASE64_SIZE", str(1024 * 1024)))

# ── Helpers ─────────────────────────────────────────────────────────

def extract_invite_hash(value: str) -> str | None:
    """Extract Telegram invite hash from private invite links."""
    cleaned = value.strip().rstrip("/")
    prefixes = (
        "https://t.me/+",
        "http://t.me/+",
        "t.me/+",
        "https://telegram.me/+",
        "http://telegram.me/+",
        "telegram.me/+",
        "https://t.me/joinchat/",
        "http://t.me/joinchat/",
        "t.me/joinchat/",
        "https://telegram.me/joinchat/",
        "http://telegram.me/joinchat/",
        "telegram.me/joinchat/",
    )

    if cleaned.startswith("+"):
        return cleaned[1:]

    for prefix in prefixes:
        if cleaned.startswith(prefix):
            return cleaned[len(prefix):].split("?", 1)[0]

    return None


async def resolve_channel_entity(client: TelegramClient, handle: str):
    """Resolve public handles and private invite links to a Telegram entity."""
    invite_hash = extract_invite_hash(handle)
    if invite_hash:
        invite = await client(CheckChatInviteRequest(invite_hash))
        if isinstance(invite, ChatInviteAlready):
            return invite.chat
        raise ValueError("The logged-in Telegram user is not a member of this private channel")

    return await client.get_entity(handle)


def get_entity_lookup_ids(entity) -> set[int]:
    """Collect all numeric ID variants that may represent the same Telegram channel."""
    candidate_ids: set[int] = set()

    raw_id = getattr(entity, "id", None)
    if isinstance(raw_id, int):
        candidate_ids.add(raw_id)

    try:
        peer_id = get_peer_id(entity)
        if isinstance(peer_id, int):
            candidate_ids.add(peer_id)
    except Exception:
        pass

    expanded_ids: set[int] = set()
    for candidate_id in candidate_ids:
        expanded_ids.add(candidate_id)
        candidate_str = str(candidate_id)
        unsigned_str = candidate_str.lstrip("-")

        if unsigned_str.startswith("100") and len(unsigned_str) > 3:
            expanded_ids.add(int(unsigned_str[3:]))

        if candidate_str.startswith("-100"):
            expanded_ids.add(int(candidate_str[4:]))
        elif not candidate_str.startswith("-") and not candidate_str.startswith("100"):
            expanded_ids.add(int(f"100{candidate_str}"))
            expanded_ids.add(int(f"-100{candidate_str}"))

    return expanded_ids


def normalize_channel_reference(value: str) -> str:
    """Normalize public/private Telegram references so different URL forms can match."""
    cleaned = value.strip().rstrip("/")
    invite_hash = extract_invite_hash(cleaned)
    if invite_hash:
        return invite_hash

    lowered = cleaned.lower()
    for prefix in (
        "https://t.me/",
        "http://t.me/",
        "t.me/",
        "https://telegram.me/",
        "http://telegram.me/",
        "telegram.me/",
    ):
        if lowered.startswith(prefix):
            cleaned = cleaned[len(prefix):]
            break

    if cleaned.startswith("@"):
        cleaned = cleaned[1:]

    return cleaned.strip()


def normalize_channel_title(value: str) -> str:
    """Normalize channel titles/names for fuzzy matching across monitor and backend."""
    cleaned = " ".join(str(value or "").strip().lower().split())
    return "".join(ch for ch in cleaned if ch.isalnum() or ch.isspace()).strip()


def remember_resolved_channel(handle: str, entity) -> None:
    """Store multiple ID variants so new events can map back to the configured handle."""
    aliases = {
        handle,
        normalize_channel_reference(handle),
    }

    title = (getattr(entity, "title", None) or "").strip()
    normalized_title = normalize_channel_title(title)
    if title:
        aliases.add(title)
    if normalized_title:
        aliases.add(normalized_title)

    if hasattr(entity, "username") and entity.username:
        aliases.update({f"@{entity.username}", entity.username})

    aliases = {alias for alias in aliases if alias}

    for candidate_id in get_entity_lookup_ids(entity):
        RESOLVED_CHANNEL_HANDLES[candidate_id] = handle
        RESOLVED_CHANNEL_ALIASES[candidate_id].update(aliases)


def expand_lookup_id_variants(candidate_id: int) -> list[int]:
    variants: list[int] = []
    candidate_str = str(candidate_id)
    unsigned_str = candidate_str.lstrip("-")

    for value in (candidate_id,):
        if value not in variants:
            variants.append(value)

    if unsigned_str.startswith("100") and len(unsigned_str) > 3:
        short_id = int(unsigned_str[3:])
        if short_id not in variants:
            variants.append(short_id)

    if candidate_str.startswith("-100"):
        short_id = int(candidate_str[4:])
        if short_id not in variants:
            variants.append(short_id)
    elif not candidate_str.startswith("-") and not candidate_str.startswith("100"):
        for variant in (int(f"100{candidate_str}"), int(f"-100{candidate_str}")):
            if variant not in variants:
                variants.append(variant)

    return variants


def iter_channel_lookup_ids(chat, chat_id: int | None = None):
    seen: set[int] = set()

    for raw_candidate in (chat_id, getattr(chat, "id", None)):
        if isinstance(raw_candidate, int):
            for candidate_id in expand_lookup_id_variants(raw_candidate):
                if candidate_id not in seen:
                    seen.add(candidate_id)
                    yield candidate_id

    try:
        peer_id = get_peer_id(chat)
        if isinstance(peer_id, int):
            for candidate_id in expand_lookup_id_variants(peer_id):
                if candidate_id not in seen:
                    seen.add(candidate_id)
                    yield candidate_id
    except Exception:
        return


def has_chat_identity(chat) -> bool:
    """Return True when the chat object already contains useful identity fields."""
    return bool(
        (getattr(chat, "title", None) or "").strip()
        or (getattr(chat, "username", None) or "").strip()
    )


async def hydrate_chat_entity(client: TelegramClient, chat, chat_id: int | None = None):
    """Resolve lightweight/private chat objects into a fuller entity when possible."""
    if has_chat_identity(chat):
        return chat

    references = []
    if chat is not None:
        references.append(chat)

    for candidate_id in iter_channel_lookup_ids(chat, chat_id):
        references.extend([candidate_id, str(candidate_id)])

    seen: set[str] = set()
    for reference in references:
        cache_key = repr(reference)
        if cache_key in seen:
            continue
        seen.add(cache_key)

        try:
            entity = await client.get_entity(reference)
            if entity is not None:
                return entity
        except Exception:
            continue

    return chat

def classify_media(message) -> str:
    """Returns media_type string."""
    if not message.media:
        return "text"

    if isinstance(message.media, MessageMediaPhoto):
        return "photo"

    if isinstance(message.media, MessageMediaDocument):
        doc = message.media.document
        if doc is None:
            return "document"

        for attr in doc.attributes:
            if isinstance(attr, DocumentAttributeAnimated):
                return "animation"
            if isinstance(attr, DocumentAttributeVideo):
                return "video"

        return "document"

    return "text"


async def download_and_get_bytes(client: TelegramClient, message) -> bytes | None:
    """Download media to memory and return bytes."""
    if not message.media:
        return None
    try:
        async with download_semaphore:
            return await client.download_media(message, bytes)
    except Exception as e:
        log.error(f"Failed to download media: {e}")
        return None


class FileTooLargeError(Exception):
    """Raised when a file exceeds the Telegram Bot API 50MB upload limit."""
    pass


async def upload_to_bot_api(http_session: aiohttp.ClientSession, media_bytes: bytes, media_type: str, filename: str, mime_type: str, retries: int = 2) -> str | None:
    """Upload a file to Telegram Bot API and return the file_id.
    Sends the file to a temporary bot-accessible chat, then deletes the message.
    Raises FileTooLargeError on 413 so callers can skip without retrying."""
    if not BOT_TOKEN:
        log.warning("BOT_TOKEN not set, cannot upload via Bot API")
        return None

    if not BOT_UPLOAD_CHAT:
        log.warning("BOT_UPLOAD_CHAT not set, cannot upload via Bot API")
        return None

    bot_api = f"https://api.telegram.org/bot{BOT_TOKEN}"

    # Upload the file
    method_map = {
        "video": ("sendVideo", "video"),
        "photo": ("sendPhoto", "photo"),
        "document": ("sendDocument", "document"),
        "animation": ("sendAnimation", "animation"),
    }
    method, field = method_map.get(media_type, ("sendDocument", "document"))

    for attempt in range(1, retries + 1):
        form = aiohttp.FormData()
        form.add_field("chat_id", BOT_UPLOAD_CHAT)
        form.add_field(field, media_bytes, filename=filename, content_type=mime_type)

        try:
            async with bot_upload_semaphore:
                async with http_session.post(f"{bot_api}/{method}", data=form, timeout=aiohttp.ClientTimeout(total=180)) as resp:
                    result = await resp.json()
                    if not result.get("ok"):
                        err_desc = result.get('description', 'unknown')

                        # 413 / "Request Entity Too Large" — file exceeds 50MB Bot API limit.
                        # No point retrying; raise immediately so the caller can skip this item.
                        if resp.status == 413 or "too large" in err_desc.lower() or "entity too large" in err_desc.lower():
                            raise FileTooLargeError(f"File {filename} ({len(media_bytes)} bytes) exceeds Bot API limit: {err_desc}")

                        log.error(f"Bot API upload failed (attempt {attempt}/{retries}): {err_desc}")
                        if attempt < retries:
                            await asyncio.sleep(3)
                            continue
                        return None

                    msg_result = result["result"]
                    msg_id = msg_result["message_id"]

                    # Extract file_id from the result
                    file_id = None
                    if media_type == "video" and msg_result.get("video"):
                        file_id = msg_result["video"]["file_id"]
                    elif media_type == "photo" and msg_result.get("photo"):
                        file_id = msg_result["photo"][-1]["file_id"]
                    elif media_type == "animation" and msg_result.get("animation"):
                        file_id = msg_result["animation"]["file_id"]
                    elif msg_result.get("document"):
                        file_id = msg_result["document"]["file_id"]

                    # Delete the temporary message
                    try:
                        await http_session.post(
                            f"{bot_api}/deleteMessage",
                            json={"chat_id": BOT_UPLOAD_CHAT, "message_id": msg_id},
                        )
                    except Exception:
                        pass

                    if file_id:
                        log.info(f"Uploaded to Bot API, got file_id: {file_id[:20]}...")
                    return file_id
        except FileTooLargeError:
            raise  # propagate immediately — no retry
        except asyncio.TimeoutError:
            log.error(f"Bot API upload timed out (attempt {attempt}/{retries}) for {filename}")
            if attempt < retries:
                await asyncio.sleep(3)
                continue
            return None
        except Exception as e:
            log.error(f"Failed to upload via Bot API (attempt {attempt}/{retries}): {e}")
            if attempt < retries:
                await asyncio.sleep(3)
                continue
            return None

    return None


def get_channel_aliases(chat, chat_id: int | None = None) -> list[str]:
    """Return all known aliases for a chat, including numeric IDs for private channels."""
    aliases: list[str] = []
    seen: set[str] = set()

    for candidate_id in iter_channel_lookup_ids(chat, chat_id):
        for alias in RESOLVED_CHANNEL_ALIASES.get(candidate_id, set()):
            if alias not in seen:
                seen.add(alias)
                aliases.append(alias)

    if hasattr(chat, "username") and chat.username:
        for alias in (f"@{chat.username}", chat.username):
            if alias not in seen:
                seen.add(alias)
                aliases.append(alias)

    title = (getattr(chat, "title", None) or "").strip()
    normalized_title = normalize_channel_title(title)
    for alias in (title, normalized_title):
        if alias and alias not in seen:
            seen.add(alias)
            aliases.append(alias)

    fallback_id = getattr(chat, "id", None) or chat_id
    if fallback_id is not None:
        for alias in (str(fallback_id), f"-100{fallback_id}"):
            if alias not in seen:
                seen.add(alias)
                aliases.append(alias)

    return aliases


async def fetch_monitor_config(http_session: aiohttp.ClientSession) -> tuple[list[str], str]:
    """Fetch configured source channel handles and temp upload chat from the backend."""
    if not INGEST_URL or not INGEST_API_KEY:
        return [], ""

    try:
        async with http_session.get(
            INGEST_URL,
            params={"action": "list_source_channels"},
            headers={"Authorization": f"Bearer {INGEST_API_KEY}"},
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            body = await resp.json(content_type=None)
            if resp.status != 200:
                log.warning("Could not load source channels from backend: %s", body)
                return [], ""

            channels = body.get("source_channels") or []
            upload_chat = str(body.get("bot_upload_chat") or "").strip()
            return [str(channel).strip() for channel in channels if str(channel).strip()], upload_chat
    except Exception as e:
        log.warning(f"Failed to fetch source channels from backend: {e}")
        return [], ""


def merge_unique_channels(*channel_lists: list[str]) -> list[str]:
    """Merge channel lists while preserving order and removing duplicates."""
    merged: list[str] = []
    seen: set[str] = set()

    for channel_list in channel_lists:
        for channel in channel_list:
            normalized = channel.strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                merged.append(normalized)

    return merged


async def send_to_ingest(session: aiohttp.ClientSession, payload: dict) -> bool:
    """POST the message payload to the ingest-post edge function with retries/backoff."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {INGEST_API_KEY}",
    }

    for attempt in range(1, INGEST_RETRIES + 1):
        try:
            async with session.post(
                INGEST_URL,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=INGEST_TIMEOUT_SECONDS),
            ) as resp:
                body = await resp.text()
                if resp.status == 200:
                    log.info(f"✅ Ingested: {payload.get('source_channel_handle')} → {body}")
                    return True

                if resp.status in RETRYABLE_INGEST_STATUSES and attempt < INGEST_RETRIES:
                    delay = INGEST_RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    log.warning(
                        "⚠️ Ingest returned %s (attempt %s/%s), retrying in %.1fs: %s",
                        resp.status,
                        attempt,
                        INGEST_RETRIES,
                        delay,
                        body,
                    )
                    await asyncio.sleep(delay)
                    continue

                log.warning(f"⚠️ Ingest returned {resp.status}: {body}")
                return False
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            if attempt < INGEST_RETRIES:
                delay = INGEST_RETRY_BASE_DELAY * (2 ** (attempt - 1))
                log.warning(
                    "Ingest request failed (attempt %s/%s), retrying in %.1fs: %s",
                    attempt,
                    INGEST_RETRIES,
                    delay,
                    e,
                )
                await asyncio.sleep(delay)
                continue

            log.error(f"❌ Failed to send to ingest: {e}")
            return False

    return False


async def enqueue_ingest(payload: dict):
    """Queue payloads so message intake is not blocked by slow backend calls."""
    if ingest_queue is None:
        raise RuntimeError("Ingest queue not initialized")

    pending = ingest_queue.qsize()
    if pending >= max(100, INGEST_QUEUE_MAXSIZE // 2):
        log.warning("Ingest queue pressure: %s/%s payloads pending", pending, INGEST_QUEUE_MAXSIZE)

    await ingest_queue.put(payload)


async def ingest_worker(worker_id: int, session: aiohttp.ClientSession):
    """Drain queued ingest payloads with controlled concurrency."""
    while True:
        try:
            payload = await ingest_queue.get()
        except asyncio.CancelledError:
            break

        try:
            ok = await send_to_ingest(session, payload)
            if not ok:
                log.error(
                    "Worker %s dropped payload for %s (message_id=%s)",
                    worker_id,
                    payload.get("source_channel_handle"),
                    payload.get("message_id"),
                )
        finally:
            ingest_queue.task_done()


async def get_channel_handle(client: TelegramClient, chat, chat_id: int | None = None) -> str:
    """Extract configured handle, @username or numeric chat_id from a chat entity."""
    for candidate_id in iter_channel_lookup_ids(chat, chat_id):
        if candidate_id in RESOLVED_CHANNEL_HANDLES:
            return RESOLVED_CHANNEL_HANDLES[candidate_id]

    if MONITOR_CHANNELS:
        current_ids = set(iter_channel_lookup_ids(chat, chat_id))

        for configured_handle in MONITOR_CHANNELS:
            try:
                entity = await resolve_channel_entity(client, configured_handle)
                remember_resolved_channel(configured_handle, entity)

                chat_title = normalize_channel_title(getattr(chat, "title", None) or "")
                entity_title = normalize_channel_title(getattr(entity, "title", None) or "")
                matched_by_title = bool(chat_title and entity_title and chat_title == entity_title)

                if current_ids & get_entity_lookup_ids(entity) or matched_by_title:
                    remember_resolved_channel(configured_handle, chat)
                    log.info(
                        "Recovered source-channel mapping for %s -> %s%s",
                        sorted(current_ids),
                        configured_handle,
                        " (title match)" if matched_by_title else "",
                    )
                    return configured_handle
            except Exception as exc:
                log.debug("Failed to re-resolve %s during lookup recovery: %s", configured_handle, exc)

    if hasattr(chat, "username") and chat.username:
        return f"@{chat.username}"

    fallback_id = getattr(chat, "id", None) or chat_id
    if fallback_id is not None:
        log.warning(
            "Could not map chat ID %s back to a configured MONITOR_CHANNELS entry; sending numeric ID",
            fallback_id,
        )
        return str(fallback_id)

    return ""


async def get_media_payload(client: TelegramClient, http_session: aiohttp.ClientSession, message, media_type: str) -> dict:
    """Download media and return payload fields. Uses Bot API upload for large files.
    Returns empty dict if media cannot be attached (e.g. file too large)."""
    result = {}
    if media_type == "text" or not message.file:
        return result

    media_bytes = await download_and_get_bytes(client, message)
    if not media_bytes:
        return result

    filename = message.file.name or f"media.{message.file.ext or 'bin'}"
    mime_type = message.file.mime_type or "application/octet-stream"

    if BOT_TOKEN:
        try:
            file_id = await upload_to_bot_api(http_session, media_bytes, media_type, filename, mime_type)
            if file_id:
                result["media_file_id"] = file_id
                result["media_filename"] = filename
                result["media_mime"] = mime_type
                return result
        except FileTooLargeError as e:
            log.warning(f"⚠️ {e} — skipping media attachment entirely")
            return result  # return empty — caller will handle gracefully

        log.warning("Bot API upload failed for %s, falling back to base64 only for small files", filename)

    if len(media_bytes) <= MAX_BASE64_SIZE:
        log.info(f"Sending media as base64 fallback ({len(media_bytes)} bytes)")
        result["media_base64"] = base64.b64encode(media_bytes).decode("utf-8")
        result["media_filename"] = filename
        result["media_mime"] = mime_type
    else:
        log.warning(f"Media too large for base64 fallback ({len(media_bytes)} bytes), skipping media attachment")

    return result


async def prepare_media_item(client: TelegramClient, http_session: aiohttp.ClientSession, message, retries: int = 2) -> dict | None:
    """Prepare a single media item dict for the media_group payload with retry logic.
    Does NOT retry when the file exceeds the Bot API size limit (FileTooLargeError)."""
    media_type = classify_media(message)
    if media_type == "text":
        return None

    item = {
        "media_type": media_type,
        "text": message.text or message.message or "",
    }

    last_error = None
    async with group_item_semaphore:
        for attempt in range(1, retries + 1):
            try:
                media_payload = await get_media_payload(client, http_session, message, media_type)
                if media_payload:
                    item.update(media_payload)
                    return item
                last_error = "empty payload"
            except FileTooLargeError as e:
                # No point retrying — file will never fit in Bot API
                log.warning(f"⚠️ Skipping oversized media item (msg_id={message.id}): {e}")
                return None
            except Exception as e:
                last_error = str(e)

            if attempt < retries:
                log.warning(f"Media item prepare attempt {attempt} failed ({last_error}), retrying in 2s...")
                await asyncio.sleep(2)

    log.error(f"Failed to prepare media item after {retries} attempts: {last_error}")
    return None


async def flush_media_group(group_id: int, client: TelegramClient, http_session: aiohttp.ClientSession):
    """Send all buffered messages of a media group as one album."""
    async with media_group_lock:
        group = media_group_buffer.pop(group_id, None)

    if not group:
        return

    messages = group["messages"]
    handle = group["handle"]

    log.info(f"Flushing media group {group_id} with {len(messages)} items from {handle}")

    # Sort by message ID to preserve order
    messages.sort(key=lambda m: m.id)

    # Prepare all media items concurrently for speed
    tasks = [prepare_media_item(client, http_session, msg) for msg in messages]
    prepared = await asyncio.gather(*tasks)

    items = []
    group_caption = ""
    for i, item in enumerate(prepared):
        if item:
            if not group_caption and item.get("text"):
                group_caption = item["text"]
            items.append(item)
        else:
            log.warning(f"Media group {group_id}: item {i+1}/{len(messages)} (msg_id={messages[i].id}) failed to prepare")

    if not items:
        log.warning(f"No valid media items in group {group_id}")
        return

    # Check if any message in the group has inline buttons
    has_buttons = any(isinstance(m.reply_markup, ReplyInlineMarkup) for m in messages)

    first_message = messages[0]
    first_chat = await hydrate_chat_entity(client, await first_message.get_chat(), first_message.chat_id)
    base_payload = {
        "source_channel_handle": handle,
        "source_channel_aliases": get_channel_aliases(first_chat, first_message.chat_id),
        "source_channel_title": (getattr(first_chat, "title", None) or "").strip(),
        "message_id": first_message.id,
        "has_buttons": has_buttons,
    }

    if len(items) == 1:
        single_item = items[0]
        payload = {
            **base_payload,
            "text": group_caption or single_item.get("text", ""),
            "media_type": single_item["media_type"],
        }
        payload.update({key: value for key, value in single_item.items() if key != "text"})
        await enqueue_ingest(payload)
        return

    payload = {
        **base_payload,
        "text": group_caption,
        "media_type": "media_group",
        "media_group": items,
    }

    await enqueue_ingest(payload)


# ── Main ────────────────────────────────────────────────────────────

async def main():
    global BOT_UPLOAD_CHAT, ingest_queue

    if not API_ID or not API_HASH:
        log.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables")
        return
    if not INGEST_URL:
        log.error("Set INGEST_URL environment variable")
        return

    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.start(phone=PHONE)

    me = await client.get_me()
    log.info(f"Logged in as {me.first_name} (ID: {me.id})")

    connector = aiohttp.TCPConnector(
        limit=HTTP_CONNECTION_LIMIT,
        limit_per_host=HTTP_CONNECTIONS_PER_HOST,
        ttl_dns_cache=300,
        enable_cleanup_closed=True,
    )
    http_session = aiohttp.ClientSession(
        connector=connector,
        timeout=aiohttp.ClientTimeout(total=INGEST_TIMEOUT_SECONDS),
    )
    ingest_queue = asyncio.Queue(maxsize=INGEST_QUEUE_MAXSIZE)
    ingest_workers = [
        asyncio.create_task(ingest_worker(index + 1, http_session))
        for index in range(MAX_CONCURRENT_INGEST_REQUESTS)
    ]
    log.info(
        "Ingest pipeline ready: workers=%s, queue=%s, downloads=%s, uploads=%s",
        MAX_CONCURRENT_INGEST_REQUESTS,
        INGEST_QUEUE_MAXSIZE,
        MAX_CONCURRENT_MEDIA_DOWNLOADS,
        MAX_CONCURRENT_BOT_UPLOADS,
    )

    backend_channels, backend_upload_chat = await fetch_monitor_config(http_session)
    configured_channels = merge_unique_channels(MONITOR_CHANNELS, backend_channels)
    MONITOR_CHANNELS[:] = configured_channels
    if not BOT_UPLOAD_CHAT and backend_upload_chat:
        BOT_UPLOAD_CHAT = backend_upload_chat
        log.info(f"Using temporary upload chat: {BOT_UPLOAD_CHAT}")

    # Resolve monitored channels
    channel_ids = set()
    if configured_channels:
        log.info("Loaded %s monitored source channels", len(configured_channels))
        for handle in configured_channels:
            try:
                entity = await resolve_channel_entity(client, handle)
                channel_ids.update(get_entity_lookup_ids(entity))
                remember_resolved_channel(handle, entity)
                log.info(f"Monitoring: {handle} (IDs: {sorted(get_entity_lookup_ids(entity))})")
            except Exception as e:
                log.warning(f"Cannot resolve {handle}: {e}")
    else:
        log.warning("No source channels were loaded from MONITOR_CHANNELS or backend. Listening to ALL channels the user is in.")

    loop = asyncio.get_running_loop()

    @client.on(events.NewMessage(chats=list(channel_ids) if channel_ids else None))
    async def handler(event):
        message = event.message
        chat = await hydrate_chat_entity(client, await event.get_chat(), event.chat_id)

        # Only process channel posts
        if not event.is_channel:
            return

        handle = await get_channel_handle(client, chat, event.chat_id)
        media_type = classify_media(message)

        # Check if this message is part of a media group (album)
        if message.grouped_id:
            group_id = message.grouped_id
            log.info(f"Media group {group_id} item in {handle}: type={media_type}")

            async with media_group_lock:
                if group_id not in media_group_buffer:
                    media_group_buffer[group_id] = {
                        "messages": [],
                        "handle": handle,
                        "timer": None,
                    }

                media_group_buffer[group_id]["messages"].append(message)

                # Cancel existing timer and set a new one
                existing_timer = media_group_buffer[group_id].get("timer")
                if existing_timer:
                    existing_timer.cancel()

                # Set timer to flush after MEDIA_GROUP_WAIT seconds
                media_group_buffer[group_id]["timer"] = loop.call_later(
                    MEDIA_GROUP_WAIT,
                    lambda gid=group_id: asyncio.ensure_future(
                        flush_media_group(gid, client, http_session)
                    ),
                )
            return

        # Regular (non-grouped) message
        log.info(f"New post in {handle}: type={media_type}, text={message.text[:50] if message.text else '(no text)'}...")

        # Detect inline buttons (ads)
        has_buttons = isinstance(message.reply_markup, ReplyInlineMarkup)

        payload = {
            "source_channel_handle": handle,
            "source_channel_aliases": get_channel_aliases(chat, event.chat_id),
            "source_channel_title": (getattr(chat, "title", None) or "").strip(),
            "message_id": message.id,
            "text": message.text or message.message or "",
            "media_type": media_type,
            "has_buttons": has_buttons,
        }

        if media_type != "text" and message.file:
            media_payload = await get_media_payload(client, http_session, message, media_type)
            payload.update(media_payload)

        await enqueue_ingest(payload)

    log.info("🚀 Monitor is running. Press Ctrl+C to stop.")
    try:
        await client.run_until_disconnected()
    finally:
        if ingest_queue is not None:
            try:
                await asyncio.wait_for(ingest_queue.join(), timeout=30)
            except asyncio.TimeoutError:
                log.warning("Timed out while waiting for ingest queue to drain on shutdown")

        for worker in ingest_workers:
            worker.cancel()
        await asyncio.gather(*ingest_workers, return_exceptions=True)
        await http_session.close()


if __name__ == "__main__":
    asyncio.run(main())
