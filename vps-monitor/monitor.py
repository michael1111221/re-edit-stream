"""
Telegram Channel Monitor (MTProto / Telethon)
=============================================
Runs on a VPS to monitor source channels and forward new posts 
to the Lovable Cloud ingest-post edge function.

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
from datetime import datetime

from telethon import TelegramClient, events
from telethon.tl.types import (
    MessageMediaPhoto,
    MessageMediaDocument,
    DocumentAttributeVideo,
    DocumentAttributeAnimated,
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

# Channels to monitor — set via MONITOR_CHANNELS env var as comma-separated handles
# e.g. MONITOR_CHANNELS="@channel1,@channel2,@channel3"
# If empty, the script will fetch the list from the ingest endpoint
MONITOR_CHANNELS = [
    ch.strip() for ch in os.environ.get("MONITOR_CHANNELS", "").split(",") if ch.strip()
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("monitor")

# ── Helpers ─────────────────────────────────────────────────────────

def classify_media(message) -> tuple[str, str | None]:
    """Returns (media_type, file_id_or_none)."""
    if not message.media:
        return ("text", None)

    if isinstance(message.media, MessageMediaPhoto):
        return ("photo", None)

    if isinstance(message.media, MessageMediaDocument):
        doc = message.media.document
        if doc is None:
            return ("document", None)

        for attr in doc.attributes:
            if isinstance(attr, DocumentAttributeAnimated):
                return ("animation", None)
            if isinstance(attr, DocumentAttributeVideo):
                return ("video", None)

        return ("document", None)

    return ("text", None)


async def download_and_get_bytes(client: TelegramClient, message) -> bytes | None:
    """Download media to memory and return bytes."""
    if not message.media:
        return None
    try:
        return await client.download_media(message, bytes)
    except Exception as e:
        log.error(f"Failed to download media: {e}")
        return None


async def send_to_ingest(session: aiohttp.ClientSession, payload: dict):
    """POST the message payload to the ingest-post edge function."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {INGEST_API_KEY}",
    }

    try:
        async with session.post(INGEST_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            body = await resp.text()
            if resp.status == 200:
                log.info(f"✅ Ingested: {payload.get('source_channel_handle')} → {body}")
            else:
                log.warning(f"⚠️ Ingest returned {resp.status}: {body}")
    except Exception as e:
        log.error(f"❌ Failed to send to ingest: {e}")


def get_channel_handle(chat) -> str:
    """Extract @username or chat_id string from a chat entity."""
    if hasattr(chat, "username") and chat.username:
        return f"@{chat.username}"
    return str(chat.id)


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
                log.info(f"Monitoring: {handle} (ID: {entity.id})")
            except Exception as e:
                log.warning(f"Cannot resolve {handle}: {e}")
    else:
        log.warning("No MONITOR_CHANNELS set. Listening to ALL channels the user is in.")

    http_session = aiohttp.ClientSession()

    @client.on(events.NewMessage(chats=list(channel_ids) if channel_ids else None))
    async def handler(event):
        message = event.message
        chat = await event.get_chat()

        # Only process channel posts
        if not event.is_channel:
            return

        handle = get_channel_handle(chat)
        media_type, _ = classify_media(message)

        log.info(f"New post in {handle}: type={media_type}, text={message.text[:50] if message.text else '(no text)'}...")

        # For media, we need to upload it somewhere accessible.
        # Option 1: Download and send as base64 (for small files)
        # Option 2: Download to disk and upload to storage
        # For now, we send text + metadata; media_url will be handled by VPS file server
        
        payload = {
            "source_channel_handle": handle,
            "message_id": message.id,
            "text": message.text or message.message or "",
            "media_type": media_type,
        }

        # If there's media, download it and we'll need to handle it
        # For videos/photos, we can use the bot to forward if it has access,
        # or we download via MTProto and upload to a temporary URL
        if media_type != "text" and message.file:
            # Download media
            media_bytes = await download_and_get_bytes(client, message)
            if media_bytes:
                import base64
                # Send as base64 for the edge function to process
                # Note: for large files (>10MB), consider using storage upload instead
                if len(media_bytes) < 10 * 1024 * 1024:  # 10MB limit
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
