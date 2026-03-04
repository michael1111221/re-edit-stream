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

  try {
    const { action, ...params } = await req.json();
    const baseUrl = `${TELEGRAM_API}${BOT_TOKEN}`;

    let result;

    switch (action) {
      case "getMe": {
        const resp = await fetch(`${baseUrl}/getMe`);
        result = await resp.json();
        break;
      }

      case "sendVideo": {
        // Send a video to a channel
        // params: { chat_id, video (file_id or URL), caption?, parse_mode? }
        const resp = await fetch(`${baseUrl}/sendVideo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: params.chat_id,
            video: params.video,
            caption: params.caption || "",
            parse_mode: params.parse_mode || "HTML",
          }),
        });
        result = await resp.json();
        break;
      }

      case "sendMessage": {
        // params: { chat_id, text, parse_mode? }
        const resp = await fetch(`${baseUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: params.chat_id,
            text: params.text,
            parse_mode: params.parse_mode || "HTML",
          }),
        });
        result = await resp.json();
        break;
      }

      case "forwardMessage": {
        // params: { chat_id, from_chat_id, message_id }
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
        // Copy without forward tag
        // params: { chat_id, from_chat_id, message_id, caption? }
        const resp = await fetch(`${baseUrl}/copyMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: params.chat_id,
            from_chat_id: params.from_chat_id,
            message_id: params.message_id,
            caption: params.caption,
            parse_mode: "HTML",
          }),
        });
        result = await resp.json();
        break;
      }

      case "getChat": {
        // params: { chat_id }
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
