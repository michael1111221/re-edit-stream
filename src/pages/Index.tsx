import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarNav } from "@/components/SidebarNav";
import { supabase } from "@/integrations/supabase/client";
import { DashboardView } from "@/components/DashboardView";
import { ChannelList } from "@/components/ChannelList";
import { VideoPipeline } from "@/components/VideoPipeline";
import { ScheduleView } from "@/components/ScheduleView";
import { MappingsView } from "@/components/MappingsView";
import { CatalogView } from "@/components/CatalogView";
import { SchedulerRunsView } from "@/components/SchedulerRunsView";
import { SettingsView } from "@/components/SettingsView";
import { AddChannelDialog } from "@/components/AddChannelDialog";
import { PublishDialog } from "@/components/PublishDialog";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { PageView, Channel } from "@/types/dashboard";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Menu, Send, Zap } from "lucide-react";

const pageTitles: Record<PageView, string> = {
  dashboard: "דאשבורד",
  channels: "ערוצים",
  mappings: "מיפויים",
  catalog: "בוט קטלוג",
  pipeline: "תור עיבוד",
  schedule: "תזמון",
  "scheduler-runs": "ריצות תזמון",
  settings: "הגדרות",
};

const Index = () => {
  const [currentPage, setCurrentPage] = useState<PageView>("dashboard");
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { channels, videos, schedule, stats, addChannel, updateChannel, deleteChannel, deleteScheduledPost } = useDashboardData();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleToggleStatus = (channel: Channel) => {
    updateChannel.mutate(
      { id: channel.id, status: channel.status === "active" ? "paused" : "active" },
      { onSuccess: () => toast({ title: `ערוץ ${channel.status === "active" ? "מושהה" : "הופעל"}` }) }
    );
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <SidebarNav
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onPublish={() => setPublishOpen(true)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 sm:px-4 h-14 border-b border-border bg-background/95 backdrop-blur">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -m-2 rounded-md text-foreground hover:bg-secondary/60"
          aria-label="פתח תפריט"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md gradient-primary flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-base sm:text-lg truncate">
            {pageTitles[currentPage]}
          </span>
        </div>

        <button
          onClick={() => setPublishOpen(true)}
          className="p-2 -m-2 rounded-md text-primary hover:bg-secondary/60"
          aria-label="פרסם לטלגרם"
        >
          <Send className="w-5 h-5" />
        </button>
      </header>

      <main className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 max-w-full overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {currentPage === "dashboard" && (
              <DashboardView stats={stats} videos={videos} onNavigate={setCurrentPage} />
            )}
            {currentPage === "channels" && (
              <ChannelList
                channels={channels}
                onAddChannel={() => setAddChannelOpen(true)}
                onToggleStatus={handleToggleStatus}
                onDeleteChannel={async (channel) => {
                  // Check for connected mappings
                  const { data: mappings } = await supabase
                    .from("channel_mappings")
                    .select("id, source_channel_id, target_channel_id")
                    .or(`source_channel_id.eq.${channel.id},target_channel_id.eq.${channel.id}`);
                  
                  const count = mappings?.length || 0;
                  const msg = count > 0
                    ? `לערוץ "${channel.name}" יש ${count} מיפויים מחוברים. המחיקה תסיר גם אותם. להמשיך?`
                    : `למחוק את הערוץ "${channel.name}"?`;
                  
                  if (!confirm(msg)) return;
                  
                  deleteChannel.mutate(channel.id, {
                    onSuccess: () => toast({ title: `ערוץ "${channel.name}" נמחק` }),
                    onError: (err) => toast({ title: "שגיאה במחיקה", description: err.message, variant: "destructive" }),
                  });
                }}
              />
            )}
            {currentPage === "mappings" && (
              <MappingsView channels={channels} />
            )}
            {currentPage === "catalog" && (
              <CatalogView channels={channels} />
            )}
            {currentPage === "pipeline" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">תור עיבוד</h2>
                  <p className="text-sm text-muted-foreground mt-1">כל הסרטונים בתהליך עיבוד</p>
                </div>
                <VideoPipeline videos={videos} />
              </div>
            )}
            {currentPage === "schedule" && (
              <ScheduleView
                schedule={schedule}
                channels={channels}
                onDelete={(id) => deleteScheduledPost.mutate(id, {
                  onSuccess: () => toast({ title: "פרסום מתוזמן נמחק" }),
                })}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ["scheduled_posts"] })}
              />
            )}
            {currentPage === "scheduler-runs" && (
              <SchedulerRunsView />
            )}
            {currentPage === "settings" && (
              <SettingsView />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AddChannelDialog
        open={addChannelOpen}
        onOpenChange={setAddChannelOpen}
        onAdd={(data) => {
          addChannel.mutate(data, {
            onSuccess: () => {
              setAddChannelOpen(false);
              toast({ title: "ערוץ נוסף בהצלחה" });
            },
            onError: (err) => toast({ title: "שגיאה בהוספת ערוץ", description: err.message, variant: "destructive" }),
          });
        }}
      />

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        channels={channels}
        onScheduled={() => {
          // Refresh scheduled posts
          toast({ title: "📅 הפרסום תוזמן בהצלחה" });
        }}
      />
    </div>
  );
};

export default Index;
