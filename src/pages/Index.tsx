import { useState } from "react";
import { SidebarNav } from "@/components/SidebarNav";
import { DashboardView } from "@/components/DashboardView";
import { ChannelList } from "@/components/ChannelList";
import { VideoPipeline } from "@/components/VideoPipeline";
import { ScheduleView } from "@/components/ScheduleView";
import { SettingsView } from "@/components/SettingsView";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { PageView } from "@/types/dashboard";
import { motion, AnimatePresence } from "framer-motion";

const Index = () => {
  const [currentPage, setCurrentPage] = useState<PageView>("dashboard");
  const { channels, videos, schedule, stats } = useDashboardData();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <SidebarNav currentPage={currentPage} onNavigate={setCurrentPage} />

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
              <ChannelList channels={channels} />
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
              <ScheduleView schedule={schedule} />
            )}
            {currentPage === "settings" && (
              <SettingsView />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
