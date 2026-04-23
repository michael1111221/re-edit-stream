import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Activity, CheckCircle2, XCircle, Clock, ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface RunDetail {
  type: "scheduled" | "recurring";
  schedule_name?: string;
  post_title?: string;
  channel: string;
  status: "success" | "failed" | "skipped";
  message_id?: number;
  error?: string;
  at: string;
}

interface SchedulerRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  scheduled_processed: number;
  recurring_matched: number;
  sends_success: number;
  sends_failed: number;
  error: string | null;
  details: RunDetail[];
}

export function SchedulerRunsView() {
  const [limit, setLimit] = useState(20);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: runs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["scheduler_runs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduler_runs" as any)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as SchedulerRun[];
    },
    refetchInterval: 15000,
  });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ריצות תזמון</h1>
          <p className="text-sm text-muted-foreground mt-1">
            היסטוריית הפעלות התזמון, התאמות, ותוצאות שליחה לכל ערוץ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="text-sm bg-card border border-border rounded-md px-2 py-1.5 text-foreground"
          >
            <option value={10}>10 אחרונות</option>
            <option value={20}>20 אחרונות</option>
            <option value={50}>50 אחרונות</option>
            <option value={100}>100 אחרונות</option>
          </select>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 text-sm bg-card border border-border rounded-md px-3 py-1.5 text-foreground hover:bg-secondary transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")} />
            רענן
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          טוען...
        </div>
      ) : !runs || runs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          לא נמצאו ריצות עדיין. ריצות עם פעילות בלבד נשמרות.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run, i) => {
            const isOpen = expanded[run.id];
            const hasError = !!run.error || run.sends_failed > 0;
            return (
              <motion.div
                key={run.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="rounded-lg border border-border bg-card shadow-card overflow-hidden"
              >
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [run.id]: !p[run.id] }))}
                  className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors text-right"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-md flex items-center justify-center",
                      hasError ? "bg-destructive/10" : "bg-primary/10"
                    )}>
                      <Activity className={cn("w-4 h-4", hasError ? "text-destructive" : "text-primary")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {formatTime(run.started_at)}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>מתוזמנים: {run.scheduled_processed}</span>
                        <span>חוזרים תאמו: {run.recurring_matched}</span>
                        <span className="text-success flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {run.sends_success}
                        </span>
                        {run.sends_failed > 0 && (
                          <span className="text-destructive flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> {run.sends_failed}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-background/30 p-4 space-y-2">
                    {run.error && (
                      <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                        שגיאה כללית: {run.error}
                      </div>
                    )}
                    {(!run.details || run.details.length === 0) ? (
                      <div className="text-xs text-muted-foreground">אין פירוט שליחות לריצה זו.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {run.details.map((d, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-3 text-xs p-2 rounded-md bg-card border border-border"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {d.status === "success" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                              ) : d.status === "failed" ? (
                                <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span className="text-muted-foreground shrink-0">
                                {d.type === "recurring" ? "חוזר" : "מתוזמן"}
                              </span>
                              <span className="text-foreground truncate">
                                {d.schedule_name || d.post_title || "—"}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-foreground truncate" dir="ltr">{d.channel}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {d.message_id && (
                                <span className="text-muted-foreground" dir="ltr">#{d.message_id}</span>
                              )}
                              {d.error && (
                                <span className="text-destructive truncate max-w-[200px]" title={d.error}>
                                  {d.error}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
