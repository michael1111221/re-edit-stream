import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Ingest Post Endpoint
 * 
 * Receives posts from an external MTProto client (running locally)
 * that monitors source channels the bot can't access.
 * 
 * Supports single media and media groups (albums).
 * 
 * Auth: Bearer token must match INGEST_API_KEY secret.
 * 
 * Expected POST body (single):
 * {
 *   source_channel_handle: "@channelname",
 *   message_id: 12345,
 *   text: "Post text/caption",
 *   media_type: "video" | "photo" | "document" | "animation" | "text",
 *   media_base64?: "...",
 *   media_filename?: "...",
 *   media_mime?: "...",
 * }
 * 
 * Expected POST body (media group / album):
 * {
 *   source_channel_handle: "@channelname",
 *   message_id: 12345,
 *   text: "Album caption",
 *   media_type: "media_group",
 *   media_group: [
 *     { media_type: "photo", media_base64: "...", media_filename: "...", media_mime: "..." },
 *     { media_type: "photo", media_base64: "...", media_filename: "...", media_mime: "..." },
 *   ]
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
  const INGEST_API_KEY = Deno.env.get("INGEST_API_KEY");

  // Auth check
  if (INGEST_API_KEY) {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token !== INGEST_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  if (!BOT_TOKEN) {
    return new Response(
      JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const baseUrl = `${TELEGRAM_API}${BOT_TOKEN}`;

  const listSourceChannels = async () => {
    const { data, error } = await supabase
      .from("channels")
      .select("handle")
      .eq("type", "source")
      .eq("status", "active");

    const { data: uploadSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "bot_upload_chat")
      .maybeSingle();

    const { data: fallbackUploadChannel } = await supabase
      .from("channels")
      .select("handle")
      .eq("type", "target")
      .eq("status", "active")
      .eq("is_owned", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settingValue = uploadSetting?.value;
    const botUploadChat = typeof settingValue === "string"
      ? settingValue.trim()
      : typeof settingValue === "object" && settingValue && "handle" in settingValue && typeof settingValue.handle === "string"
        ? settingValue.handle.trim()
        : typeof settingValue === "object" && settingValue && "chat_id" in settingValue && typeof settingValue.chat_id === "string"
          ? settingValue.chat_id.trim()
          : String(fallbackUploadChannel?.handle || "").trim();

    return new Response(
      JSON.stringify({
        source_channels: (data ?? []).map((channel) => channel.handle).filter(Boolean),
        bot_upload_chat: botUploadChat,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  };

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "list_source_channels") {
      return await listSourceChannels();
    }

    return new Response(
      JSON.stringify({ error: "Unsupported GET request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const {
      source_channel_handle,
      source_channel_aliases = [],
      source_channel_title = "",
      message_id,
      text = "",
      media_type = "text",
      media_file_id,
      media_url,
      media_base64,
      media_filename,
      media_mime,
      media_group,
      has_buttons = false,
    } = body;

    if (!source_channel_handle) {
      return new Response(
        JSON.stringify({ error: "source_channel_handle is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Ingest post from ${source_channel_handle}, type: ${media_type}`);

    const normalizeChannelReference = (value: string) => {
      const trimmed = String(value || "").trim().replace(/\/$/, "");
      if (!trimmed) return "";

      const inviteMatch = trimmed.match(/(?:t\.me|telegram\.me)\/(?:joinchat\/|\+)([^/?#]+)/i) || trimmed.match(/^\+([^/?#]+)/);
      if (inviteMatch?.[1]) return inviteMatch[1];

      return trimmed
        .replace(/^https?:\/\/(?:t\.me|telegram\.me)\//i, "")
        .replace(/^@/, "")
        .trim();
    };

    const normalizeChannelTitle = (value: string) => String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();

    // Find source channel
    const rawSourceHandle = String(source_channel_handle).trim();
    const rawAliases = Array.isArray(source_channel_aliases) ? source_channel_aliases.map((value) => String(value ?? "").trim()).filter(Boolean) : [];
    const candidateInputs = [rawSourceHandle, ...rawAliases.map((value) => String(value || "").trim())]
      .filter(Boolean);

    const exactCandidates = Array.from(new Set(candidateInputs.flatMap((value) => {
      const normalized = normalizeChannelReference(value);
      const isNumeric = /^-?\d+$/.test(value) || /^-?\d+$/.test(normalized);
      return [
        value,
        normalized,
        value.startsWith("@") || value.startsWith("http") ? value : isNumeric ? value : `@${value}`,
        normalized && !normalized.startsWith("@") && !/^\d+$/.test(normalized) ? `@${normalized}` : normalized,
      ].filter(Boolean);
    })));

    let sourceChannel: any = null;
    const { data: exactSourceChannels } = await supabase
      .from("channels")
      .select("*")
      .eq("type", "source")
      .in("handle", exactCandidates);

    sourceChannel = exactSourceChannels?.[0] ?? null;

    if (!sourceChannel) {
      const { data: allSourceChannels } = await supabase
        .from("channels")
        .select("*")
        .eq("type", "source");

      const normalizedCandidates = new Set(exactCandidates.map(normalizeChannelReference).filter(Boolean));
      const normalizedTitleCandidates = new Set([
        normalizeChannelTitle(source_channel_title),
        ...exactCandidates.map(normalizeChannelTitle),
      ].filter(Boolean));

      sourceChannel = allSourceChannels?.find((channel: any) => {
        const storedHandle = String(channel.handle || "").trim();
        const normalizedStoredHandle = normalizeChannelReference(storedHandle);
        const storedName = String(channel.name || "").trim();
        const normalizedStoredName = normalizeChannelTitle(storedName);

        return normalizedCandidates.has(storedHandle)
          || normalizedCandidates.has(normalizedStoredHandle)
          || (normalizedStoredName && normalizedTitleCandidates.has(normalizedStoredName));
      }) ?? null;
    }

    if (!sourceChannel) {
      return new Response(
        JSON.stringify({ error: `Source channel not found: ${rawSourceHandle}`, aliases: exactCandidates }),
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

    // Update channel video count
    await supabase
      .from("channels")
      .update({ video_count: sourceChannel.video_count + 1 })
      .eq("id", sourceChannel.id);

    const results: any[] = [];

    for (const mapping of mappings) {
      try {
        // Filter posts with buttons (ads)
        if (has_buttons && mapping.filter_buttons) {
          console.log(`Skipping post with buttons for mapping ${mapping.id} (filter_buttons enabled)`);
          results.push({ mapping_id: mapping.id, target: mapping.target_channel?.handle, success: false, error: "Filtered: post has buttons (ad)" });
          continue;
        }

        let result;
        if (media_type === "media_group" && Array.isArray(media_group)) {
          result = await processMediaGroup(
            supabase, baseUrl, mapping, text, media_group, LOVABLE_API_KEY
          );
        } else {
          result = await processMapping(
            supabase, baseUrl, mapping, text, media_type,
            media_base64, media_filename, media_mime,
            media_file_id, media_url, LOVABLE_API_KEY
          );
        }
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

// ── Process text for a mapping (shared logic) ──────────────────────

async function processText(
  supabase: any,
  mapping: any,
  originalText: string,
  lovableApiKey?: string
): Promise<string> {
  let processedText = originalText;

  // 1. Banned words filter
  if (mapping.filter_banned_words) {
    const { data: bannedWords } = await supabase
      .from("banned_words")
      .select("*")
      .or(`mapping_id.eq.${mapping.id},is_global.eq.true`);

    if (bannedWords && bannedWords.length > 0) {
      const lowerText = processedText.toLowerCase();

      for (const bw of bannedWords) {
        if (bw.action === "skip_post" && lowerText.includes(bw.word.toLowerCase())) {
          throw new Error(`SKIP:banned word "${bw.word}"`);
        }
      }

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

  return processedText;
}

function buildReplyMarkup(mapping: any): any | undefined {
  if (mapping.add_buttons && mapping.default_buttons) {
    const buttons = Array.isArray(mapping.default_buttons) ? mapping.default_buttons : [];
    if (buttons.length > 0) {
      return {
        inline_keyboard: buttons.map((btn: any) => [{ text: btn.text, url: btn.url }]),
      };
    }
  }
  return undefined;
}

// ── Process media group (album) ────────────────────────────────────

async function processMediaGroup(
  supabase: any,
  baseUrl: string,
  mapping: any,
  originalCaption: string,
  mediaItems: any[],
  lovableApiKey?: string
): Promise<{ success: boolean; error?: string }> {
  const targetChannel = mapping.target_channel;
  if (!targetChannel) {
    return { success: false, error: "Target channel not found" };
  }

  let processedCaption: string;
  try {
    processedCaption = await processText(supabase, mapping, originalCaption, lovableApiKey);
  } catch (err: any) {
    if (err.message?.startsWith("SKIP:")) {
      console.log(`Skipping post — ${err.message}`);
      return { success: false, error: err.message };
    }
    throw err;
  }

  const targetChatId = targetChannel.handle.startsWith("@")
    ? targetChannel.handle
    : `@${targetChannel.handle}`;

  // Build media group - support both base64 and file_id
  const mediaArray: any[] = [];
  const formData = new FormData();
  formData.append("chat_id", targetChatId);

  let attachIndex = 0;

  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    const mediaType = item.media_type === "video" ? "video" : "photo";

    let mediaRef: string;

    if (item.media_file_id) {
      // Use file_id directly (no upload needed)
      mediaRef = item.media_file_id;
    } else if (item.media_base64) {
      // Upload via multipart
      const binaryData = Uint8Array.from(atob(item.media_base64), c => c.charCodeAt(0));
      const blob = new Blob([binaryData], { type: item.media_mime || "application/octet-stream" });
      const fieldName = `file${attachIndex}`;
      formData.append(fieldName, blob, item.media_filename || `file${attachIndex}.jpg`);
      mediaRef = `attach://${fieldName}`;
      attachIndex++;
    } else {
      continue;
    }

    mediaArray.push({
      type: mediaType,
      media: mediaRef,
      ...(i === 0 && processedCaption ? { caption: processedCaption, parse_mode: "HTML" } : {}),
    });
  }

  if (mediaArray.length === 0) {
    return { success: false, error: "No valid media items in group" };
  }

  formData.set("media", JSON.stringify(mediaArray));

  const resp = await fetch(`${baseUrl}/sendMediaGroup`, {
    method: "POST",
    body: formData,
  });

  const result = await resp.json();

  if (!result.ok) {
    console.error(`Telegram sendMediaGroup failed:`, result.description);
    return { success: false, error: result.description };
  }

  console.log(`Forwarded album (${mediaItems.length} items) to ${targetChatId}`);

  // Log to videos table
  await supabase.from("videos").insert({
    title: (processedCaption || `Album (${mediaItems.length} items)`).substring(0, 100),
    source_channel_id: mapping.source_channel_id,
    target_channel_id: mapping.target_channel_id,
    status: "completed",
    progress: 100,
  });

  return { success: true };
}

// ── Process single message ─────────────────────────────────────────

async function processMapping(
  supabase: any,
  baseUrl: string,
  mapping: any,
  originalText: string,
  mediaType: string,
  mediaBase64?: string,
  mediaFilename?: string,
  mediaMime?: string,
  mediaFileId?: string,
  mediaUrl?: string,
  lovableApiKey?: string
): Promise<{ success: boolean; error?: string }> {
  const targetChannel = mapping.target_channel;
  if (!targetChannel) {
    return { success: false, error: "Target channel not found" };
  }

  let processedText: string;
  try {
    processedText = await processText(supabase, mapping, originalText, lovableApiKey);
  } catch (err: any) {
    if (err.message?.startsWith("SKIP:")) {
      console.log(`Skipping post — ${err.message}`);
      return { success: false, error: err.message };
    }
    throw err;
  }

  const reply_markup = buildReplyMarkup(mapping);

  const targetChatId = targetChannel.handle.startsWith("@")
    ? targetChannel.handle
    : `@${targetChannel.handle}`;

  let result: any;

  if (mediaBase64 && mediaType !== "text") {
    result = await sendMediaMultipart(
      baseUrl, targetChatId, mediaType, mediaBase64,
      mediaFilename || "media.bin", mediaMime || "application/octet-stream",
      processedText, reply_markup
    );
  } else {
    const baseBody: any = {
      chat_id: targetChatId,
      parse_mode: "HTML",
      ...(reply_markup ? { reply_markup } : {}),
    };

    let method = "sendMessage";
    let sendBody: any = { ...baseBody, text: processedText || "📎" };

    const mediaSource = mediaFileId || mediaUrl;

    if (mediaType === "video" && mediaSource) {
      method = "sendVideo";
      sendBody = { ...baseBody, video: mediaSource, caption: processedText };
    } else if (mediaType === "photo" && mediaSource) {
      method = "sendPhoto";
      sendBody = { ...baseBody, photo: mediaSource, caption: processedText };
    } else if (mediaType === "document" && mediaSource) {
      method = "sendDocument";
      sendBody = { ...baseBody, document: mediaSource, caption: processedText };
    } else if (mediaType === "animation" && mediaSource) {
      method = "sendAnimation";
      sendBody = { ...baseBody, animation: mediaSource, caption: processedText };
    }

    const resp = await fetch(`${baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendBody),
    });

    result = await resp.json();
  }

  if (!result.ok) {
    console.error(`Telegram send failed:`, result.description);
    return { success: false, error: result.description };
  }

  console.log(`Forwarded to ${targetChatId}`);

  await supabase.from("videos").insert({
    title: (processedText || "Media post").substring(0, 100),
    source_channel_id: mapping.source_channel_id,
    target_channel_id: mapping.target_channel_id,
    status: "completed",
    progress: 100,
  });

  return { success: true };
}

async function sendMediaMultipart(
  baseUrl: string,
  chatId: string,
  mediaType: string,
  base64Data: string,
  filename: string,
  mimeType: string,
  caption: string,
  replyMarkup?: any
): Promise<any> {
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const blob = new Blob([binaryData], { type: mimeType });

  const methodMap: Record<string, { method: string; field: string }> = {
    video: { method: "sendVideo", field: "video" },
    photo: { method: "sendPhoto", field: "photo" },
    document: { method: "sendDocument", field: "document" },
    animation: { method: "sendAnimation", field: "animation" },
  };

  const config = methodMap[mediaType] || methodMap.document;

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append(config.field, blob, filename);
  if (caption) formData.append("caption", caption);
  formData.append("parse_mode", "HTML");
  if (replyMarkup) formData.append("reply_markup", JSON.stringify(replyMarkup));

  const resp = await fetch(`${baseUrl}/${config.method}`, {
    method: "POST",
    body: formData,
  });

  return await resp.json();
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
