import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_API = "https://api.telegram.org/bot";

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

  if (!BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return new Response("OK");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const baseUrl = `${TELEGRAM_API}${BOT_TOKEN}`;

  try {
    // Check for scheduled posts that are due
    const now = new Date().toISOString();
    const { data: duePosts, error } = await supabase
      .from("scheduled_posts")
      .select("*, channel:channels(*)")
      .eq("published", false)
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(10);

    if (error) {
      console.error("Error fetching scheduled posts:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!duePosts || duePosts.length === 0) {
      return new Response(JSON.stringify({ message: "No posts due", count: 0 }));
    }

    console.log(`Processing ${duePosts.length} scheduled posts`);

    for (const post of duePosts) {
      try {
        const chatId = post.channel?.handle;
        if (!chatId) {
          console.error(`No channel handle for post ${post.id}`);
          continue;
        }

        // Get video details if linked
        let videoData = null;
        if (post.video_id) {
          const { data } = await supabase.from("videos").select("*").eq("id", post.video_id).single();
          videoData = data;
        }

        // Build request body
        let body: any = {};
        let endpoint = "sendMessage";

        if (videoData && videoData.title) {
          // If we have a video file_id or URL stored, send as video
          body = {
            chat_id: chatId,
            text: `<b>${post.title}</b>`,
            parse_mode: "HTML",
          };

          // Parse inline buttons from metadata if stored
          if (post.metadata && (post.metadata as any).inline_buttons) {
            body.reply_markup = {
              inline_keyboard: (post.metadata as any).inline_buttons.map((btn: any) => [
                { text: btn.text, url: btn.url },
              ]),
            };
          }
        } else {
          body = {
            chat_id: chatId,
            text: `<b>${post.title}</b>`,
            parse_mode: "HTML",
          };
        }

        const resp = await fetch(`${baseUrl}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const result = await resp.json();

        if (result.ok) {
          // Mark as published
          await supabase
            .from("scheduled_posts")
            .update({ published: true })
            .eq("id", post.id);

          console.log(`Published post ${post.id} to ${chatId}`);
        } else {
          console.error(`Failed to publish post ${post.id}:`, result.description);
        }
      } catch (postError) {
        console.error(`Error processing post ${post.id}:`, postError);
      }
    }

    return new Response(JSON.stringify({ message: "Done", processed: duePosts.length }));
  } catch (error) {
    console.error("Scheduler error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});
