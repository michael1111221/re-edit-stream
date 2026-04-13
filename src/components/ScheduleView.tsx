import { useState, useEffect, useRef, useCallback } from "react";
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
  Link2,
  ImagePlus,
  X,
  FileVideo,
  Bold,
  Underline,
  Italic,
  Smile,
  FileImage,
  FolderOpen,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Json } from "@/integrations/supabase/types";
import { InlineButton } from "@/lib/telegram";

interface SavedTemplate {
  id: string;
  name: string;
  caption: string;
  channel_handles: string[];
  inline_buttons: InlineButton[];
  media_url: string | null;
  media_type: string | null;
}

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface RecurringSchedule {
  id: string;
  name: string;
  caption: string;
  channel_handles: string[];
  inline_buttons: InlineButton[];
  days_of_week: number[];
  time_of_day: string;
  is_active: boolean;
  last_run_at: string | null;
  media_url: string | null;
  media_type: string | null;
}

interface ScheduleViewProps {
  schedule: ScheduledPost[];
  channels?: Channel[];
  onDelete?: (id: string) => void;
  onRefresh?: () => void;
}

export function ScheduleView({ schedule, channels = [], onDelete, onRefresh }: ScheduleViewProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rCaptionRef = useRef<HTMLTextAreaElement>(null);
  const [showREmoji, setShowREmoji] = useState(false);

  const EMOJI_LIST = [
    "😀", "😂", "🥰", "😎", "🤩", "😍", "🥳", "🤗", "😇", "🙏",
    "👍", "👎", "❤️", "🔥", "⭐", "💯", "✅", "❌", "🎉", "🎯",
    "💰", "💎", "🚀", "📢", "📌", "🔗", "📱", "💻", "🎬", "🎵",
    "👀", "💪", "🤝", "👏", "🙌", "✨", "💡", "⚡", "🌟", "🏆",
    "📣", "🔔", "💬", "📝", "🎁", "🛒", "💸", "📈", "🔑", "🌐",
  ];

  
  const today = new Date();
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringSchedule[]>([]);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
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
  const [rButtons, setRButtons] = useState<InlineButton[]>([]);
  const [rFile, setRFile] = useState<File | null>(null);
  const [rFilePreview, setRFilePreview] = useState<string | null>(null);
  const [rMediaUrl, setRMediaUrl] = useState<string | null>(null);
  const [rMediaType, setRMediaType] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const insertAtCursorR = useCallback((before: string, after: string = "") => {
    const ta = rCaptionRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = rCaption.substring(start, end);
    const newText = rCaption.substring(0, start) + before + selected + after + rCaption.substring(end);
    setRCaption(newText);
    setTimeout(() => {
      ta.focus();
      const cursorPos = start + before.length + selected.length + (selected ? after.length : 0);
      ta.setSelectionRange(selected ? cursorPos : start + before.length, selected ? cursorPos : start + before.length);
    }, 0);
  }, [rCaption]);

  const insertEmojiR = useCallback((emoji: string) => {
    const ta = rCaptionRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const newText = rCaption.substring(0, start) + emoji + rCaption.substring(start);
    setRCaption(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  }, [rCaption]);

  const targetChannels = channels.filter(c => c.type === "target" && c.status === "active");

  useEffect(() => {
    loadRecurring();
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data } = await supabase.from("post_templates").select("*").order("created_at", { ascending: false });
    if (data) {
      setTemplates(data.map(t => ({
        ...t,
        channel_handles: (t.channel_handles as any) || [],
        inline_buttons: (t.inline_buttons as any) || [],
      })));
    }
  };
  const applyTemplate = (templateId: string) => {
    const t = templates.find(t => t.id === templateId);
    if (!t) return;
    setRCaption(t.caption);
    setRChannels(t.channel_handles);
    setRButtons(t.inline_buttons || []);
    if (t.media_url) {
      setRMediaUrl(t.media_url);
      setRMediaType(t.media_type);
      setRFile(null);
      setRFilePreview(null);
    }
    toast({ title: `✅ תבנית "${t.name}" נטענה` });
  };

  const loadRecurring = async () => {
    const { data } = await supabase.from("recurring_schedules").select("*").order("created_at", { ascending: false });
    if (data) {
      setRecurringSchedules(data.map(r => ({
        ...r,
        channel_handles: (r.channel_handles as any) || [],
        inline_buttons: (r.inline_buttons as any) || [],
        days_of_week: r.days_of_week || [],
        media_url: (r as any).media_url || null,
        media_type: (r as any).media_type || null,
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
    setRButtons([]);
    setRFile(null);
    setRFilePreview(null);
    setRMediaUrl(null);
    setRMediaType(null);
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
    setRButtons(r.inline_buttons || []);
    setRFile(null);
    setRFilePreview(null);
    setRMediaUrl(r.media_url);
    setRMediaType(r.media_type);
    setShowRecurringDialog(true);
  };

  const getFileType = (file: File): "photo" | "video" | "document" => {
    if (file.type.startsWith("image/")) return "photo";
    if (file.type.startsWith("video/")) return "video";
    return "document";
  };

  const uploadFileToStorage = async (file: File): Promise<string> => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error("המשתמש לא מחובר");
    const ext = file.name.split(".").pop() || "bin";
    const path = `${userId}/recurring/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("temp-uploads").upload(path, file);
    if (error) throw new Error("שגיאה בהעלאת קובץ: " + error.message);
    const { data: urlData } = supabase.storage.from("temp-uploads").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "הקובץ גדול מדי", description: "מקסימום 50MB", variant: "destructive" });
      return;
    }
    setRFile(file);
    setRMediaUrl(null);
    setRMediaType(null);
    if (file.type.startsWith("image/")) {
      setRFilePreview(URL.createObjectURL(file));
    } else {
      setRFilePreview(null);
    }
  };

  const removeMedia = () => {
    setRFile(null);
    if (rFilePreview) URL.revokeObjectURL(rFilePreview);
    setRFilePreview(null);
    setRMediaUrl(null);
    setRMediaType(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

    setIsSaving(true);
    try {
      let mediaUrl = rMediaUrl;
      let mediaType = rMediaType;

      if (rFile) {
        mediaUrl = await uploadFileToStorage(rFile);
        mediaType = getFileType(rFile);
      }

      const validButtons = rButtons.filter(b => b.text && b.url);

      const payload = {
        name: rName,
        caption: rCaption,
        channel_handles: rChannels as unknown as Json,
        inline_buttons: validButtons as unknown as Json,
        days_of_week: rDays,
        time_of_day: rTime,
        media_url: mediaUrl,
        media_type: mediaType,
      } as any;

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
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
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
                  <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    {r.name}
                    {r.media_url && (
                      <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                        {r.media_type === "photo" ? "📷" : r.media_type === "video" ? "🎬" : "📎"} מדיה
                      </span>
                    )}
                    {r.inline_buttons.length > 0 && (
                      <span className="text-xs bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                        🔗 {r.inline_buttons.length} כפתורים
                      </span>
                    )}
                  </div>
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
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Repeat className="w-5 h-5 text-primary" />
              {editingId ? "עריכת תזמון חוזר" : "תזמון חוזר חדש"}
            </DialogTitle>
          </DialogHeader>

          {/* Load Template */}
          {templates.length > 0 && (
            <div className="border border-border rounded-lg p-3 bg-secondary/30">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5 mb-2">
                <FolderOpen className="w-4 h-4 text-primary" /> טען מתבנית שמורה
              </Label>
              <div className="space-y-1">
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t.id)}
                    className="w-full text-right text-sm text-foreground hover:text-primary hover:bg-muted px-2 py-1.5 rounded transition-colors flex items-center justify-between"
                  >
                    <span>{t.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.media_url ? "📎 " : ""}{t.caption ? t.caption.substring(0, 20) + (t.caption.length > 20 ? "..." : "") : "ללא טקסט"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">שם</Label>
              <Input value={rName} onChange={e => setRName(e.target.value)} placeholder="למשל: פרסום יומי בוקר" className="mt-1 bg-secondary border-border" />
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">הודעה</Label>
              <div className="flex items-center gap-1 mt-1 mb-1">
                <button type="button" onClick={() => insertAtCursorR("<b>", "</b>")}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="מודגש">
                  <Bold className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => insertAtCursorR("<i>", "</i>")}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="נטוי">
                  <Italic className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => insertAtCursorR("<u>", "</u>")}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="קו תחתון">
                  <Underline className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button type="button" onClick={() => setShowREmoji(!showREmoji)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="אימוג'י">
                    <Smile className="w-4 h-4" />
                  </button>
                  {showREmoji && (
                    <div className="absolute top-full right-0 mt-1 z-50 bg-card border border-border rounded-lg p-2 shadow-lg w-64 max-h-40 overflow-y-auto">
                      <div className="grid grid-cols-10 gap-0.5">
                        {EMOJI_LIST.map(e => (
                          <button key={e} type="button" onClick={() => { insertEmojiR(e); setShowREmoji(false); }}
                            className="p-1 text-base hover:bg-muted rounded transition-colors">{e}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <Textarea ref={rCaptionRef} value={rCaption} onChange={e => setRCaption(e.target.value)} placeholder="טקסט ההודעה (תומך HTML)" className="bg-secondary border-border min-h-[60px]" />
            </div>

            {/* Media */}
            <div>
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5 mb-2">
                <ImagePlus className="w-3.5 h-3.5" />
                מדיה (אופציונלי)
              </Label>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,video/*" className="hidden" />
              {rFile ? (
                <div className="relative rounded-lg border border-border bg-secondary p-3">
                  <button type="button" onClick={removeMedia}
                    className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:opacity-80 z-10">
                    <X className="w-3 h-3" />
                  </button>
                  {rFilePreview ? (
                    <img src={rFilePreview} alt="תצוגה מקדימה" className="w-full max-h-32 object-contain rounded" />
                  ) : (
                    <div className="flex items-center gap-3 text-sm text-foreground">
                      <FileVideo className="w-6 h-6 text-primary" />
                      <span>{rFile.name} ({(rFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                    </div>
                  )}
                </div>
              ) : rMediaUrl ? (
                <div className="relative rounded-lg border border-border bg-secondary p-3">
                  <button type="button" onClick={removeMedia}
                    className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:opacity-80 z-10">
                    <X className="w-3 h-3" />
                  </button>
                  {rMediaType === "photo" ? (
                    <img src={rMediaUrl} alt="מדיה שמורה" className="w-full max-h-32 object-contain rounded" />
                  ) : (
                    <div className="flex items-center gap-3 text-sm text-foreground">
                      {rMediaType === "video" ? <FileVideo className="w-6 h-6 text-primary" /> : <FileImage className="w-6 h-6 text-primary" />}
                      <span className="text-muted-foreground">מדיה שמורה</span>
                    </div>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 hover:bg-secondary/50 transition-colors">
                  <ImagePlus className="w-6 h-6 mx-auto mb-1 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">לחץ להעלאת תמונה או סרטון</span>
                </button>
              )}
            </div>

            {/* Channels */}
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

            {/* Days */}
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

            {/* Time */}
            <div>
              <Label className="text-sm text-muted-foreground">שעה</Label>
              <Input type="time" value={rTime} onChange={e => setRTime(e.target.value)} className="mt-1 bg-secondary border-border w-32" dir="ltr" />
            </div>

            {/* Inline Buttons */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" /> כפתורי URL
                </Label>
                <button type="button" onClick={() => setRButtons([...rButtons, { text: "", url: "" }])}
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> הוסף כפתור
                </button>
              </div>
              {rButtons.map((btn, i) => (
                <div key={i} className="flex gap-2 items-center mb-2">
                  <Input value={btn.text} onChange={e => {
                    const updated = [...rButtons];
                    updated[i] = { ...updated[i], text: e.target.value };
                    setRButtons(updated);
                  }} placeholder="טקסט" className="bg-secondary border-border text-sm flex-1" />
                  <Input value={btn.url} onChange={e => {
                    const updated = [...rButtons];
                    updated[i] = { ...updated[i], url: e.target.value };
                    setRButtons(updated);
                  }} placeholder="https://..." dir="ltr" className="bg-secondary border-border text-sm flex-1" />
                  <button type="button" onClick={() => setRButtons(rButtons.filter((_, idx) => idx !== i))}
                    className="p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <Button onClick={saveRecurring} disabled={isSaving} className="w-full gradient-primary text-primary-foreground gap-2">
              <Repeat className="w-4 h-4" />
              {isSaving ? "שומר..." : editingId ? "עדכן תזמון" : "צור תזמון חוזר"}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground">תאריך</Label>
                <Input type="date" value={editPostDate} onChange={e => setEditPostDate(e.target.value)} className="mt-1 bg-secondary border-border" dir="ltr" />
              </div>
              <div>
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
