import { motion } from "framer-motion";
import { Video } from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Download, 
  Languages, 
  Scissors, 
  Clock, 
  Upload, 
  CheckCircle2, 
  XCircle,
  Loader2 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPipelineProps {
  videos: Video[];
  compact?: boolean;
}

const statusConfig: Record<Video["status"], { label: string; icon: React.ElementType; color: string }> = {
  queued: { label: "בתור", icon: Clock, color: "bg-muted text-muted-foreground" },
  downloading: { label: "מוריד", icon: Download, color: "bg-info/15 text-info" },
  translating: { label: "מתרגם", icon: Languages, color: "bg-accent/15 text-accent" },
  editing: { label: "עורך", icon: Scissors, color: "bg-warning/15 text-warning" },
  scheduled: { label: "מתוזמן", icon: Clock, color: "bg-primary/15 text-primary" },
  publishing: { label: "מפרסם", icon: Upload, color: "bg-info/15 text-info" },
  completed: { label: "הושלם", icon: CheckCircle2, color: "bg-success/15 text-success" },
  failed: { label: "נכשל", icon: XCircle, color: "bg-destructive/15 text-destructive" },
};

export function VideoPipeline({ videos, compact = false }: VideoPipelineProps) {
  const displayVideos = compact ? videos.slice(0, 5) : videos;

  return (
    <div className="space-y-2">
      {displayVideos.map((video, i) => {
        const config = statusConfig[video.status];
        const Icon = config.icon;
        const isActive = ["downloading", "translating", "editing", "publishing"].includes(video.status);

        return (
          <motion.div
            key={video.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 p-3 rounded-md border border-border bg-card/50 hover:bg-secondary/30 transition-colors"
          >
            <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0", config.color)}>
              <Icon className={cn("w-4 h-4", isActive && "animate-pulse-glow")} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{video.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {video.sourceChannel} → {video.targetChannel} · {video.duration}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {video.progress !== undefined && isActive && (
                <div className="w-20">
                  <Progress value={video.progress} className="h-1.5" />
                </div>
              )}
              <Badge variant="outline" className={cn("text-xs border-0", config.color)}>
                {config.label}
              </Badge>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
