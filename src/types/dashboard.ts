import { Tables } from "@/integrations/supabase/types";

export type Channel = Tables<"channels">;
export type Video = Tables<"videos"> & {
  source_channel?: Channel | null;
  target_channel?: Channel | null;
};
export type ScheduledPost = Tables<"scheduled_posts"> & {
  channel?: Channel | null;
  video?: { title: string } | null;
};
export type ChannelMapping = Tables<"channel_mappings"> & {
  source_channel?: Channel | null;
  target_channel?: Channel | null;
};
export type BannedWord = Tables<"banned_words">;

export type PageView = "dashboard" | "channels" | "pipeline" | "schedule" | "settings" | "mappings";
