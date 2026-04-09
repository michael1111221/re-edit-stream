import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_API = "https://api.telegram.org/bot";

serve(async (req) => {
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
    console.log("Received update:", JSON.stringify(update).substring(0, 500));

    // Handle private bot commands only
    const message = update.message;
    if (!message?.text || message.chat.type !== "private") {
      return new Response("OK");
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // ── Owner verification ─────────────────────────────────────────
    // Only the bot owner (stored in system_settings as "bot_owner_chat_id")
    // can access sensitive commands. Non-owners get a generic message.
    const { data: ownerSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "bot_owner_chat_id")
      .maybeSingle();

    let ownerChatId: number | null = null;
    if (ownerSetting?.value) {
      const val = ownerSetting.value;
      if (typeof val === "number") ownerChatId = val;
      else if (typeof val === "string") ownerChatId = parseInt(val, 10);
      else if (typeof val === "object" && val !== null && "chat_id" in val) {
        ownerChatId = parseInt(String((val as any).chat_id), 10);
      }
    }

    const isOwner = ownerChatId !== null && chatId === ownerChatId;

    // /start is the only command available to everyone (sets owner on first use)
    if (text === "/start") {
      // If no owner is set yet, register the first user as owner
      if (ownerChatId === null) {
        await supabase
          .from("system_settings")
          .upsert({ key: "bot_owner_chat_id", value: chatId }, { onConflict: "key" });
        
        await sendTelegramMessage(baseUrl, chatId,
          "🤖 <b>ברוך הבא ל-TeleFlow Bot!</b>\n\n" +
          "✅ נרשמת כבעל הבוט.\n\n" +
          "הפקודות הזמינות:\n\n" +
          "/channels - רשימת ערוצים\n" +
          "/mappings - מיפויים פעילים\n" +
          "/stats - סטטיסטיקות\n" +
          "/scheduled - פרסומים מתוזמנים\n" +
          "/myid - הצג את ה-Chat ID שלך\n" +
          "/help - עזרה"
        );
      } else if (isOwner) {
        await sendTelegramMessage(baseUrl, chatId,
          "🤖 <b>ברוך הבא ל-TeleFlow Bot!</b>\n\n" +
          "הפקודות הזמינות:\n\n" +
          "/channels - רשימת ערוצים\n" +
          "/mappings - מיפויים פעילים\n" +
          "/stats - סטטיסטיקות\n" +
          "/scheduled - פרסומים מתוזמנים\n" +
          "/myid - הצג את ה-Chat ID שלך\n" +
          "/help - עזרה"
        );
      } else {
        await sendTelegramMessage(baseUrl, chatId,
          "🤖 <b>TeleFlow Bot</b>\n\n" +
          "⛔ אין לך הרשאה להשתמש בבוט זה."
        );
      }
      return new Response("OK");
    }

    // /myid is available to everyone
    if (text === "/myid") {
      await sendTelegramMessage(baseUrl, chatId, `🆔 ה-Chat ID שלך: <code>${chatId}</code>`);
      return new Response("OK");
    }

    // All other commands require owner verification
    if (!isOwner) {
      await sendTelegramMessage(baseUrl, chatId,
        "⛔ אין לך הרשאה להשתמש בפקודה זו."
      );
      return new Response("OK");
    }

    // ── Owner-only commands ────────────────────────────────────────
    if (text === "/channels") {
      const { data: channels } = await supabase.from("channels").select("*").order("type");
      if (!channels || channels.length === 0) {
        await sendTelegramMessage(baseUrl, chatId, "📢 אין ערוצים מוגדרים עדיין.");
      } else {
        const src = channels.filter((c: any) => c.type === "source");
        const tgt = channels.filter((c: any) => c.type === "target");
        let msg = "📢 <b>ערוצים מוגדרים:</b>\n\n";
        if (src.length) {
          msg += "🔵 <b>מקור:</b>\n";
          src.forEach((c: any) => { msg += `  ${c.status === "active" ? "🟢" : "🟡"} ${c.name} - ${c.handle}${c.is_owned ? "" : " (חיצוני)"}\n`; });
          msg += "\n";
        }
        if (tgt.length) {
          msg += "🟢 <b>יעד:</b>\n";
          tgt.forEach((c: any) => { msg += `  ${c.status === "active" ? "🟢" : "🟡"} ${c.name} - ${c.handle}\n`; });
        }
        await sendTelegramMessage(baseUrl, chatId, msg);
      }
    } else if (text === "/mappings") {
      const { data: mappings } = await supabase
        .from("channel_mappings")
        .select("*, source_channel:channels!channel_mappings_source_channel_id_fkey(name), target_channel:channels!channel_mappings_target_channel_id_fkey(name)")
        .eq("is_active", true);
      if (!mappings || mappings.length === 0) {
        await sendTelegramMessage(baseUrl, chatId, "🔗 אין מיפויים פעילים.");
      } else {
        let msg = "🔗 <b>מיפויים פעילים:</b>\n\n";
        mappings.forEach((m: any, i: number) => {
          const rules = [];
          if (m.remove_links) rules.push("🔗 הסרת קישורים");
          if (m.add_buttons) rules.push("🔘 כפתורים");
          if (m.auto_translate) rules.push("🌐 תרגום");
          if (m.add_signature) rules.push("✍️ חתימה");
          if (m.filter_banned_words) rules.push("🚫 סינון מילים");
          msg += `${i + 1}. ${m.source_channel?.name} ➜ ${m.target_channel?.name}\n   ${rules.join(" | ") || "ללא חוקים"}\n\n`;
        });
        await sendTelegramMessage(baseUrl, chatId, msg);
      }
    } else if (text === "/stats") {
      const { count: channelCount } = await supabase.from("channels").select("*", { count: "exact", head: true });
      const { count: videoCount } = await supabase.from("videos").select("*", { count: "exact", head: true });
      const { count: completedCount } = await supabase.from("videos").select("*", { count: "exact", head: true }).eq("status", "completed");
      const { count: scheduledCount } = await supabase.from("scheduled_posts").select("*", { count: "exact", head: true }).eq("published", false);
      const { count: mappingCount } = await supabase.from("channel_mappings").select("*", { count: "exact", head: true }).eq("is_active", true);
      await sendTelegramMessage(baseUrl, chatId,
        "📊 <b>סטטיסטיקות:</b>\n\n" +
        `📢 ערוצים: ${channelCount || 0}\n` +
        `🔗 מיפויים פעילים: ${mappingCount || 0}\n` +
        `🎬 סרטונים: ${videoCount || 0}\n` +
        `✅ הושלמו: ${completedCount || 0}\n` +
        `⏰ מתוזמנים: ${scheduledCount || 0}`
      );
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
        posts.forEach((p: any, i: number) => {
          const date = new Date(p.scheduled_for).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
          msg += `${i + 1}. <b>${p.title}</b>\n   📢 ${p.channel?.name || "—"} | 🕐 ${date}\n\n`;
        });
        await sendTelegramMessage(baseUrl, chatId, msg);
      }
    } else if (text === "/help") {
      await sendTelegramMessage(baseUrl, chatId,
        "ℹ️ <b>עזרה - TeleFlow Bot</b>\n\n" +
        "המערכת מורכבת משני חלקים:\n" +
        "1. <b>MTProto client</b> על VPS — מאזין לערוצי מקור חיצוניים\n" +
        "2. <b>Bot API</b> — מפרסם לערוצי היעד שלך\n\n" +
        "<b>פקודות:</b>\n" +
        "/channels - הצג ערוצים\n" +
        "/mappings - מיפויים פעילים\n" +
        "/stats - סטטיסטיקות\n" +
        "/scheduled - פרסומים מתוזמנים\n" +
        "/myid - הצג את ה-Chat ID שלך\n" +
        "/help - עזרה"
      );
    } else {
      await sendTelegramMessage(baseUrl, chatId, "🤷 לא הבנתי. נסה /help לרשימת פקודות.");
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
