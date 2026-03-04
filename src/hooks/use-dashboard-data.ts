import { useState } from "react";
import { Channel, Video, ScheduledPost } from "@/types/dashboard";

// Mock data for channels
const mockChannels: Channel[] = [
  { id: "1", name: "Tech News IL", type: "source", platform: "telegram", handle: "@technewsil", videoCount: 342, isOwned: false, language: "en", status: "active" },
  { id: "2", name: "מדע וטכנולוגיה", type: "target", platform: "telegram", handle: "@scitech_he", videoCount: 187, isOwned: true, language: "he", status: "active" },
  { id: "3", name: "Global Crypto", type: "source", platform: "telegram", handle: "@globalcrypto", videoCount: 891, isOwned: false, language: "en", status: "active" },
  { id: "4", name: "קריפטו בעברית", type: "target", platform: "telegram", handle: "@crypto_he", videoCount: 256, isOwned: true, language: "he", status: "active" },
  { id: "5", name: "AI Updates", type: "source", platform: "telegram", handle: "@aiupdates", videoCount: 564, isOwned: false, language: "en", status: "paused" },
  { id: "6", name: "בינה מלאכותית", type: "target", platform: "telegram", handle: "@ai_hebrew", videoCount: 98, isOwned: true, language: "he", status: "active" },
  { id: "7", name: "World News Today", type: "source", platform: "telegram", handle: "@worldnews24", videoCount: 2103, isOwned: false, language: "en", status: "active" },
  { id: "8", name: "חדשות העולם", type: "target", platform: "telegram", handle: "@worldnews_he", videoCount: 445, isOwned: true, language: "he", status: "active" },
];

const mockVideos: Video[] = [
  { id: "v1", title: "Breaking: New AI Model Released", sourceChannel: "Tech News IL", targetChannel: "מדע וטכנולוגיה", status: "completed", duration: "4:32", createdAt: "2026-03-04T10:30:00", translatedTitle: "פריצת דרך: מודל AI חדש שוחרר", linksRemoved: 2, linksAdded: 1 },
  { id: "v2", title: "Bitcoin hits new ATH", sourceChannel: "Global Crypto", targetChannel: "קריפטו בעברית", status: "translating", duration: "6:15", createdAt: "2026-03-04T11:00:00", progress: 65 },
  { id: "v3", title: "GPT-5 Full Review", sourceChannel: "AI Updates", targetChannel: "בינה מלאכותית", status: "downloading", duration: "12:44", createdAt: "2026-03-04T11:15:00", progress: 30 },
  { id: "v4", title: "Global Markets Update", sourceChannel: "World News Today", targetChannel: "חדשות העולם", status: "queued", duration: "8:20", createdAt: "2026-03-04T11:30:00" },
  { id: "v5", title: "Space X Latest Launch", sourceChannel: "Tech News IL", targetChannel: "מדע וטכנולוגיה", status: "editing", duration: "5:10", createdAt: "2026-03-04T09:00:00", progress: 80 },
  { id: "v6", title: "Ethereum 2.0 Upgrade", sourceChannel: "Global Crypto", targetChannel: "קריפטו בעברית", status: "scheduled", duration: "7:45", createdAt: "2026-03-04T08:00:00", scheduledFor: "2026-03-04T18:00:00" },
  { id: "v7", title: "Quantum Computing Breakthrough", sourceChannel: "AI Updates", targetChannel: "בינה מלאכותית", status: "failed", duration: "9:30", createdAt: "2026-03-04T07:00:00", error: "Translation API timeout" },
  { id: "v8", title: "Middle East Peace Talks", sourceChannel: "World News Today", targetChannel: "חדשות העולם", status: "completed", duration: "11:20", createdAt: "2026-03-03T22:00:00", translatedTitle: "שיחות שלום במזרח התיכון", linksRemoved: 3, linksAdded: 2 },
];

const mockSchedule: ScheduledPost[] = [
  { id: "s1", videoId: "v6", channel: "קריפטו בעברית", scheduledFor: "2026-03-04T18:00:00", title: "שדרוג Ethereum 2.0" },
  { id: "s2", videoId: "v9", channel: "מדע וטכנולוגיה", scheduledFor: "2026-03-04T20:00:00", title: "מהפכת הרובוטיקה" },
  { id: "s3", videoId: "v10", channel: "חדשות העולם", scheduledFor: "2026-03-05T08:00:00", title: "סיכום חדשות יומי" },
  { id: "s4", videoId: "v11", channel: "בינה מלאכותית", scheduledFor: "2026-03-05T12:00:00", title: "סקירת כלי AI חדשים" },
  { id: "s5", videoId: "v12", channel: "קריפטו בעברית", scheduledFor: "2026-03-05T16:00:00", title: "ניתוח שוק שבועי" },
];

export function useDashboardData() {
  const [channels] = useState<Channel[]>(mockChannels);
  const [videos] = useState<Video[]>(mockVideos);
  const [schedule] = useState<ScheduledPost[]>(mockSchedule);

  const stats = {
    totalChannels: channels.length,
    sourceChannels: channels.filter(c => c.type === "source").length,
    targetChannels: channels.filter(c => c.type === "target").length,
    activeVideos: videos.filter(v => !["completed", "failed"].includes(v.status)).length,
    completedToday: videos.filter(v => v.status === "completed").length,
    failedToday: videos.filter(v => v.status === "failed").length,
    scheduledPosts: schedule.length,
    totalProcessed: 1247,
  };

  return { channels, videos, schedule, stats };
}
