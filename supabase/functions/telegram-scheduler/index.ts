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
  const body: any = { ...params, [fieldName]: mediaUrl };
  if (replyMarkup) body.reply_markup = replyMarkup;

  let resp = await fetch(`${baseUrl}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let result = await resp.json();
  if (result.ok) return result;

  console.log(`URL send failed for ${action}, trying multipart upload...`);
  try {
    const fileResp = await fetch(mediaUrl);
    if (!fileResp.ok) return result;
    const fileBlob = await fileResp.blob();
    const fallbackName = action === "sendPhoto" ? "image.jpg" :
                         action === "sendVideo" ? "video.mp4" :
                         action === "sendAnimation" ? "animation.mp4" : "file";
    const formData = new FormData();
    formData.append(fieldName, fileBlob, fallbackName);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) formData.append(k, String(v));
    }
    if (replyMarkup) formData.append("reply_markup", JSON.stringify(replyMarkup));
    resp = await fetch(`${baseUrl}/${action}`, { method: "POST", body: formData });
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

  // Run log
  const runStart = new Date().toISOString();
  const runDetails: Array<{
    type: "scheduled" | "recurring";
    schedule_name?: string;
    post_title?: string;
    channel: string;
    status: "success" | "failed" | "skipped";
    message_id?: number;
    error?: string;
    at: string;
  }> = [];
  let sendsSuccess = 0;
  let sendsFailed = 0;
  let recurringMatched = 0;
  let topLevelError: string | null = null;

  try {
    // === 1. One-time scheduled posts ===
    const now = new Date().toISOString();
    const { data: duePosts, error } = await supabase
      .from("scheduled_posts")
      .select("*, channel:channels(*)")
      .eq("published", false)
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(10);

    if (error) console.error("Error fetching scheduled posts:", error);

    if (duePosts && duePosts.length > 0) {
      console.log(`Processing ${duePosts.length} scheduled posts`);

      for (const post of duePosts) {
        const channel = post.channel;
        const channelLabel = channel?.name || channel?.handle || "unknown";
        try {
          let chatId = channel?.telegram_chat_id?.trim() || channel?.handle;
          if (!chatId) {
            runDetails.push({ type: "scheduled", post_title: post.title, channel: channelLabel, status: "skipped", error: "no chat id", at: new Date().toISOString() });
            continue;
          }
          if (/^\d{6,}$/.test(chatId)) chatId = `-100${chatId}`;

          const inlineButtons: any[] = (post.inline_buttons as any) || [];
          const replyMarkup = inlineButtons.length > 0
            ? { inline_keyboard: inlineButtons.filter((b: any) => b.text && b.url).map((b: any) => [{ text: b.text, url: b.url }]) }
            : undefined;

          let result: any;

          if (post.media_url && post.media_type) {
            const actionMap: Record<string, string> = { photo: "sendPhoto", video: "sendVideo", document: "sendDocument" };
            const fieldMap: Record<string, string> = { photo: "photo", video: "video", document: "document" };
            const action = actionMap[post.media_type] || "sendDocument";
            const field = fieldMap[post.media_type] || "document";
            const params: Record<string, any> = { chat_id: chatId, caption: post.caption || undefined, parse_mode: "HTML" };
            result = await sendMediaFromUrl(baseUrl, action, field, post.media_url, params, replyMarkup);
            if (!result.ok && (post.media_type === "photo" || post.media_type === "video")) {
              result = await sendMediaFromUrl(baseUrl, "sendDocument", "document", post.media_url, params, replyMarkup);
            }
          } else {
            const body: any = { chat_id: chatId, text: post.title || "פרסום מתוזמן", parse_mode: "HTML" };
            if (replyMarkup) body.reply_markup = replyMarkup;
            const resp = await fetch(`${baseUrl}/sendMessage`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            });
            result = await resp.json();
          }

          if (result.ok) {
            await supabase.from("scheduled_posts").update({ published: true }).eq("id", post.id);
            sendsSuccess++;
            runDetails.push({ type: "scheduled", post_title: post.title, channel: channelLabel, status: "success", message_id: result.result?.message_id, at: new Date().toISOString() });
            console.log(`Published post ${post.id} to ${chatId}`);
          } else {
            sendsFailed++;
            runDetails.push({ type: "scheduled", post_title: post.title, channel: channelLabel, status: "failed", error: result.description, at: new Date().toISOString() });
            console.error(`Failed to publish post ${post.id}:`, result.description);
          }
        } catch (postError) {
          sendsFailed++;
          const msg = postError instanceof Error ? postError.message : String(postError);
          runDetails.push({ type: "scheduled", post_title: post.title, channel: channelLabel, status: "failed", error: msg, at: new Date().toISOString() });
          console.error(`Error processing post ${post.id}:`, postError);
        }
      }
    }

    // === 2. Recurring schedules ===
    const { data: recurringSchedules, error: rError } = await supabase
      .from("recurring_schedules").select("*").eq("is_active", true);

    if (rError) console.error("Error fetching recurring schedules:", rError);

    if (recurringSchedules && recurringSchedules.length > 0) {
      const nowDate = new Date();
      const israelTime = new Date(nowDate.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
      const currentDay = israelTime.getDay();
      const currentHour = israelTime.getHours();
      const currentMinute = israelTime.getMinutes();
      // For late-night schedules (00:00-02:00), treat them as "belonging to" the previous day.
      // e.g. a schedule set on Thursday at 00:00 should fire on the night between Thu and Fri.
      const previousDay = (currentDay + 6) % 7;

      const { data: allChannels } = await supabase.from("channels").select("handle, telegram_chat_id");
      const channelChatIdMap: Record<string, string> = {};
      if (allChannels) {
        for (const c of allChannels) {
          if (c.handle && c.telegram_chat_id) channelChatIdMap[c.handle] = c.telegram_chat_id;
        }
      }

      const resolveChatId = (handle: string): string => {
        if (channelChatIdMap[handle]) return channelChatIdMap[handle];
        if (/^-?\d{6,}$/.test(handle)) {
          if (/^\d{6,}$/.test(handle)) return `-100${handle}`;
          return handle;
        }
        if (handle.startsWith("@")) return handle;
        const publicMatch = handle.match(/^https?:\/\/t\.me\/([^/+][^/?#]*)/);
        if (publicMatch) return `@${publicMatch[1]}`;
        return handle;
      };

      for (const schedule of recurringSchedules) {
        try {
          const days: number[] = schedule.days_of_week || [];
          const timeOfDayRaw: string = schedule.time_of_day || "12:00";

          const times = timeOfDayRaw.split(",").map(t => t.trim()).filter(Boolean);
          let matchedTime: string | null = null;
          for (const t of times) {
            const [schedH, schedM] = t.split(":").map(Number);
            const schedMinutes = schedH * 60 + schedM;
            const nowMinutes = currentHour * 60 + currentMinute;
            if (Math.abs(nowMinutes - schedMinutes) > 1) continue;
            // Late-night schedules (00:00-01:59) are considered part of the PREVIOUS day
            const effectiveDay = schedH < 2 ? previousDay : currentDay;
            if (!days.includes(effectiveDay)) continue;
            matchedTime = t;
            break;
          }
          if (!matchedTime) continue;

          if (schedule.last_run_at) {
            const lastRun = new Date(schedule.last_run_at);
            if (nowDate.getTime() - lastRun.getTime() < 2 * 60 * 1000) continue;
          }

          recurringMatched++;
          const channelHandles: string[] = (schedule.channel_handles as any) || [];
          const caption = schedule.caption || "";
          const inlineButtons: any[] = (schedule.inline_buttons as any) || [];
          const mediaUrl: string | null = (schedule as any).media_url || null;
          const mediaType: string | null = (schedule as any).media_type || null;

          const replyMarkup = inlineButtons.length > 0
            ? { inline_keyboard: inlineButtons.filter((b: any) => b.text && b.url).map((b: any) => [{ text: b.text, url: b.url }]) }
            : undefined;

          console.log(`Running recurring schedule "${schedule.name}" to ${channelHandles.length} channels`);

          const newMessageIds: Record<string, number> = {};

          const { data: allSchedules } = await supabase
            .from("recurring_schedules")
            .select("id, last_message_ids, delete_previous")
            .eq("is_active", true);

          const allChannelMessages: Record<string, Array<{ scheduleId: string; messageId: number }>> = {};
          if (allSchedules) {
            for (const s of allSchedules) {
              if (s.id === schedule.id) continue;
              const ids: Record<string, number> = (s as any).last_message_ids || {};
              for (const [key, msgId] of Object.entries(ids)) {
                if (!allChannelMessages[key]) allChannelMessages[key] = [];
                allChannelMessages[key].push({ scheduleId: s.id, messageId: msgId });
              }
            }
          }
          const ownPrevIds: Record<string, number> = (schedule as any).last_message_ids || {};
          for (const [key, msgId] of Object.entries(ownPrevIds)) {
            if (!allChannelMessages[key]) allChannelMessages[key] = [];
            allChannelMessages[key].push({ scheduleId: schedule.id, messageId: msgId });
          }

          for (const handle of channelHandles) {
            try {
              const chatId = resolveChatId(handle);
              if (chatId === handle && handle.includes("t.me/+")) {
                sendsFailed++;
                runDetails.push({ type: "recurring", schedule_name: schedule.name, channel: handle, status: "skipped", error: "unresolved invite link", at: new Date().toISOString() });
                continue;
              }

              const shouldDelete = (schedule as any).delete_previous !== false;
              const prevEntries = allChannelMessages[chatId] || allChannelMessages[handle] || [];
              if (shouldDelete && prevEntries.length > 0) {
                for (const prevEntry of prevEntries) {
                  try {
                    const delResp = await fetch(`${baseUrl}/deleteMessage`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ chat_id: chatId, message_id: prevEntry.messageId }),
                    });
                    const delResult = await delResp.json();
                    if (delResult.ok && prevEntry.scheduleId !== schedule.id) {
                      const oldSchedule = allSchedules?.find(s => s.id === prevEntry.scheduleId);
                      if (oldSchedule) {
                        const oldIds = { ...((oldSchedule as any).last_message_ids || {}) };
                        delete oldIds[chatId];
                        delete oldIds[handle];
                        await supabase.from("recurring_schedules").update({ last_message_ids: oldIds }).eq("id", prevEntry.scheduleId);
                      }
                    }
                  } catch (delErr) {
                    console.log(`Recurring: delete error for ${chatId}:`, delErr);
                  }
                }
              }

              let result: any;
              if (mediaUrl && mediaType) {
                const actionMap: Record<string, string> = { photo: "sendPhoto", video: "sendVideo", document: "sendDocument" };
                const fieldMap: Record<string, string> = { photo: "photo", video: "video", document: "document" };
                const action = actionMap[mediaType] || "sendDocument";
                const field = fieldMap[mediaType] || "document";
                const params: Record<string, any> = { chat_id: chatId, caption: caption || undefined, parse_mode: "HTML" };
                result = await sendMediaFromUrl(baseUrl, action, field, mediaUrl, params, replyMarkup);
                if (!result.ok && (mediaType === "photo" || mediaType === "video")) {
                  result = await sendMediaFromUrl(baseUrl, "sendDocument", "document", mediaUrl, params, replyMarkup);
                }
              } else {
                const body: any = { chat_id: chatId, text: caption || schedule.name, parse_mode: "HTML" };
                if (replyMarkup) body.reply_markup = replyMarkup;
                const resp = await fetch(`${baseUrl}/sendMessage`, {
                  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
                });
                result = await resp.json();
              }

              if (result.ok) {
                const sentMsgId = result.result?.message_id;
                if (sentMsgId) newMessageIds[chatId] = sentMsgId;
                sendsSuccess++;
                runDetails.push({ type: "recurring", schedule_name: schedule.name, channel: chatId, status: "success", message_id: sentMsgId, at: new Date().toISOString() });
                console.log(`Recurring: sent to ${chatId}, message_id=${sentMsgId}`);
              } else {
                sendsFailed++;
                runDetails.push({ type: "recurring", schedule_name: schedule.name, channel: chatId, status: "failed", error: result.description, at: new Date().toISOString() });
                console.error(`Recurring: failed for ${chatId}:`, result.description);
              }
            } catch (err) {
              sendsFailed++;
              const msg = err instanceof Error ? err.message : String(err);
              runDetails.push({ type: "recurring", schedule_name: schedule.name, channel: handle, status: "failed", error: msg, at: new Date().toISOString() });
              console.error(`Recurring: error sending to ${handle}:`, err);
            }
          }

          await supabase
            .from("recurring_schedules")
            .update({ last_run_at: new Date().toISOString(), last_message_ids: newMessageIds })
            .eq("id", schedule.id);

        } catch (schedError) {
          const msg = schedError instanceof Error ? schedError.message : String(schedError);
          runDetails.push({ type: "recurring", schedule_name: schedule.name, channel: "—", status: "failed", error: msg, at: new Date().toISOString() });
          console.error(`Error processing recurring schedule ${schedule.id}:`, schedError);
        }
      }
    }

    // Persist run log for EVERY invocation so the dashboard shows the scheduler is alive
    await supabase.from("scheduler_runs").insert({
      started_at: runStart,
      finished_at: new Date().toISOString(),
      scheduled_processed: duePosts?.length || 0,
      recurring_matched: recurringMatched,
      sends_success: sendsSuccess,
      sends_failed: sendsFailed,
      details: runDetails,
    });

    // Keep only the most recent 200 runs to avoid bloat
    try {
      const { data: oldRuns } = await supabase
        .from("scheduler_runs")
        .select("id")
        .order("started_at", { ascending: false })
        .range(200, 999);
      if (oldRuns && oldRuns.length > 0) {
        await supabase.from("scheduler_runs").delete().in("id", oldRuns.map(r => r.id));
      }
    } catch (e) {
      console.log("Cleanup error (non-fatal):", e);
    }

    return new Response(JSON.stringify({ message: "Done", scheduled: duePosts?.length || 0, recurring: recurringSchedules?.length || 0 }));
  } catch (error) {
    topLevelError = error instanceof Error ? error.message : "Unknown error";
    console.error("Scheduler error:", error);
    await supabase.from("scheduler_runs").insert({
      started_at: runStart,
      finished_at: new Date().toISOString(),
      scheduled_processed: 0,
      recurring_matched: recurringMatched,
      sends_success: sendsSuccess,
      sends_failed: sendsFailed,
      error: topLevelError,
      details: runDetails,
    });
    return new Response(JSON.stringify({ error: topLevelError }), { status: 500 });
  }
});
