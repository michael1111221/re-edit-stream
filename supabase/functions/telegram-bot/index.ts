import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TELEGRAM_API = "https://api.telegram.org/bot";

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

    // Handle multipart/form-data for file uploads
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const action = formData.get("action") as string;

      if (!action) {
        return new Response(
          JSON.stringify({ error: "Missing action field" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Build Telegram FormData
      const tgForm = new FormData();
      const chatId = formData.get("chat_id") as string;
      tgForm.append("chat_id", chatId);

      const caption = formData.get("caption") as string;
      if (caption) {
        tgForm.append("caption", caption);
        tgForm.append("parse_mode", "HTML");
      }

      // Handle inline buttons
      const buttonsJson = formData.get("inline_buttons") as string;
      if (buttonsJson) {
        try {
          const buttons = JSON.parse(buttonsJson);
          if (Array.isArray(buttons) && buttons.length > 0) {
            tgForm.append("reply_markup", JSON.stringify({
              inline_keyboard: buttons.map((btn: { text: string; url: string }) => [
                { text: btn.text, url: btn.url },
              ]),
            }));
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

      if (action === "sendPhoto") {
        endpoint = "sendPhoto";
        fieldName = "photo";
      } else if (action === "sendVideo") {
        endpoint = "sendVideo";
        fieldName = "video";
      } else if (action === "sendDocument") {
        endpoint = "sendDocument";
        fieldName = "document";
      } else {
        return new Response(
          JSON.stringify({ error: `Unsupported file action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      tgForm.append(fieldName, file, file.name);

      const resp = await fetch(`${baseUrl}/${endpoint}`, {
        method: "POST",
        body: tgForm,
      });
      const result = await resp.json();

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle JSON requests (existing logic)
    const { action, ...params } = await req.json();

    // Build reply_markup from inline_buttons if provided
    let reply_markup: any = undefined;
    if (params.inline_buttons && Array.isArray(params.inline_buttons) && params.inline_buttons.length > 0) {
      reply_markup = {
        inline_keyboard: params.inline_buttons.map((btn: { text: string; url: string }) => [
          { text: btn.text, url: btn.url },
        ]),
      };
    }

    let result;

    switch (action) {
      case "getMe": {
        const resp = await fetch(`${baseUrl}/getMe`);
        result = await resp.json();
        break;
      }

      case "sendVideo": {
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

      case "sendPhoto": {
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
