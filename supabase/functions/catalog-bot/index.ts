import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Catalog Bot - A separate Telegram bot that displays channel categories
 * Users can browse categories and find channels by topic.
 * 
 * Commands:
 * /start - Show welcome message with category buttons
 * 
 * Callback queries:
 * cat:{id} - Show channels in a category
 * back - Go back to categories
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const CATALOG_BOT_TOKEN = Deno.env.get("CATALOG_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!CATALOG_BOT_TOKEN) {
    return new Response(
      JSON.stringify({ error: "CATALOG_BOT_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const baseUrl = `${TELEGRAM_API}${CATALOG_BOT_TOKEN}`;

  try {
    const body = await req.json();
    const message = body.message;
    const callbackQuery = body.callback_query;

    if (message?.text === "/start") {
      await sendCategoriesMenu(supabase, baseUrl, message.chat.id);
    } else if (callbackQuery) {
      const data = callbackQuery.data;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      if (data === "back") {
        await editCategoriesMenu(supabase, baseUrl, chatId, messageId);
      } else if (data.startsWith("cat:")) {
        const categoryId = data.replace("cat:", "");
        await showCategoryChannels(supabase, baseUrl, chatId, messageId, categoryId);
      }

      // Answer callback to remove loading
      await fetch(`${baseUrl}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQuery.id }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Catalog bot error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getCategories(supabase: any) {
  const { data } = await supabase
    .from("catalog_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data || [];
}

async function buildCategoriesKeyboard(supabase: any) {
  const categories = await getCategories(supabase);
  // 2 buttons per row
  const keyboard: any[][] = [];
  for (let i = 0; i < categories.length; i += 2) {
    const row = [{ text: `${categories[i].icon} ${categories[i].name}`, callback_data: `cat:${categories[i].id}` }];
    if (categories[i + 1]) {
      row.push({ text: `${categories[i + 1].icon} ${categories[i + 1].name}`, callback_data: `cat:${categories[i + 1].id}` });
    }
    keyboard.push(row);
  }
  return keyboard;
}

async function sendCategoriesMenu(supabase: any, baseUrl: string, chatId: number) {
  const keyboard = await buildCategoriesKeyboard(supabase);

  if (keyboard.length === 0) {
    await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "👋 ברוכים הבאים!\n\nאין קטגוריות זמינות כרגע.",
      }),
    });
    return;
  }

  await fetch(`${baseUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "👋 ברוכים הבאים!\n\n📂 בחרו קטגוריה כדי לראות את הערוצים שלנו:",
      reply_markup: { inline_keyboard: keyboard },
    }),
  });
}

async function editCategoriesMenu(supabase: any, baseUrl: string, chatId: number, messageId: number) {
  const keyboard = await buildCategoriesKeyboard(supabase);

  await fetch(`${baseUrl}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: "📂 בחרו קטגוריה כדי לראות את הערוצים שלנו:",
      reply_markup: { inline_keyboard: keyboard },
    }),
  });
}

async function showCategoryChannels(
  supabase: any, baseUrl: string, chatId: number, messageId: number, categoryId: string
) {
  const { data: category } = await supabase
    .from("catalog_categories")
    .select("*")
    .eq("id", categoryId)
    .single();

  const { data: categoryChannels } = await supabase
    .from("catalog_category_channels")
    .select("*, channel:channels(*)")
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: true });

  const channels = categoryChannels?.map((cc: any) => cc.channel).filter(Boolean) || [];

  let text = `${category?.icon || "📁"} <b>${category?.name || "קטגוריה"}</b>\n`;
  if (category?.description) text += `${category.description}\n`;
  text += "\n";

  if (channels.length === 0) {
    text += "אין ערוצים בקטגוריה זו כרגע.";
  } else {
    channels.forEach((ch: any, i: number) => {
      const handle = ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`;
      text += `${i + 1}. <b>${ch.name}</b> — ${handle}\n`;
    });
  }

  // Channel link buttons
  const keyboard: any[][] = [];
  for (let i = 0; i < channels.length; i += 2) {
    const row: any[] = [];
    const ch1 = channels[i];
    const h1 = ch1.handle.replace("@", "");
    row.push({ text: ch1.name, url: `https://t.me/${h1}` });
    if (channels[i + 1]) {
      const ch2 = channels[i + 1];
      const h2 = ch2.handle.replace("@", "");
      row.push({ text: ch2.name, url: `https://t.me/${h2}` });
    }
    keyboard.push(row);
  }
  keyboard.push([{ text: "⬅️ חזרה", callback_data: "back" }]);

  await fetch(`${baseUrl}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    }),
  });
}
