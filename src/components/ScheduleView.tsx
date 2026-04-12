import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ScheduledPost, Channel } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Trash2,
  Edit3,
  Plus,
  CalendarClock,
  Clock,
  Repeat,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Json } from "@/integrations/supabase/types";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface RecurringSchedule {
  id: string;
  name: string;
  caption: string;
  channel_handles: string[];
  inline_buttons: any[];
  days_of_week: number[];
  time_of_day: string;
  is_active: boolean;
  last_run_at: string | null;
}

interface ScheduleViewProps {
  schedule: ScheduledPost[];
  channels?: Channel[];
  onDelete?: (id: string) => void;
  onRefresh?: () => void;
}

export function ScheduleView({ schedule, channels = [], onDelete, onRefresh }: ScheduleViewProps) {
  const { toast } = useToast();
  const today = new Date();
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringSchedule[]>([]);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [showEditPostDialog, setShowEditPostDialog] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostDate, setEditPostDate] = useState("");
  const [editPostTime, setEditPostTime] = useState("");
  const [editPostChannel, setEditPostChannel] = useState<string>("");

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rName, setRName] = useState("");
  const [rCaption, setRCaption] = useState("");
  const [rChannels, setRChannels] = useState<string[]>([]);
  const [rDays, setRDays] = useState<number[]>([]);
  const [rTime, setRTime] = useState("12:00");

  const targetChannels = channels.filter(c => c.type === "target" && c.status === "active");

  useEffect(() => {
    loadRecurring();
  }, []);

  const loadRecurring = async () => {
    const { data } = await supabase.from("recurring_schedules").select("*").order("created_at", { ascending: false });
    if (data) {
      setRecurringSchedules(data.map(r => ({
        ...r,
        channel_handles: (r.channel_handles as any) || [],
        inline_buttons: (r.inline_buttons as any) || [],
        days_of_week: r.days_of_week || [],
      })));
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setRName("");
    setRCaption("");
    setRChannels([]);
    setRDays([]);
    setRTime("12:00");
  };

  const openNewRecurring = () => {
    resetForm();
    setShowRecurringDialog(true);
  };

  const openEditRecurring = (r: RecurringSchedule) => {
    setEditingId(r.id);
    setRName(r.name);
    setRCaption(r.caption);
    setRChannels(r.channel_handles);
    setRDays(r.days_of_week);
    setRTime(r.time_of_day);
    setShowRecurringDialog(true);
  };

  const saveRecurring = async () => {
    if (!rName.trim()) {
      toast({ title: "הזן שם לתזמון", variant: "destructive" });
      return;
    }
    if (rDays.length === 0) {
      toast({ title: "בחר לפחות יום אחד", variant: "destructive" });
      return;
    }
    if (rChannels.length === 0) {
      toast({ title: "בחר לפחות ערוץ אחד", variant: "destructive" });
      return;
    }

    const payload = {
      name: rName,
      caption: rCaption,
      channel_handles: rChannels as unknown as Json,
      inline_buttons: [] as unknown as Json,
      days_of_week: rDays,
      time_of_day: rTime,
    };

    if (editingId) {
      const { error } = await supabase.from("recurring_schedules").update(payload).eq("id", editingId);
      if (error) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); return; }
      toast({ title: "✅ תזמון חוזר עודכן" });
    } else {
      const { error } = await supabase.from("recurring_schedules").insert(payload);
      if (error) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); return; }
      toast({ title: "✅ תזמון חוזר נוצר" });
    }

    setShowRecurringDialog(false);
    resetForm();
    loadRecurring();
  };

  const toggleRecurringActive = async (id: string, is_active: boolean) => {
    await supabase.from("recurring_schedules").update({ is_active: !is_active }).eq("id", id);
    loadRecurring();
  };

  const deleteRecurring = async (id: string) => {
    if (!confirm("למחוק תזמון חוזר זה?")) return;
    await supabase.from("recurring_schedules").delete().eq("id", id);
    loadRecurring();
    toast({ title: "תזמון חוזר נמחק" });
  };

  const toggleDay = (day: number) => {
    setRDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  };

  const openEditPost = (post: ScheduledPost) => {
    setEditingPost(post);
    setEditPostTitle(post.title);
    const d = new Date(post.scheduled_for);
    setEditPostDate(format(d, "yyyy-MM-dd"));
    setEditPostTime(format(d, "HH:mm"));
    setEditPostChannel(post.channel_id || "");
    setShowEditPostDialog(true);
  };

  const saveEditPost = async () => {
    if (!editingPost) return;
    const scheduledFor = new Date(`${editPostDate}T${editPostTime}:00`);
    const { error } = await supabase.from("scheduled_posts").update({
      title: editPostTitle,
      scheduled_for: scheduledFor.toISOString(),
      channel_id: editPostChannel || null,
    }).eq("id", editingPost.id);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ פרסום מתוזמן עודכן" });
    setShowEditPostDialog(false);
    setEditingPost(null);
    onRefresh?.();
  };

  const grouped = schedule.reduce<Record<string, ScheduledPost[]>>((acc, post) => {
    const day = format(new Date(post.scheduled_for), "yyyy-MM-dd");
    if (!acc[day]) acc[day] = [];
    acc[day].push(post);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">תזמון פרסום</h2>
        <Button size="sm" className="gradient-primary text-primary-foreground gap-1.5" onClick={openNewRecurring}>
          <Repeat className="w-4 h-4" />
          תזמון חוזר
        </Button>
      </div>

      {/* Recurring Schedules */}
      {recurringSchedules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Repeat className="w-4 h-4" /> תזמונים חוזרים
          </h3>
          <div className="space-y-2">
            {recurringSchedules.map(r => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 rounded-md border border-border bg-card/50 hover:bg-secondary/30 transition-colors group"
              >
                <div className="shrink-0">
                  <Switch checked={r.is_active} onCheckedChange={() => toggleRecurringActive(r.id, r.is_active)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{r.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.days_of_week.map(d => DAY_NAMES[d]).join(", ")} • {r.time_of_day}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.channel_handles.length} ערוצים
                    {r.caption && ` • "${r.caption.substring(0, 30)}${r.caption.length > 30 ? '...' : ''}"`}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEditRecurring(r)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteRecurring(r.id)} className="p-1.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* One-time scheduled posts */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4" /> פרסומים מתוזמנים
        </h3>

        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">אין פרסומים מתוזמנים</div>
        )}

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
                          {format(new Date(post.scheduled_for), "HH:mm")}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{post.title}</div>
                        <div className="text-xs text-muted-foreground">{post.channel?.name || "—"}</div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditPost(post)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete?.(post.id)}
                          className="p-1.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                        >
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

      {/* Recurring Schedule Dialog */}
      <Dialog open={showRecurringDialog} onOpenChange={setShowRecurringDialog}>
        <DialogContent className="bg-card border-border max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Repeat className="w-5 h-5 text-primary" />
              {editingId ? "עריכת תזמון חוזר" : "תזמון חוזר חדש"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">שם</Label>
              <Input value={rName} onChange={e => setRName(e.target.value)} placeholder="למשל: פרסום יומי בוקר" className="mt-1 bg-secondary border-border" />
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">הודעה</Label>
              <Textarea value={rCaption} onChange={e => setRCaption(e.target.value)} placeholder="טקסט ההודעה (תומך HTML)" className="mt-1 bg-secondary border-border min-h-[60px]" />
            </div>

            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">ערוצי יעד</Label>
              <div className="space-y-1.5 rounded-md border border-border bg-secondary p-2 max-h-32 overflow-y-auto">
                {targetChannels.map(ch => (
                  <label key={ch.id} className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted",
                    rChannels.includes(ch.handle) && "bg-muted"
                  )}>
                    <Checkbox checked={rChannels.includes(ch.handle)} onCheckedChange={() => {
                      setRChannels(prev => prev.includes(ch.handle) ? prev.filter(h => h !== ch.handle) : [...prev, ch.handle]);
                    }} />
                    <span className="text-sm text-foreground">{ch.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">ימים</Label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_NAMES.map((name, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                      rDays.includes(i)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">שעה</Label>
              <Input type="time" value={rTime} onChange={e => setRTime(e.target.value)} className="mt-1 bg-secondary border-border w-32" dir="ltr" />
            </div>

            <Button onClick={saveRecurring} className="w-full gradient-primary text-primary-foreground gap-2">
              <Repeat className="w-4 h-4" />
              {editingId ? "עדכן תזמון" : "צור תזמון חוזר"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Scheduled Post Dialog */}
      <Dialog open={showEditPostDialog} onOpenChange={setShowEditPostDialog}>
        <DialogContent className="bg-card border-border max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-primary" />
              עריכת פרסום מתוזמן
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">טקסט</Label>
              <Textarea value={editPostTitle} onChange={e => setEditPostTitle(e.target.value)} className="mt-1 bg-secondary border-border min-h-[60px]" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">ערוץ</Label>
              <Select value={editPostChannel} onValueChange={setEditPostChannel}>
                <SelectTrigger className="mt-1 bg-secondary border-border">
                  <SelectValue placeholder="בחר ערוץ" />
                </SelectTrigger>
                <SelectContent>
                  {targetChannels.map(ch => (
                    <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-sm text-muted-foreground">תאריך</Label>
                <Input type="date" value={editPostDate} onChange={e => setEditPostDate(e.target.value)} className="mt-1 bg-secondary border-border" dir="ltr" />
              </div>
              <div className="w-28">
                <Label className="text-sm text-muted-foreground">שעה</Label>
                <Input type="time" value={editPostTime} onChange={e => setEditPostTime(e.target.value)} className="mt-1 bg-secondary border-border" dir="ltr" />
              </div>
            </div>
            <Button onClick={saveEditPost} className="w-full gradient-primary text-primary-foreground gap-2">
              <Edit3 className="w-4 h-4" />
              עדכן פרסום
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
