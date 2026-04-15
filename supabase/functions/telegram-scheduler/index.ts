import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_API = "https://api.telegram.org/bot";

async function sendMediaFromUrl(
  baseUrl: string,
  action: string,
  fieldName: string,
  mediaUrl: string,
  params: Record<string, any>,
  replyMarkup?: any
) {
  // Try sending by URL first
  const body: any = {
    ...params,
    [fieldName]: mediaUrl,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  let resp = await fetch(`${baseUrl}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let result = await resp.json();

  if (result.ok) return result;

  // Fallback: download and upload as multipart
  console.log(`URL send failed for ${action}, trying multipart upload...`);
  try {
    const fileResp = await fetch(mediaUrl);
    if (!fileResp.ok) return result;
    const fileBlob = await fileResp.blob();
    
    const fallbackName = action === "sendPhoto" ? "image.jpg" : 
                         action === "sendAnimation" ? "animation.mp4" : "file";

    const formData = new FormData();
    formData.append(fieldName, fileBlob, fallbackName);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) formData.append(k, String(v));
    }
    if (replyMarkup) formData.append("reply_markup", JSON.stringify(replyMarkup));

    resp = await fetch(`${baseUrl}/${action}`, {
      method: "POST",
      body: formData,
    });
    result = await resp.json();
  } catch (e) {
    console.error("Multipart fallback failed:", e);
  }

  return result;
}

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
          let chatId = channel?.telegram_chat_id?.trim() || channel?.handle;
          if (!chatId) {
            console.error(`No channel handle for post ${post.id}`);
            continue;
          }
          if (/^\d{6,}$/.test(chatId)) {
            chatId = `-100${chatId}`;
          }

          const inlineButtons: any[] = (post.inline_buttons as any) || [];
          const replyMarkup = inlineButtons.length > 0
            ? {
                inline_keyboard: inlineButtons
                  .filter((b: any) => b.text && b.url)
                  .map((b: any) => [{ text: b.text, url: b.url }]),
              }
            : undefined;

          let result: any;

          if (post.media_url && post.media_type) {
            // Send with media
            const actionMap: Record<string, string> = {
              photo: "sendPhoto",
              video: "sendAnimation",
              document: "sendDocument",
            };
            const fieldMap: Record<string, string> = {
              photo: "photo",
              video: "animation",
              document: "document",
            };

            const action = actionMap[post.media_type] || "sendDocument";
            const field = fieldMap[post.media_type] || "document";

            const params: Record<string, any> = {
              chat_id: chatId,
              caption: post.title || undefined,
              parse_mode: "HTML",
            };

            result = await sendMediaFromUrl(baseUrl, action, field, post.media_url, params, replyMarkup);

            // Fallback: if photo fails, try as document
            if (!result.ok && post.media_type === "photo") {
              console.log(`Photo failed, retrying as document for post ${post.id}`);
              result = await sendMediaFromUrl(baseUrl, "sendDocument", "document", post.media_url, params, replyMarkup);
            }
          } else {
            // Text only
            const body: any = {
              chat_id: chatId,
              text: post.title || "פרסום מתוזמן",
              parse_mode: "HTML",
            };
            if (replyMarkup) body.reply_markup = replyMarkup;

            const resp = await fetch(`${baseUrl}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            result = await resp.json();
          }

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
      const nowDate = new Date();
      const israelTime = new Date(nowDate.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
      const currentDay = israelTime.getDay();
      const currentHour = israelTime.getHours();
      const currentMinute = israelTime.getMinutes();

      for (const schedule of recurringSchedules) {
        try {
          const days: number[] = schedule.days_of_week || [];
          const timeOfDay: string = schedule.time_of_day || "12:00";

          if (!days.includes(currentDay)) continue;

          const [schedH, schedM] = timeOfDay.split(":").map(Number);
          const schedMinutes = schedH * 60 + schedM;
          const nowMinutes = currentHour * 60 + currentMinute;
          if (Math.abs(nowMinutes - schedMinutes) > 1) continue;

          if (schedule.last_run_at) {
            const lastRun = new Date(schedule.last_run_at);
            const lastRunIsrael = new Date(lastRun.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
            if (
              lastRunIsrael.getFullYear() === israelTime.getFullYear() &&
              lastRunIsrael.getMonth() === israelTime.getMonth() &&
              lastRunIsrael.getDate() === israelTime.getDate()
            ) {
              continue;
            }
          }

          const channelHandles: string[] = (schedule.channel_handles as any) || [];
          const caption = schedule.caption || "";
          const inlineButtons: any[] = (schedule.inline_buttons as any) || [];
          const mediaUrl: string | null = (schedule as any).media_url || null;
          const mediaType: string | null = (schedule as any).media_type || null;

          const replyMarkup = inlineButtons.length > 0
            ? {
                inline_keyboard: inlineButtons
                  .filter((b: any) => b.text && b.url)
                  .map((b: any) => [{ text: b.text, url: b.url }]),
              }
            : undefined;

          console.log(`Running recurring schedule "${schedule.name}" to ${channelHandles.length} channels`);

          const newMessageIds: Record<string, number> = {};

          // Fetch last_message_ids from ALL active recurring schedules for cross-schedule deletion
          const { data: allSchedules } = await supabase
            .from("recurring_schedules")
            .select("id, last_message_ids")
            .eq("is_active", true);

          const allMessageIds: Record<string, { scheduleId: string; messageId: number }> = {};
          if (allSchedules) {
            for (const s of allSchedules) {
              const ids: Record<string, number> = (s as any).last_message_ids || {};
              for (const [key, msgId] of Object.entries(ids)) {
                // Keep the most recent (highest) message_id per channel
                if (!allMessageIds[key] || msgId > allMessageIds[key].messageId) {
                  allMessageIds[key] = { scheduleId: s.id, messageId: msgId };
                }
              }
            }
          }

          for (const handle of channelHandles) {
            try {
              // Resolve chat ID for private channels
              let chatId = handle;
              if (/^\d{6,}$/.test(chatId)) {
                chatId = `-100${chatId}`;
              }

              // Delete previous message if enabled - check ALL schedules' messages for this channel
              const shouldDelete = (schedule as any).delete_previous !== false;
              const prevEntry = allMessageIds[chatId] || allMessageIds[handle];
              const prevMsgId = prevEntry?.messageId;
              if (shouldDelete && prevMsgId) {
                try {
                  const delResp = await fetch(`${baseUrl}/deleteMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatId, message_id: prevMsgId }),
                  });
                  const delResult = await delResp.json();
                  if (delResult.ok) {
                    console.log(`Recurring: deleted previous message ${prevMsgId} from ${chatId} (from schedule ${prevEntry.scheduleId})`);
                    // Clear the old entry from the source schedule if it's a different one
                    if (prevEntry.scheduleId !== schedule.id) {
                      const oldSchedule = allSchedules?.find(s => s.id === prevEntry.scheduleId);
                      if (oldSchedule) {
                        const oldIds = { ...((oldSchedule as any).last_message_ids || {}) };
                        delete oldIds[chatId];
                        delete oldIds[handle];
                        await supabase
                          .from("recurring_schedules")
                          .update({ last_message_ids: oldIds })
                          .eq("id", prevEntry.scheduleId);
                      }
                    }
                  } else {
                    console.log(`Recurring: could not delete previous message ${prevMsgId} from ${chatId}: ${delResult.description}`);
                  }
                } catch (delErr) {
                  console.log(`Recurring: delete error for ${chatId}:`, delErr);
                }
              }

              let result: any;

              if (mediaUrl && mediaType) {
                const actionMap: Record<string, string> = {
                  photo: "sendPhoto", video: "sendAnimation", document: "sendDocument",
                };
                const fieldMap: Record<string, string> = {
                  photo: "photo", video: "animation", document: "document",
                };
                const action = actionMap[mediaType] || "sendDocument";
                const field = fieldMap[mediaType] || "document";

                const params: Record<string, any> = {
                  chat_id: chatId,
                  caption: caption || undefined,
                  parse_mode: "HTML",
                };

                result = await sendMediaFromUrl(baseUrl, action, field, mediaUrl, params, replyMarkup);

                if (!result.ok && mediaType === "photo") {
                  result = await sendMediaFromUrl(baseUrl, "sendDocument", "document", mediaUrl, params, replyMarkup);
                }
              } else {
                const body: any = {
                  chat_id: chatId,
                  text: caption || schedule.name,
                  parse_mode: "HTML",
                };
                if (replyMarkup) body.reply_markup = replyMarkup;

                const resp = await fetch(`${baseUrl}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                result = await resp.json();
              }

              if (result.ok) {
                const sentMsgId = result.result?.message_id;
                if (sentMsgId) {
                  newMessageIds[chatId] = sentMsgId;
                }
                console.log(`Recurring: sent to ${chatId}, message_id=${sentMsgId}`);
              } else {
                console.error(`Recurring: failed for ${chatId}:`, result.description);
              }
            } catch (err) {
              console.error(`Recurring: error sending to ${handle}:`, err);
            }
          }

          await supabase
            .from("recurring_schedules")
            .update({ last_run_at: new Date().toISOString(), last_message_ids: newMessageIds })
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
