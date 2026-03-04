import { motion } from "framer-motion";
import { 
  Radio, 
  Video, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

interface StatsOverviewProps {
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
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  const cards = [
    {
      label: "ערוצים פעילים",
      value: stats.totalChannels,
      sub: `${stats.sourceChannels} מקור · ${stats.targetChannels} יעד`,
      icon: Radio,
      color: "text-primary",
      trend: "+3",
      trendUp: true,
    },
    {
      label: "בעיבוד כרגע",
      value: stats.activeVideos,
      sub: "סרטונים בתור",
      icon: Video,
      color: "text-info",
      trend: null,
      trendUp: false,
    },
    {
      label: "הושלמו היום",
      value: stats.completedToday,
      sub: `${stats.totalProcessed} סה״כ`,
      icon: CheckCircle2,
      color: "text-success",
      trend: "+12%",
      trendUp: true,
    },
    {
      label: "מתוזמנים",
      value: stats.scheduledPosts,
      sub: "ממתינים לפרסום",
      icon: Clock,
      color: "text-warning",
      trend: null,
      trendUp: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-lg border border-border bg-card p-5 shadow-card"
          >
            <div className="flex items-start justify-between mb-3">
              <Icon className={`w-5 h-5 ${card.color}`} />
              {card.trend && (
                <span className={`flex items-center gap-0.5 text-xs font-medium ${card.trendUp ? "text-success" : "text-destructive"}`}>
                  {card.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {card.trend}
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-foreground">{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
            <div className="text-xs text-muted-foreground/70 mt-0.5">{card.label}</div>
          </motion.div>
        );
      })}
    </div>
  );
}
