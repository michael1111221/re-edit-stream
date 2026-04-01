import { useState } from "react";
import { SidebarNav } from "@/components/SidebarNav";
import { DashboardView } from "@/components/DashboardView";
import { ChannelList } from "@/components/ChannelList";
import { VideoPipeline } from "@/components/VideoPipeline";
import { ScheduleView } from "@/components/ScheduleView";
import { MappingsView } from "@/components/MappingsView";
import { SettingsView } from "@/components/SettingsView";
import { AddChannelDialog } from "@/components/AddChannelDialog";
import { PublishDialog } from "@/components/PublishDialog";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { PageView, Channel } from "@/types/dashboard";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [currentPage, setCurrentPage] = useState<PageView>("dashboard");
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const { channels, videos, schedule, stats, addChannel, updateChannel, deleteChannel, deleteScheduledPost } = useDashboardData();
  const { toast } = useToast();

  const handleToggleStatus = (channel: Channel) => {
    updateChannel.mutate(
      { id: channel.id, status: channel.status === "active" ? "paused" : "active" },
      { onSuccess: () => toast({ title: `ערוץ ${channel.status === "active" ? "מושהה" : "הופעל"}` }) }
    );
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <SidebarNav currentPage={currentPage} onNavigate={setCurrentPage} onPublish={() => setPublishOpen(true)} />

      <main className="mr-56 p-6">
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
                onDelete={(id) => deleteScheduledPost.mutate(id, {
                  onSuccess: () => toast({ title: "פרסום מתוזמן נמחק" }),
                })}
              />
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
