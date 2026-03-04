import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Ingest Post Endpoint
 * 
 * Receives posts from an external MTProto client (running on VPS)
 * that monitors source channels the bot can't access.
 * 
 * Expected POST body:
 * {
 *   source_channel_handle: "@channelname",  // or chat_id as string
 *   message_id: 12345,                      // original message ID
 *   text: "Post text/caption",
 *   media_type: "video" | "photo" | "document" | "animation" | "text",
 *   media_file_id?: "...",                  // Telegram file_id if bot has access
 *   media_url?: "...",                      // Direct URL to media (from MTProto download)
 * }
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!BOT_TOKEN) {
    return new Response(
      JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const baseUrl = `${TELEGRAM_API}${BOT_TOKEN}`;

  try {
    const body = await req.json();
    const {
      source_channel_handle,
      message_id,
      text = "",
      media_type = "text",
      media_file_id,
      media_url,
    } = body;

    if (!source_channel_handle) {
      return new Response(
        JSON.stringify({ error: "source_channel_handle is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Ingest post from ${source_channel_handle}, type: ${media_type}`);

    // Find source channel
    const handle = source_channel_handle.startsWith("@")
      ? source_channel_handle
      : `@${source_channel_handle}`;
    const handleNoAt = handle.replace("@", "");

    const { data: sourceChannels } = await supabase
      .from("channels")
      .select("*")
      .eq("type", "source")
      .or(`handle.eq.${handle},handle.eq.${handleNoAt}`);

    const sourceChannel = sourceChannels?.[0];
    if (!sourceChannel) {
      return new Response(
        JSON.stringify({ error: `Source channel not found: ${handle}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find active mappings
    const { data: mappings } = await supabase
      .from("channel_mappings")
      .select("*, target_channel:channels!channel_mappings_target_channel_id_fkey(*)")
      .eq("source_channel_id", sourceChannel.id)
      .eq("is_active", true);

    if (!mappings || mappings.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active mappings for this source channel", forwarded: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: any[] = [];

    for (const mapping of mappings) {
      try {
        const result = await processMapping(
          supabase, baseUrl, mapping, text, media_type, media_file_id, media_url, LOVABLE_API_KEY
        );
        results.push({ mapping_id: mapping.id, target: mapping.target_channel?.handle, ...result });
      } catch (err: any) {
        console.error(`Error processing mapping ${mapping.id}:`, err);
        results.push({ mapping_id: mapping.id, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ forwarded: results.filter(r => r.success).length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Ingest error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processMapping(
  supabase: any,
  baseUrl: string,
  mapping: any,
  originalText: string,
  mediaType: string,
  mediaFileId?: string,
  mediaUrl?: string,
  lovableApiKey?: string
): Promise<{ success: boolean; error?: string }> {
  const targetChannel = mapping.target_channel;
  if (!targetChannel) {
    return { success: false, error: "Target channel not found" };
  }

  let processedText = originalText;

  // 1. Banned words filter
  if (mapping.filter_banned_words) {
    const { data: bannedWords } = await supabase
      .from("banned_words")
      .select("*")
      .or(`mapping_id.eq.${mapping.id},is_global.eq.true`);

    if (bannedWords && bannedWords.length > 0) {
      const lowerText = processedText.toLowerCase();

      // skip_post check
      for (const bw of bannedWords) {
        if (bw.action === "skip_post" && lowerText.includes(bw.word.toLowerCase())) {
          console.log(`Skipping post — banned word "${bw.word}"`);
          return { success: false, error: `Skipped: banned word "${bw.word}"` };
        }
      }

      // remove_word
      for (const bw of bannedWords) {
        if (bw.action === "remove_word") {
          const regex = new RegExp(escapeRegex(bw.word), "gi");
          processedText = processedText.replace(regex, "").trim();
        }
      }
    }
  }

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
      if (translated) processedText = translated;
    } catch (err) {
      console.error("Translation failed:", err);
    }
  }

  // 4. Signature
  if (mapping.add_signature && mapping.signature_text) {
    processedText = processedText + "\n\n" + mapping.signature_text;
  }

  // 5. Inline buttons
  let reply_markup: any = undefined;
  if (mapping.add_buttons && mapping.default_buttons) {
    const buttons = Array.isArray(mapping.default_buttons) ? mapping.default_buttons : [];
    if (buttons.length > 0) {
      reply_markup = {
        inline_keyboard: buttons.map((btn: any) => [{ text: btn.text, url: btn.url }]),
      };
    }
  }

  // 6. Send to target
  const targetChatId = targetChannel.handle.startsWith("@")
    ? targetChannel.handle
    : `@${targetChannel.handle}`;

  const baseBody: any = {
    chat_id: targetChatId,
    parse_mode: "HTML",
    ...(reply_markup ? { reply_markup } : {}),
  };

  let method = "sendMessage";
  let sendBody: any = { ...baseBody, text: processedText || "📎" };

  if (mediaType === "video" && (mediaFileId || mediaUrl)) {
    method = "sendVideo";
    sendBody = { ...baseBody, video: mediaFileId || mediaUrl, caption: processedText };
  } else if (mediaType === "photo" && (mediaFileId || mediaUrl)) {
    method = "sendPhoto";
    sendBody = { ...baseBody, photo: mediaFileId || mediaUrl, caption: processedText };
  } else if (mediaType === "document" && (mediaFileId || mediaUrl)) {
    method = "sendDocument";
    sendBody = { ...baseBody, document: mediaFileId || mediaUrl, caption: processedText };
  } else if (mediaType === "animation" && (mediaFileId || mediaUrl)) {
    method = "sendAnimation";
    sendBody = { ...baseBody, animation: mediaFileId || mediaUrl, caption: processedText };
  }

  const resp = await fetch(`${baseUrl}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sendBody),
  });

  const result = await resp.json();

  if (!result.ok) {
    console.error(`Telegram ${method} failed:`, result.description);
    return { success: false, error: result.description };
  }

  console.log(`Forwarded to ${targetChatId}`);

  // Log to videos table
  await supabase.from("videos").insert({
    title: (processedText || "Media post").substring(0, 100),
    source_channel_id: mapping.source_channel_id,
    target_channel_id: mapping.target_channel_id,
    status: "completed",
    progress: 100,
  });

  return { success: true };
}

async function translateText(text: string, targetLanguage: string, apiKey: string): Promise<string | null> {
  const langMap: Record<string, string> = {
    he: "Hebrew", en: "English", ar: "Arabic", ru: "Russian",
    fr: "French", es: "Spanish", de: "German", pt: "Portuguese",
  };
  const langName = langMap[targetLanguage] || targetLanguage;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: `Translate to ${langName}. Keep HTML tags, emojis, formatting. Return only translated text.` },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}