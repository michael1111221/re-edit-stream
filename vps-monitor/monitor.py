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

# Channels to monitor — set via MONITOR_CHANNELS env var as comma-separated handles
MONITOR_CHANNELS = [
    ch.strip() for ch in os.environ.get("MONITOR_CHANNELS", "").split(",") if ch.strip()
]

# Resolved mapping from Telegram chat ID to the original configured handle/invite link
RESOLVED_CHANNEL_HANDLES: dict[int, str] = {}
# Additional aliases (normalized forms) for each resolved channel ID so private links keep matching.
RESOLVED_CHANNEL_ALIASES: dict[int, set[str]] = defaultdict(set)

# How long to wait for more messages in a media group before sending (seconds)
MEDIA_GROUP_WAIT = 1.5

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
        return await client.download_media(message, bytes)
    except Exception as e:
        log.error(f"Failed to download media: {e}")
        return None


async def upload_to_bot_api(http_session: aiohttp.ClientSession, media_bytes: bytes, media_type: str, filename: str, mime_type: str) -> str | None:
    """Upload a file to Telegram Bot API and return the file_id.
    Sends the file to Saved Messages (the bot's own chat) to obtain a file_id,
    then deletes the message."""
    if not BOT_TOKEN:
        log.warning("BOT_TOKEN not set, cannot upload via Bot API")
        return None

    bot_api = f"https://api.telegram.org/bot{BOT_TOKEN}"

    # Get bot's own chat_id
    try:
        async with http_session.get(f"{bot_api}/getMe") as resp:
            me_data = await resp.json()
            if not me_data.get("ok"):
                log.error(f"Bot getMe failed: {me_data}")
                return None
            bot_id = me_data["result"]["id"]
    except Exception as e:
        log.error(f"Failed to get bot info: {e}")
        return None

    # Upload the file
    method_map = {
        "video": ("sendVideo", "video"),
        "photo": ("sendPhoto", "photo"),
        "document": ("sendDocument", "document"),
        "animation": ("sendAnimation", "animation"),
    }
    method, field = method_map.get(media_type, ("sendDocument", "document"))

    form = aiohttp.FormData()
    form.add_field("chat_id", str(bot_id))
    form.add_field(field, media_bytes, filename=filename, content_type=mime_type)

    try:
        async with http_session.post(f"{bot_api}/{method}", data=form, timeout=aiohttp.ClientTimeout(total=120)) as resp:
            result = await resp.json()
            if not result.get("ok"):
                log.error(f"Bot API upload failed: {result.get('description')}")
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
                await http_session.post(f"{bot_api}/deleteMessage", json={"chat_id": bot_id, "message_id": msg_id})
            except Exception:
                pass

            if file_id:
                log.info(f"Uploaded to Bot API, got file_id: {file_id[:20]}...")
            return file_id
    except Exception as e:
        log.error(f"Failed to upload via Bot API: {e}")
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


async def fetch_source_channels(http_session: aiohttp.ClientSession) -> list[str]:
    """Fetch configured source channel handles from the backend."""
    if not INGEST_URL or not INGEST_API_KEY:
        return []

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
                return []

            channels = body.get("source_channels") or []
            return [str(channel).strip() for channel in channels if str(channel).strip()]
    except Exception as e:
        log.warning(f"Failed to fetch source channels from backend: {e}")
        return []


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


async def send_to_ingest(session: aiohttp.ClientSession, payload: dict):
    """POST the message payload to the ingest-post edge function."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {INGEST_API_KEY}",
    }

    try:
        async with session.post(INGEST_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=120)) as resp:
            body = await resp.text()
            if resp.status == 200:
                log.info(f"✅ Ingested: {payload.get('source_channel_handle')} → {body}")
            else:
                log.warning(f"⚠️ Ingest returned {resp.status}: {body}")
    except Exception as e:
        log.error(f"❌ Failed to send to ingest: {e}")


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
    """Download media and return payload fields. Uses Bot API upload for large files."""
    result = {}
    if media_type == "text" or not message.file:
        return result

    media_bytes = await download_and_get_bytes(client, message)
    if not media_bytes:
        return result

    filename = message.file.name or f"media.{message.file.ext or 'bin'}"
    mime_type = message.file.mime_type or "application/octet-stream"

    if BOT_TOKEN:
        file_id = await upload_to_bot_api(http_session, media_bytes, media_type, filename, mime_type)
        if file_id:
            result["media_file_id"] = file_id
            result["media_filename"] = filename
            result["media_mime"] = mime_type
            return result

        log.warning("Bot API upload failed for %s, falling back to base64 only for small files", filename)

    if len(media_bytes) <= MAX_BASE64_SIZE:
        log.info(f"Sending media as base64 fallback ({len(media_bytes)} bytes)")
        result["media_base64"] = base64.b64encode(media_bytes).decode("utf-8")
        result["media_filename"] = filename
        result["media_mime"] = mime_type
    else:
        log.warning(f"Media too large for base64 fallback ({len(media_bytes)} bytes), skipping media attachment")

    return result


async def prepare_media_item(client: TelegramClient, http_session: aiohttp.ClientSession, message) -> dict | None:
    """Prepare a single media item dict for the media_group payload."""
    media_type = classify_media(message)
    if media_type == "text":
        return None

    item = {
        "media_type": media_type,
        "text": message.text or message.message or "",
    }

    media_payload = await get_media_payload(client, http_session, message, media_type)
    item.update(media_payload)

    if not media_payload:
        return None

    return item


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

    # Prepare all media items
    items = []
    group_caption = ""
    for msg in messages:
        item = await prepare_media_item(client, http_session, msg)
        if item:
            # Only the first item should carry the caption
            if not group_caption and item.get("text"):
                group_caption = item["text"]
            items.append(item)

    if not items:
        log.warning(f"No valid media items in group {group_id}")
        return

    # Check if any message in the group has inline buttons
    has_buttons = any(isinstance(m.reply_markup, ReplyInlineMarkup) for m in messages)

    first_message = messages[0]
    first_chat = await hydrate_chat_entity(client, await first_message.get_chat(), first_message.chat_id)
    payload = {
        "source_channel_handle": handle,
        "source_channel_aliases": get_channel_aliases(first_chat, first_message.chat_id),
        "source_channel_title": (getattr(first_chat, "title", None) or "").strip(),
        "message_id": first_message.id,
        "text": group_caption,
        "media_type": "media_group",
        "media_group": items,
        "has_buttons": has_buttons,
    }

    await send_to_ingest(http_session, payload)


# ── Main ────────────────────────────────────────────────────────────

async def main():
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

    http_session = aiohttp.ClientSession()

    backend_channels = await fetch_source_channels(http_session)
    configured_channels = merge_unique_channels(MONITOR_CHANNELS, backend_channels)
    MONITOR_CHANNELS[:] = configured_channels

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

    loop = asyncio.get_event_loop()

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

        await send_to_ingest(http_session, payload)

    log.info("🚀 Monitor is running. Press Ctrl+C to stop.")
    await client.run_until_disconnected()
    await http_session.close()


if __name__ == "__main__":
    asyncio.run(main())
