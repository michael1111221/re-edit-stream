export interface Channel {
  id: string;
  name: string;
  type: "source" | "target";
  platform: "telegram";
  handle: string;
  videoCount: number;
  isOwned: boolean;
  language: string;
  status: "active" | "paused" | "error";
}

export interface Video {
  id: string;
  title: string;
  sourceChannel: string;
  targetChannel: string;
  status: "queued" | "downloading" | "translating" | "editing" | "scheduled" | "publishing" | "completed" | "failed";
  duration: string;
  createdAt: string;
  translatedTitle?: string;
  linksRemoved?: number;
  linksAdded?: number;
  progress?: number;
  scheduledFor?: string;
  error?: string;
}

export interface ScheduledPost {
  id: string;
  videoId: string;
  channel: string;
  scheduledFor: string;
  title: string;
}

export type PageView = "dashboard" | "channels" | "pipeline" | "schedule" | "settings";
