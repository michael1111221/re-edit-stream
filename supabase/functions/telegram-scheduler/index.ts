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
    // === 1. Process one-time scheduled posts ===
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
    }

    if (duePosts && duePosts.length > 0) {
      console.log(`Processing ${duePosts.length} scheduled posts`);

      for (const post of duePosts) {
        try {
          const channel = post.channel;
          // Use telegram_chat_id for private channels, fall back to handle
          let chatId = channel?.telegram_chat_id?.trim() || channel?.handle;
          if (!chatId) {
            console.error(`No channel handle for post ${post.id}`);
            continue;
          }
          // Auto-fix numeric IDs without -100 prefix
          if (/^\d{6,}$/.test(chatId)) {
            chatId = `-100${chatId}`;
          }

          const body: any = {
            chat_id: chatId,
            text: `<b>${post.title}</b>`,
            parse_mode: "HTML",
          };

          const resp = await fetch(`${baseUrl}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          const result = await resp.json();

          if (result.ok) {
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
    }

    // === 2. Process recurring schedules ===
    const { data: recurringSchedules, error: rError } = await supabase
      .from("recurring_schedules")
      .select("*")
      .eq("is_active", true);

    if (rError) {
      console.error("Error fetching recurring schedules:", rError);
    }

    if (recurringSchedules && recurringSchedules.length > 0) {
      // Current time in Israel timezone
      const nowDate = new Date();
      const israelTime = new Date(nowDate.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
      const currentDay = israelTime.getDay(); // 0=Sunday
      const currentHour = israelTime.getHours();
      const currentMinute = israelTime.getMinutes();
      const currentTimeStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

      for (const schedule of recurringSchedules) {
        try {
          const days: number[] = schedule.days_of_week || [];
          const timeOfDay: string = schedule.time_of_day || "12:00";

          // Check if today is a scheduled day
          if (!days.includes(currentDay)) continue;

          // Check if it's the right time (within 2 minute window)
          const [schedH, schedM] = timeOfDay.split(":").map(Number);
          const schedMinutes = schedH * 60 + schedM;
          const nowMinutes = currentHour * 60 + currentMinute;
          if (Math.abs(nowMinutes - schedMinutes) > 1) continue;

          // Check if already ran today
          if (schedule.last_run_at) {
            const lastRun = new Date(schedule.last_run_at);
            const lastRunIsrael = new Date(lastRun.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
            if (
              lastRunIsrael.getFullYear() === israelTime.getFullYear() &&
              lastRunIsrael.getMonth() === israelTime.getMonth() &&
              lastRunIsrael.getDate() === israelTime.getDate()
            ) {
              continue; // Already ran today
            }
          }

          const channelHandles: string[] = (schedule.channel_handles as any) || [];
          const caption = schedule.caption || "";
          const inlineButtons: any[] = (schedule.inline_buttons as any) || [];

          console.log(`Running recurring schedule "${schedule.name}" to ${channelHandles.length} channels`);

          for (const chatId of channelHandles) {
            try {
              const body: any = {
                chat_id: chatId,
                text: caption || schedule.name,
                parse_mode: "HTML",
              };

              if (inlineButtons.length > 0) {
                body.reply_markup = {
                  inline_keyboard: inlineButtons
                    .filter((b: any) => b.text && b.url)
                    .map((b: any) => [{ text: b.text, url: b.url }]),
                };
              }

              const resp = await fetch(`${baseUrl}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });

              const result = await resp.json();
              if (result.ok) {
                console.log(`Recurring: sent to ${chatId}`);
              } else {
                console.error(`Recurring: failed for ${chatId}:`, result.description);
              }
            } catch (err) {
              console.error(`Recurring: error sending to ${chatId}:`, err);
            }
          }

          // Mark as ran today
          await supabase
            .from("recurring_schedules")
            .update({ last_run_at: new Date().toISOString() })
            .eq("id", schedule.id);

        } catch (schedError) {
          console.error(`Error processing recurring schedule ${schedule.id}:`, schedError);
        }
      }
    }

    return new Response(JSON.stringify({ message: "Done", scheduled: duePosts?.length || 0, recurring: recurringSchedules?.length || 0 }));
  } catch (error) {
    console.error("Scheduler error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});
