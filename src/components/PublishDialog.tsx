import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Channel } from "@/types/dashboard";
import { sendVideoToChannel, copyMessageToChannel, InlineButton } from "@/lib/telegram";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Video, MessageSquare, Plus, Trash2, CalendarIcon, Clock, Link2, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Channel[];
  onScheduled?: () => void;
}

type PublishMode = "video_url" | "send_text";

export function PublishDialog({ open, onOpenChange, channels, onScheduled }: PublishDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<PublishMode>("video_url");
  const [targetChannelId, setTargetChannelId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [fromChatId, setFromChatId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Scheduling
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date>();
  const [scheduleTime, setScheduleTime] = useState("12:00");

  // Inline buttons
  const [inlineButtons, setInlineButtons] = useState<InlineButton[]>([]);

  const targetChannels = channels.filter(c => c.type === "target" && c.status === "active");

  const addButton = () => {
    setInlineButtons([...inlineButtons, { text: "", url: "" }]);
  };

  const removeButton = (index: number) => {
    setInlineButtons(inlineButtons.filter((_, i) => i !== index));
  };

  const updateButton = (index: number, field: "text" | "url", value: string) => {
    const updated = [...inlineButtons];
    updated[index] = { ...updated[index], [field]: value };
    setInlineButtons(updated);
  };

  const handleTranslate = async () => {
    if (!caption.trim()) {
      toast({ title: "אין טקסט לתרגום", variant: "destructive" });
      return;
    }

    setIsTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke("translate-caption", {
        body: { text: caption, target_language: "Hebrew" },
      });

      if (error) throw new Error(error.message);
      if (data?.translated) {
        setCaption(data.translated);
        toast({ title: "✅ תורגם בהצלחה!" });
      }
    } catch (err: any) {
      toast({ title: "שגיאת תרגום", description: err.message, variant: "destructive" });
    } finally {
      setIsTranslating(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetChannelId) {
      toast({ title: "בחר ערוץ יעד", variant: "destructive" });
      return;
    }

    const validButtons = inlineButtons.filter(b => b.text && b.url);

    // If scheduled, save to DB and return
    if (isScheduled) {
      if (!scheduleDate) {
        toast({ title: "בחר תאריך לתזמון", variant: "destructive" });
        return;
      }

      const [hours, minutes] = scheduleTime.split(":").map(Number);
      const scheduledFor = new Date(scheduleDate);
      scheduledFor.setHours(hours, minutes, 0, 0);

      if (scheduledFor <= new Date()) {
        toast({ title: "התאריך חייב להיות בעתיד", variant: "destructive" });
        return;
      }

      const targetChannel = channels.find(c => c.handle === targetChannelId);

      setIsSending(true);
      try {
        const { error } = await supabase.from("scheduled_posts").insert({
          title: caption || videoUrl || `הודעה מ-${fromChatId}`,
          channel_id: targetChannel?.id || null,
          scheduled_for: scheduledFor.toISOString(),
          video_id: null,
        });

        if (error) throw error;

        toast({ title: "✅ פרסום תוזמן בהצלחה!" });
        onOpenChange(false);
        onScheduled?.();
        resetForm();
      } catch (err: any) {
        toast({ title: "שגיאה", description: err.message, variant: "destructive" });
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Publish now
    setIsSending(true);
    try {
      let result;

      if (mode === "video_url") {
        if (!videoUrl) {
          toast({ title: "הזן קישור לסרטון או file_id", variant: "destructive" });
          setIsSending(false);
          return;
        }
        result = await sendVideoToChannel(
          targetChannelId,
          videoUrl,
          caption || undefined,
          validButtons.length > 0 ? validButtons : undefined
        );
      } else {
        if (!fromChatId || !messageId) {
          toast({ title: "הזן את מזהה הערוץ והודעה", variant: "destructive" });
          setIsSending(false);
          return;
        }
        result = await copyMessageToChannel(
          targetChannelId,
          fromChatId,
          parseInt(messageId, 10),
          caption || undefined,
          validButtons.length > 0 ? validButtons : undefined
        );
      }

      if (result.ok) {
        toast({ title: "✅ הסרטון פורסם בהצלחה!" });
        onOpenChange(false);
        resetForm();
      } else {
        toast({
          title: "שגיאה בפרסום",
          description: result.description || "שגיאה לא ידועה",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message || "שגיאת חיבור", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    setVideoUrl("");
    setCaption("");
    setFromChatId("");
    setMessageId("");
    setTargetChannelId("");
    setIsScheduled(false);
    setScheduleDate(undefined);
    setScheduleTime("12:00");
    setInlineButtons([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            פרסום לטלגרם
          </DialogTitle>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-secondary rounded-md">
          <button
            type="button"
            onClick={() => setMode("video_url")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-sm font-medium transition-colors",
              mode === "video_url" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Video className="w-4 h-4" />
            שלח סרטון
          </button>
          <button
            type="button"
            onClick={() => setMode("copy_message")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-sm font-medium transition-colors",
              mode === "copy_message" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            העתק הודעה
          </button>
        </div>

        <form onSubmit={handlePublish} className="space-y-4">
          {/* Target Channel */}
          <div>
            <Label className="text-sm text-muted-foreground">ערוץ יעד</Label>
            <Select value={targetChannelId} onValueChange={setTargetChannelId}>
              <SelectTrigger className="mt-1 bg-secondary border-border">
                <SelectValue placeholder="בחר ערוץ יעד..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {targetChannels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.handle}>
                    {ch.name} ({ch.handle})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {targetChannels.length === 0 && (
              <p className="text-xs text-warning mt-1">אין ערוצי יעד פעילים. הוסף ערוץ יעד קודם.</p>
            )}
          </div>

          {mode === "video_url" ? (
            <div>
              <Label className="text-sm text-muted-foreground">קישור לסרטון או file_id</Label>
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://example.com/video.mp4 או file_id"
                className="mt-1 bg-secondary border-border font-mono text-sm"
                dir="ltr"
                required={!isScheduled}
              />
            </div>
          ) : (
            <>
              <div>
                <Label className="text-sm text-muted-foreground">מזהה ערוץ מקור</Label>
                <Input
                  value={fromChatId}
                  onChange={(e) => setFromChatId(e.target.value)}
                  placeholder="@channel או -100xxxxxxxxxx"
                  className="mt-1 bg-secondary border-border font-mono text-sm"
                  dir="ltr"
                  required={!isScheduled}
                />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">מזהה הודעה (Message ID)</Label>
                <Input
                  value={messageId}
                  onChange={(e) => setMessageId(e.target.value)}
                  placeholder="12345"
                  type="number"
                  className="mt-1 bg-secondary border-border font-mono text-sm"
                  dir="ltr"
                  required={!isScheduled}
                />
              </div>
            </>
          )}

          {/* Caption with Translate */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">כיתוב (אופציונלי)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleTranslate}
                disabled={isTranslating || !caption.trim()}
                className="h-7 text-xs gap-1 text-accent hover:text-accent"
              >
                {isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                תרגם לעברית
              </Button>
            </div>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="כתוב כיתוב לסרטון... תומך ב-HTML"
              className="mt-1 bg-secondary border-border min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              HTML: &lt;b&gt;בולד&lt;/b&gt;, &lt;i&gt;נטוי&lt;/i&gt;, &lt;a href="..."&gt;קישור&lt;/a&gt;
            </p>
          </div>

          {/* Inline Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                כפתורים לחיצים
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addButton} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" />
                הוסף כפתור
              </Button>
            </div>
            {inlineButtons.map((btn, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  value={btn.text}
                  onChange={(e) => updateButton(i, "text", e.target.value)}
                  placeholder="טקסט הכפתור"
                  className="bg-secondary border-border text-sm flex-1"
                />
                <Input
                  value={btn.url}
                  onChange={(e) => updateButton(i, "url", e.target.value)}
                  placeholder="https://..."
                  className="bg-secondary border-border text-sm flex-1 font-mono"
                  dir="ltr"
                />
                <button type="button" onClick={() => removeButton(i)} className="text-muted-foreground hover:text-destructive p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Schedule Toggle */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-foreground flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-warning" />
                תזמן לפרסום
              </Label>
              <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
            </div>

            {isScheduled && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">תאריך</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full mt-1 justify-start text-right font-normal bg-secondary border-border",
                          !scheduleDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="ml-2 h-4 w-4" />
                        {scheduleDate ? format(scheduleDate, "dd/MM/yyyy") : "בחר תאריך"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
                        disabled={(date) => date < new Date()}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">שעה</Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="mt-1 bg-secondary border-border"
                    dir="ltr"
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full gradient-primary text-primary-foreground gap-2"
            disabled={isSending}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isScheduled ? "מתזמן..." : "שולח..."}
              </>
            ) : (
              <>
                {isScheduled ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {isScheduled ? "תזמן פרסום" : "פרסם עכשיו"}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
