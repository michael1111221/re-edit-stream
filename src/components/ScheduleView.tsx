import { motion } from "framer-motion";
import { ScheduledPost } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Clock, 
  Play, 
  Trash2, 
  Edit3, 
  Plus,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface ScheduleViewProps {
  schedule: ScheduledPost[];
}

export function ScheduleView({ schedule }: ScheduleViewProps) {
  const today = new Date();
  const grouped = schedule.reduce<Record<string, ScheduledPost[]>>((acc, post) => {
    const day = format(new Date(post.scheduledFor), "yyyy-MM-dd");
    if (!acc[day]) acc[day] = [];
    acc[day].push(post);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">תזמון פרסום</h2>
        <Button size="sm" className="gradient-primary text-primary-foreground gap-1.5">
          <Plus className="w-4 h-4" />
          תזמן פרסום
        </Button>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([day, posts], dayIndex) => {
          const date = new Date(day);
          const isToday = format(today, "yyyy-MM-dd") === day;

          return (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: dayIndex * 0.1 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-2 h-2 rounded-full ${isToday ? "bg-primary animate-pulse-glow" : "bg-muted-foreground"}`} />
                <span className="text-sm font-medium text-foreground">
                  {isToday ? "היום" : format(date, "EEEE, d בMMMM", { locale: he })}
                </span>
                <span className="text-xs text-muted-foreground">({posts.length} פרסומים)</span>
              </div>

              <div className="mr-4 border-r border-border pr-4 space-y-2">
                {posts.map((post, i) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: dayIndex * 0.1 + i * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-md border border-border bg-card/50 hover:bg-secondary/30 transition-colors group"
                  >
                    <div className="w-14 text-center shrink-0">
                      <div className="text-sm font-mono font-medium text-primary">
                        {format(new Date(post.scheduledFor), "HH:mm")}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{post.title}</div>
                      <div className="text-xs text-muted-foreground">{post.channel}</div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
