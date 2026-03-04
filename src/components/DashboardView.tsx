import { StatsOverview } from "@/components/StatsOverview";
import { VideoPipeline } from "@/components/VideoPipeline";
import { Video } from "@/types/dashboard";
import { motion } from "framer-motion";
import { Activity, ArrowLeft } from "lucide-react";

interface DashboardViewProps {
  stats: {
    totalChannels: number;
    sourceChannels: number;
    targetChannels: number;
    activeVideos: number;
    completedToday: number;
    failedToday: number;
    scheduledPosts: number;
    totalProcessed: number;
  };
  videos: Video[];
  onNavigate: (page: "pipeline") => void;
}

export function DashboardView({ stats, videos, onNavigate }: DashboardViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">מרכז שליטה</h1>
        <p className="text-sm text-muted-foreground mt-1">סקירה כללית של כל הפעילות</p>
      </div>

      <StatsOverview stats={stats} />

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-lg border border-border bg-card p-5 shadow-card"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-foreground">פעילות אחרונה</h3>
          </div>
          <button
            onClick={() => onNavigate("pipeline")}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            הצג הכל
            <ArrowLeft className="w-3 h-3" />
          </button>
        </div>
        <VideoPipeline videos={videos} compact />
      </motion.div>
    </div>
  );
}
