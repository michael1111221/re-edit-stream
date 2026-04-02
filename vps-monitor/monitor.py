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
from telethon.tl.types import (
    MessageMediaPhoto,
    MessageMediaDocument,
    DocumentAttributeVideo,
    DocumentAttributeAnimated,
    ReplyInlineMarkup,
)
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

# Max file size to send as base64 (5MB). Larger files go through Bot API upload.
MAX_BASE64_SIZE = 5 * 1024 * 1024

# ── Helpers ─────────────────────────────────────────────────────────

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


def get_channel_handle(chat) -> str:
    """Extract configured handle, @username or numeric chat_id from a chat entity."""
    if chat.id in RESOLVED_CHANNEL_HANDLES:
        return RESOLVED_CHANNEL_HANDLES[chat.id]
    if hasattr(chat, "username") and chat.username:
        return f"@{chat.username}"
    return str(chat.id)


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

    if len(media_bytes) <= MAX_BASE64_SIZE:
        result["media_base64"] = base64.b64encode(media_bytes).decode("utf-8")
        result["media_filename"] = filename
        result["media_mime"] = mime_type
    else:
        log.info(f"Large file ({len(media_bytes)} bytes), uploading via Bot API...")
        file_id = await upload_to_bot_api(http_session, media_bytes, media_type, filename, mime_type)
        if file_id:
            result["media_file_id"] = file_id
        else:
            log.warning(f"Bot API upload failed, skipping media ({len(media_bytes)} bytes)")

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
        item = await prepare_media_item(client, msg)
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

        payload = {
            "source_channel_handle": handle,
            "message_id": messages[0].id,
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

    # Resolve monitored channels
    channel_ids = set()
    if MONITOR_CHANNELS:
        for handle in MONITOR_CHANNELS:
            try:
                entity = await client.get_entity(handle)
                channel_ids.add(entity.id)
                RESOLVED_CHANNEL_HANDLES[entity.id] = handle
                log.info(f"Monitoring: {handle} (ID: {entity.id})")
            except Exception as e:
                log.warning(f"Cannot resolve {handle}: {e}")
    else:
        log.warning("No MONITOR_CHANNELS set. Listening to ALL channels the user is in.")

    http_session = aiohttp.ClientSession()
    loop = asyncio.get_event_loop()

    @client.on(events.NewMessage(chats=list(channel_ids) if channel_ids else None))
    async def handler(event):
        message = event.message
        chat = await event.get_chat()

        # Only process channel posts
        if not event.is_channel:
            return

        handle = get_channel_handle(chat)
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
            "message_id": message.id,
            "text": message.text or message.message or "",
            "media_type": media_type,
            "has_buttons": has_buttons,
        }

        if media_type != "text" and message.file:
            media_bytes = await download_and_get_bytes(client, message)
            if media_bytes:
                if len(media_bytes) < 10 * 1024 * 1024:
                    payload["media_base64"] = base64.b64encode(media_bytes).decode("utf-8")
                    payload["media_filename"] = message.file.name or f"media.{message.file.ext or 'bin'}"
                    payload["media_mime"] = message.file.mime_type or "application/octet-stream"
                else:
                    log.warning(f"Media too large ({len(media_bytes)} bytes), skipping media attachment")

        await send_to_ingest(http_session, payload)

    log.info("🚀 Monitor is running. Press Ctrl+C to stop.")
    await client.run_until_disconnected()
    await http_session.close()


if __name__ == "__main__":
    asyncio.run(main())
