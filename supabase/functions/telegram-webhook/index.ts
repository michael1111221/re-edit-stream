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
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!BOT_TOKEN) {
    return new Response("OK");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const baseUrl = `${TELEGRAM_API}${BOT_TOKEN}`;

  try {
    const update = await req.json();
    console.log("Received update:", JSON.stringify(update).substring(0, 500));

    // Handle channel posts (new messages in channels)
    const channelPost = update.channel_post;
    if (channelPost) {
      await handleChannelPost(supabase, baseUrl, channelPost, LOVABLE_API_KEY);
      return new Response("OK");
    }

    // Handle private bot commands
    const message = update.message;
    if (message?.text && message.chat.type === "private") {
      await handleBotCommand(supabase, baseUrl, message);
    }

    return new Response("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("OK");
  }
});

// ============ Channel Post Forwarding ============

async function handleChannelPost(
  supabase: any,
  baseUrl: string,
  post: any,
  lovableApiKey: string | undefined
) {
  const sourceChatId = String(post.chat.id);
  const sourceUsername = post.chat.username ? `@${post.chat.username}` : null;

  console.log(`Channel post from: ${sourceChatId} (${sourceUsername})`);

  // Find source channel by handle or chat_id
  let sourceChannel: any = null;
  if (sourceUsername) {
    const { data } = await supabase
      .from("channels")
      .select("*")
      .eq("type", "source")
      .or(`handle.eq.${sourceUsername},handle.eq.${sourceUsername.replace("@", "")}`)
      .limit(1);
    sourceChannel = data?.[0];
  }

  if (!sourceChannel) {
    console.log("Source channel not found in DB, skipping");
    return;
  }

  // Find active mappings for this source channel
  const { data: mappings } = await supabase
    .from("channel_mappings")
    .select("*, target_channel:channels!channel_mappings_target_channel_id_fkey(*)")
    .eq("source_channel_id", sourceChannel.id)
    .eq("is_active", true);

  if (!mappings || mappings.length === 0) {
    console.log("No active mappings for this source channel");
    return;
  }

  console.log(`Found ${mappings.length} active mappings`);

  // Get the caption/text from the post
  const originalText = post.caption || post.text || "";

  for (const mapping of mappings) {
    try {
      await processMapping(supabase, baseUrl, post, mapping, originalText, lovableApiKey);
    } catch (err) {
      console.error(`Error processing mapping ${mapping.id}:`, err);
    }
  }
}

async function processMapping(
  supabase: any,
  baseUrl: string,
  post: any,
  mapping: any,
  originalText: string,
  lovableApiKey: string | undefined
) {
  const targetChannel = mapping.target_channel;
  if (!targetChannel) {
    console.error("Target channel not found for mapping", mapping.id);
    return;
  }

  // 1. Check banned words — skip_post
  if (mapping.filter_banned_words) {
    const { data: bannedWords } = await supabase
      .from("banned_words")
      .select("*")
      .or(`mapping_id.eq.${mapping.id},is_global.eq.true`);

    if (bannedWords && bannedWords.length > 0) {
      // Check for skip_post words first
      const skipWords = bannedWords.filter((bw: any) => bw.action === "skip_post");
      const lowerText = originalText.toLowerCase();
      for (const sw of skipWords) {
        if (lowerText.includes(sw.word.toLowerCase())) {
          console.log(`Skipping post — banned word "${sw.word}" found`);
          return; // Skip entire post
        }
      }

      // Remove banned words
      const removeWords = bannedWords.filter((bw: any) => bw.action === "remove_word");
      for (const rw of removeWords) {
        const regex = new RegExp(escapeRegex(rw.word), "gi");
        originalText = originalText.replace(regex, "").trim();
      }
    }
  }

  let processedText = originalText;

  // 2. Remove links
  if (mapping.remove_links) {
    processedText = processedText
      .replace(/https?:\/\/[^\s<]+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // 3. Auto-translate
  if (mapping.auto_translate && lovableApiKey && processedText.trim()) {
    try {
      const translated = await translateText(processedText, mapping.target_language, lovableApiKey);
      if (translated) {
        processedText = translated;
      }
    } catch (err) {
      console.error("Translation failed:", err);
    }
  }

  // 4. Add signature
  if (mapping.add_signature && mapping.signature_text) {
    processedText = processedText + "\n\n" + mapping.signature_text;
  }

  // 5. Build inline buttons
  let reply_markup: any = undefined;
  if (mapping.add_buttons && mapping.default_buttons) {
    const buttons = Array.isArray(mapping.default_buttons) ? mapping.default_buttons : [];
    if (buttons.length > 0) {
      reply_markup = {
        inline_keyboard: buttons.map((btn: any) => [
          { text: btn.text, url: btn.url },
        ]),
      };
    }
  }

  // 6. Send to target channel
  const targetChatId = targetChannel.handle.startsWith("@")
    ? targetChannel.handle
    : `@${targetChannel.handle}`;

  // Determine what type of content to forward
  if (post.video) {
    await sendToTelegram(baseUrl, "sendVideo", {
      chat_id: targetChatId,
      video: post.video.file_id,
      caption: processedText,
      parse_mode: "HTML",
      ...(reply_markup ? { reply_markup } : {}),
    });
  } else if (post.photo) {
    const photo = post.photo[post.photo.length - 1]; // Largest photo
    await sendToTelegram(baseUrl, "sendPhoto", {
      chat_id: targetChatId,
      photo: photo.file_id,
      caption: processedText,
      parse_mode: "HTML",
      ...(reply_markup ? { reply_markup } : {}),
    });
  } else if (post.document) {
    await sendToTelegram(baseUrl, "sendDocument", {
      chat_id: targetChatId,
      document: post.document.file_id,
      caption: processedText,
      parse_mode: "HTML",
      ...(reply_markup ? { reply_markup } : {}),
    });
  } else if (post.animation) {
    await sendToTelegram(baseUrl, "sendAnimation", {
      chat_id: targetChatId,
      animation: post.animation.file_id,
      caption: processedText,
      parse_mode: "HTML",
      ...(reply_markup ? { reply_markup } : {}),
    });
  } else if (processedText) {
    await sendToTelegram(baseUrl, "sendMessage", {
      chat_id: targetChatId,
      text: processedText,
      parse_mode: "HTML",
      ...(reply_markup ? { reply_markup } : {}),
    });
  }

  console.log(`Forwarded post to ${targetChatId} via mapping ${mapping.id}`);

  // Log to videos table
  await supabase.from("videos").insert({
    title: (processedText || "Media post").substring(0, 100),
    source_channel_id: mapping.source_channel_id,
    target_channel_id: mapping.target_channel_id,
    status: "completed",
    progress: 100,
  });
}

// ============ Translation ============

async function translateText(
  text: string,
  targetLanguage: string,
  apiKey: string
): Promise<string | null> {
  const languageMap: Record<string, string> = {
    he: "Hebrew", en: "English", ar: "Arabic", ru: "Russian",
    fr: "French", es: "Spanish", de: "German", pt: "Portuguese",
  };
  const langName = languageMap[targetLanguage] || targetLanguage;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a translator. Translate to ${langName}. Keep HTML tags, emojis, and formatting. Return only the translated text.`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    console.error("Translation API error:", response.status);
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

// ============ Bot Commands (DM) ============

async function handleBotCommand(supabase: any, baseUrl: string, message: any) {
  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === "/start") {
    await sendTelegramMessage(baseUrl, chatId,
      "🤖 <b>ברוך הבא ל-TeleFlow Bot!</b>\n\n" +
      "הפקודות הזמינות:\n\n" +
      "/channels - רשימת ערוצים\n" +
      "/mappings - מיפויים פעילים\n" +
      "/stats - סטטיסטיקות\n" +
      "/scheduled - פרסומים מתוזמנים\n" +
      "/help - עזרה"
    );
  } else if (text === "/channels") {
    const { data: channels } = await supabase.from("channels").select("*").order("type");
    if (!channels || channels.length === 0) {
      await sendTelegramMessage(baseUrl, chatId, "📢 אין ערוצים מוגדרים עדיין.");
    } else {
      const sourceChannels = channels.filter((c: any) => c.type === "source");
      const targetChannels = channels.filter((c: any) => c.type === "target");

      let msg = "📢 <b>ערוצים מוגדרים:</b>\n\n";
      if (sourceChannels.length > 0) {
        msg += "🔵 <b>מקור:</b>\n";
        sourceChannels.forEach((c: any) => {
          const status = c.status === "active" ? "🟢" : "🟡";
          const owned = c.is_owned ? "" : " (חיצוני)";
          msg += `  ${status} ${c.name} - ${c.handle}${owned}\n`;
        });
        msg += "\n";
      }
      if (targetChannels.length > 0) {
        msg += "🟢 <b>יעד:</b>\n";
        targetChannels.forEach((c: any) => {
          const status = c.status === "active" ? "🟢" : "🟡";
          msg += `  ${status} ${c.name} - ${c.handle}\n`;
        });
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
        const chName = p.channel?.name || "—";
        msg += `${i + 1}. <b>${p.title}</b>\n   📢 ${chName} | 🕐 ${date}\n\n`;
      });
      await sendTelegramMessage(baseUrl, chatId, msg);
    }
  } else if (text === "/help") {
    await sendTelegramMessage(baseUrl, chatId,
      "ℹ️ <b>עזרה - TeleFlow Bot</b>\n\n" +
      "הבוט מאזין אוטומטית לפוסטים חדשים בערוצי המקור ומעביר אותם לערוצי היעד לפי המיפויים שהגדרת.\n\n" +
      "<b>פקודות:</b>\n" +
      "/channels - הצג ערוצים\n" +
      "/mappings - הצג מיפויים פעילים\n" +
      "/stats - סטטיסטיקות\n" +
      "/scheduled - פרסומים מתוזמנים\n" +
      "/help - עזרה\n\n" +
      "<b>⚠️ ודא שהבוט אדמין בכל הערוצים!</b>"
    );
  } else {
    await sendTelegramMessage(baseUrl, chatId, "🤷 לא הבנתי. נסה /help לרשימת פקודות.");
  }
}

// ============ Helpers ============

async function sendTelegramMessage(baseUrl: string, chatId: number, text: string) {
  await fetch(`${baseUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function sendToTelegram(baseUrl: string, method: string, body: any) {
  const resp = await fetch(`${baseUrl}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await resp.json();
  if (!result.ok) {
    console.error(`Telegram ${method} failed:`, result.description);
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}