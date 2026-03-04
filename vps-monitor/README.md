# Telegram Channel Monitor (VPS)

סקריפט Python שרץ על שרת VPS ומנטר ערוצי מקור באמצעות חשבון משתמש טלגרם (MTProto).
כשמגיע פוסט חדש, הוא נשלח ל-Edge Function `ingest-post` לעיבוד והעברה.

## דרישות

- Python 3.10+
- חשבון טלגרם (לא בוט) עם גישה לערוצי המקור
- API ID + API Hash מ-[my.telegram.org](https://my.telegram.org/apps)

## התקנה

```bash
pip install -r requirements.txt
```

## הגדרות סביבה

```bash
export TELEGRAM_API_ID="12345678"
export TELEGRAM_API_HASH="abcdef1234567890abcdef"
export TELEGRAM_PHONE="+972501234567"
export INGEST_URL="https://vpgcvasbkbjdhbstimmz.supabase.co/functions/v1/ingest-post"
export INGEST_API_KEY="your-secret-key-here"
export MONITOR_CHANNELS="@source_channel1,@source_channel2"
```

## הרצה

```bash
python monitor.py
```

בהרצה ראשונה, Telethon יבקש קוד אימות SMS/Telegram.
לאחר מכן יישמר קובץ session ולא יידרש אימות חוזר.

## הרצה כ-Service (systemd)

```ini
# /etc/systemd/system/tg-monitor.service
[Unit]
Description=Telegram Channel Monitor
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/vps-monitor
EnvironmentFile=/home/ubuntu/vps-monitor/.env
ExecStart=/usr/bin/python3 monitor.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable tg-monitor
sudo systemctl start tg-monitor
sudo journalctl -u tg-monitor -f  # צפייה בלוגים
```
