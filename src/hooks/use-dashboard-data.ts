import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Channel, Video, ScheduledPost } from "@/types/dashboard";
import { TablesInsert } from "@/integrations/supabase/types";

export function useDashboardData() {
  const queryClient = useQueryClient();

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("channels").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Channel[];
    },
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, source_channel:channels!videos_source_channel_id_fkey(*), target_channel:channels!videos_target_channel_id_fkey(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Video[];
    },
  });

  const { data: schedule = [] } = useQuery({
    queryKey: ["scheduled_posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_posts")
        .select("*, channel:channels(*), video:videos(title)")
        .order("scheduled_for", { ascending: true });
      if (error) throw error;
      return data as ScheduledPost[];
    },
  });

  const addChannel = useMutation({
    mutationFn: async (channel: TablesInsert<"channels">) => {
      const { data, error } = await supabase.from("channels").insert(channel).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const updateChannel = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesInsert<"channels">>) => {
      const { error } = await supabase.from("channels").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const addScheduledPost = useMutation({
    mutationFn: async (post: TablesInsert<"scheduled_posts">) => {
      const { data, error } = await supabase.from("scheduled_posts").insert(post).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduled_posts"] }),
  });

  const deleteScheduledPost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduled_posts"] }),
  });

  const stats = {
    totalChannels: channels.length,
    sourceChannels: channels.filter(c => c.type === "source").length,
    targetChannels: channels.filter(c => c.type === "target").length,
    activeVideos: videos.filter(v => !["completed", "failed"].includes(v.status)).length,
    completedToday: videos.filter(v => v.status === "completed").length,
    failedToday: videos.filter(v => v.status === "failed").length,
    scheduledPosts: schedule.length,
    totalProcessed: videos.filter(v => v.status === "completed").length,
  };

  return {
    channels,
    videos,
    schedule,
    stats,
    addChannel,
    updateChannel,
    deleteChannel,
    addScheduledPost,
    deleteScheduledPost,
  };
}
