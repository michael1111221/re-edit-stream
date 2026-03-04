import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_API = "https://api.telegram.org/bot";

serve(async (req) => {
  // Webhook receives POST from Telegram
  if (req.method !== "POST") {
    return new Response("OK");
  }

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!BOT_TOKEN) {
    return new Response("OK");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const baseUrl = `${TELEGRAM_API}${BOT_TOKEN}`;

  try {
    const update = await req.json();
    console.log("Received update:", JSON.stringify(update));

    // Handle commands
    const message = update.message;
    if (!message?.text) return new Response("OK");

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Only respond to private messages (DM with bot)
    if (message.chat.type !== "private") return new Response("OK");

    if (text === "/start") {
      await sendTelegramMessage(baseUrl, chatId,
        "🤖 <b>ברוך הבא ל-TeleFlow Bot!</b>\n\n" +
        "הפקודות הזמינות:\n\n" +
        "/channels - רשימת ערוצים\n" +
        "/stats - סטטיסטיקות\n" +
        "/scheduled - פרסומים מתוזמנים\n" +
        "/help - עזרה"
      );
    } else if (text === "/channels") {
      const { data: channels } = await supabase.from("channels").select("*").order("type");
      if (!channels || channels.length === 0) {
        await sendTelegramMessage(baseUrl, chatId, "📢 אין ערוצים מוגדרים עדיין.");
      } else {
        const sourceChannels = channels.filter(c => c.type === "source");
        const targetChannels = channels.filter(c => c.type === "target");

        let msg = "📢 <b>ערוצים מוגדרים:</b>\n\n";
        if (sourceChannels.length > 0) {
          msg += "🔵 <b>מקור:</b>\n";
          sourceChannels.forEach(c => {
            const status = c.status === "active" ? "🟢" : "🟡";
            const owned = c.is_owned ? "" : " (חיצוני)";
            msg += `  ${status} ${c.name} - ${c.handle}${owned}\n`;
          });
          msg += "\n";
        }
        if (targetChannels.length > 0) {
          msg += "🟢 <b>יעד:</b>\n";
          targetChannels.forEach(c => {
            const status = c.status === "active" ? "🟢" : "🟡";
            msg += `  ${status} ${c.name} - ${c.handle}\n`;
          });
        }
        await sendTelegramMessage(baseUrl, chatId, msg);
      }
    } else if (text === "/stats") {
      const { count: channelCount } = await supabase.from("channels").select("*", { count: "exact", head: true });
      const { count: videoCount } = await supabase.from("videos").select("*", { count: "exact", head: true });
      const { count: completedCount } = await supabase.from("videos").select("*", { count: "exact", head: true }).eq("status", "completed");
      const { count: scheduledCount } = await supabase.from("scheduled_posts").select("*", { count: "exact", head: true }).eq("published", false);

      const msg =
        "📊 <b>סטטיסטיקות:</b>\n\n" +
        `📢 ערוצים: ${channelCount || 0}\n` +
        `🎬 סרטונים: ${videoCount || 0}\n` +
        `✅ הושלמו: ${completedCount || 0}\n` +
        `⏰ מתוזמנים: ${scheduledCount || 0}`;

      await sendTelegramMessage(baseUrl, chatId, msg);
    } else if (text === "/scheduled") {
      const { data: posts } = await supabase
        .from("scheduled_posts")
        .select("*, channel:channels(name, handle)")
        .eq("published", false)
        .order("scheduled_for", { ascending: true })
        .limit(10);

      if (!posts || posts.length === 0) {
        await sendTelegramMessage(baseUrl, chatId, "⏰ אין פרסומים מתוזמנים.");
      } else {
        let msg = "⏰ <b>פרסומים מתוזמנים:</b>\n\n";
        posts.forEach((p, i) => {
          const date = new Date(p.scheduled_for).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
          const chName = (p.channel as any)?.name || "—";
          msg += `${i + 1}. <b>${p.title}</b>\n   📢 ${chName} | 🕐 ${date}\n\n`;
        });
        await sendTelegramMessage(baseUrl, chatId, msg);
      }
    } else if (text === "/help") {
      await sendTelegramMessage(baseUrl, chatId,
        "ℹ️ <b>עזרה - TeleFlow Bot</b>\n\n" +
        "הבוט הזה מאפשר לך לנהל את מערכת TeleFlow ישירות מטלגרם.\n\n" +
        "<b>פקודות:</b>\n" +
        "/channels - הצג את כל הערוצים\n" +
        "/stats - הצג סטטיסטיקות\n" +
        "/scheduled - הצג פרסומים מתוזמנים\n" +
        "/help - הצג עזרה זו\n\n" +
        "לניהול מתקדם, השתמש בממשק הוויב 🖥️"
      );
    } else {
      await sendTelegramMessage(baseUrl, chatId,
        "🤷 לא הבנתי. נסה /help לרשימת פקודות."
      );
    }

    return new Response("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("OK");
  }
});

async function sendTelegramMessage(baseUrl: string, chatId: number, text: string) {
  await fetch(`${baseUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}
