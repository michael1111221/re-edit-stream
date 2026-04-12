import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TELEGRAM_API = "https://api.telegram.org/bot";

const isHttpUrl = (value: unknown): value is string =>
  typeof value === "string" && /^https?:\/\//i.test(value);

const buildReplyMarkup = (inlineButtons: unknown) => {
  if (!Array.isArray(inlineButtons) || inlineButtons.length === 0) return undefined;

  return {
    inline_keyboard: inlineButtons.map((btn: { text: string; url: string }) => [
      { text: btn.text, url: btn.url },
    ]),
  };
};

const appendCaptionAndButtons = (form: FormData, params: Record<string, any>, replyMarkup?: unknown) => {
  form.append("chat_id", params.chat_id);

  if (params.caption) {
    form.append("caption", params.caption);
    form.append("parse_mode", params.parse_mode || "HTML");
  }

  if (replyMarkup) {
    form.append("reply_markup", JSON.stringify(replyMarkup));
  }
};

const inferFileName = (url: string, fallback: string) => {
  try {
    const path = new URL(url).pathname;
    const name = path.split("/").pop();
    return name && name.includes(".") ? name : fallback;
  } catch {
    return fallback;
  }
};

async function sendMediaFromUrl(
  baseUrl: string,
  action: "sendPhoto" | "sendVideo" | "sendDocument",
  mediaField: "photo" | "video" | "document",
  mediaUrl: string,
  params: Record<string, any>,
  replyMarkup?: unknown,
) {
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    throw new Error(`Failed to download media URL: ${mediaResponse.status}`);
  }

  const contentType = mediaResponse.headers.get("content-type") || "application/octet-stream";
  const fallbackName = action === "sendPhoto" ? "image.jpg" : action === "sendVideo" ? "video.mp4" : "file";
  const fileName = inferFileName(mediaUrl, fallbackName);
  const mediaBlob = await mediaResponse.blob();
  const normalizedBlob = new Blob([mediaBlob], { type: contentType });

  const tgForm = new FormData();
  appendCaptionAndButtons(tgForm, params, replyMarkup);
  tgForm.append(mediaField, normalizedBlob, fileName);

  const resp = await fetch(`${baseUrl}/${action}`, {
    method: "POST",
    body: tgForm,
  });

  return await resp.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!BOT_TOKEN) {
    return new Response(
      JSON.stringify({ error: "TELEGRAM_BOT_TOKEN is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const baseUrl = `${TELEGRAM_API}${BOT_TOKEN}`;

  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const action = formData.get("action") as string;

      if (!action) {
        return new Response(
          JSON.stringify({ error: "Missing action field" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tgForm = new FormData();
      const chatId = formData.get("chat_id") as string;
      tgForm.append("chat_id", chatId);

      const caption = formData.get("caption") as string;
      if (caption) {
        tgForm.append("caption", caption);
        tgForm.append("parse_mode", "HTML");
      }

      const buttonsJson = formData.get("inline_buttons") as string;
      if (buttonsJson) {
        try {
          const buttons = JSON.parse(buttonsJson);
          const replyMarkup = buildReplyMarkup(buttons);
          if (replyMarkup) {
            tgForm.append("reply_markup", JSON.stringify(replyMarkup));
          }
        } catch (_) {}
      }

      const file = formData.get("file") as File;
      if (!file) {
        return new Response(
          JSON.stringify({ error: "Missing file" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let endpoint: string;
      let fieldName: string;

      if (action === "sendPhoto") { endpoint = "sendPhoto"; fieldName = "photo"; }
      else if (action === "sendVideo") { endpoint = "sendVideo"; fieldName = "video"; }
      else if (action === "sendDocument") { endpoint = "sendDocument"; fieldName = "document"; }
      else {
        return new Response(
          JSON.stringify({ error: `Unsupported file action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      tgForm.append(fieldName, file, file.name);

      const resp = await fetch(`${baseUrl}/${endpoint}`, { method: "POST", body: tgForm });
      const result = await resp.json();
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, ...params } = body;
    const reply_markup = buildReplyMarkup(params.inline_buttons);

    let result;

    switch (action) {
      case "getMe": {
        const resp = await fetch(`${baseUrl}/getMe`);
        result = await resp.json();
        break;
      }

      case "sendVideo": {
        if (isHttpUrl(params.video)) {
          result = await sendMediaFromUrl(baseUrl, "sendVideo", "video", params.video, params, reply_markup);
          break;
        }

        const body: any = {
          chat_id: params.chat_id,
          video: params.video,
          caption: params.caption || "",
          parse_mode: params.parse_mode || "HTML",
        };
        if (reply_markup) body.reply_markup = reply_markup;

        const resp = await fetch(`${baseUrl}/sendVideo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await resp.json();
        break;
      }

      case "sendAnimation": {
        if (isHttpUrl(params.animation)) {
          result = await sendMediaFromUrl(baseUrl, "sendAnimation", "document", params.animation, params, reply_markup);
          break;
        }

        const body: any = {
          chat_id: params.chat_id,
          animation: params.animation,
          caption: params.caption || "",
          parse_mode: params.parse_mode || "HTML",
        };
        if (reply_markup) body.reply_markup = reply_markup;

        const resp = await fetch(`${baseUrl}/sendAnimation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await resp.json();
        break;
      }

      case "sendPhoto": {
        if (isHttpUrl(params.photo)) {
          result = await sendMediaFromUrl(baseUrl, "sendPhoto", "photo", params.photo, params, reply_markup);
          break;
        }

        const body: any = {
          chat_id: params.chat_id,
          photo: params.photo,
          caption: params.caption || "",
          parse_mode: params.parse_mode || "HTML",
        };
        if (reply_markup) body.reply_markup = reply_markup;

        const resp = await fetch(`${baseUrl}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await resp.json();
        break;
      }

      case "sendDocument": {
        if (isHttpUrl(params.document)) {
          result = await sendMediaFromUrl(baseUrl, "sendDocument", "document", params.document, params, reply_markup);
          break;
        }

        const body: any = {
          chat_id: params.chat_id,
          document: params.document,
          caption: params.caption || "",
          parse_mode: params.parse_mode || "HTML",
        };
        if (reply_markup) body.reply_markup = reply_markup;

        const resp = await fetch(`${baseUrl}/sendDocument`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await resp.json();
        break;
      }

      case "sendMessage": {
        const body: any = {
          chat_id: params.chat_id,
          text: params.text,
          parse_mode: params.parse_mode || "HTML",
        };
        if (reply_markup) body.reply_markup = reply_markup;

        const resp = await fetch(`${baseUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await resp.json();
        break;
      }

      case "forwardMessage": {
        const resp = await fetch(`${baseUrl}/forwardMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: params.chat_id,
            from_chat_id: params.from_chat_id,
            message_id: params.message_id,
          }),
        });
        result = await resp.json();
        break;
      }

      case "copyMessage": {
        const body: any = {
          chat_id: params.chat_id,
          from_chat_id: params.from_chat_id,
          message_id: params.message_id,
          caption: params.caption,
          parse_mode: "HTML",
        };
        if (reply_markup) body.reply_markup = reply_markup;

        const resp = await fetch(`${baseUrl}/copyMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await resp.json();
        break;
      }

      case "getChat": {
        const resp = await fetch(`${baseUrl}/getChat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: params.chat_id }),
        });
        result = await resp.json();
        break;
      }

      case "getChatMemberCount": {
        const resp = await fetch(`${baseUrl}/getChatMemberCount`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: params.chat_id }),
        });
        result = await resp.json();
        break;
      }

      case "setWebhook": {
        const resp = await fetch(`${baseUrl}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: params.url, allowed_updates: ["message", "channel_post", "callback_query"] }),
        });
        result = await resp.json();
        break;
      }

      case "deleteWebhook": {
        const resp = await fetch(`${baseUrl}/deleteWebhook`);
        result = await resp.json();
        break;
      }

      case "deleteMessage": {
        const resp = await fetch(`${baseUrl}/deleteMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: params.chat_id,
            message_id: params.message_id,
          }),
        });
        result = await resp.json();
        break;
      }

      case "catalogSetWebhook": {
        const CATALOG_TOKEN = Deno.env.get("CATALOG_BOT_TOKEN");
        if (!CATALOG_TOKEN) {
          return new Response(
            JSON.stringify({ error: "CATALOG_BOT_TOKEN not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const catalogBase = `${TELEGRAM_API}${CATALOG_TOKEN}`;
        const resp = await fetch(`${catalogBase}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: params.url, allowed_updates: ["message", "callback_query"] }),
        });
        result = await resp.json();
        break;
      }

      case "catalogDeleteWebhook": {
        const CATALOG_TOKEN2 = Deno.env.get("CATALOG_BOT_TOKEN");
        if (!CATALOG_TOKEN2) {
          return new Response(
            JSON.stringify({ error: "CATALOG_BOT_TOKEN not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const catalogBase2 = `${TELEGRAM_API}${CATALOG_TOKEN2}`;
        const resp = await fetch(`${catalogBase2}/deleteWebhook`);
        result = await resp.json();
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Telegram bot error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});