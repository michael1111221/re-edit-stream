import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { sendMessageToChannel, InlineButton } from "@/lib/telegram";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Plus, Trash2, CalendarIcon, Clock, Link2, Languages, ImagePlus, X, FileVideo, FileImage } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Channel[];
  onScheduled?: () => void;
}

export function PublishDialog({ open, onOpenChange, channels, onScheduled }: PublishDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetChannelId, setTargetChannelId] = useState("");
  const [caption, setCaption] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Scheduling
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date>();
  const [scheduleTime, setScheduleTime] = useState("12:00");

  // Inline buttons
  const [inlineButtons, setInlineButtons] = useState<InlineButton[]>([]);

  const targetChannels = channels.filter(c => c.type === "target" && c.status === "active");

  const addButton = () => setInlineButtons([...inlineButtons, { text: "", url: "" }]);
  const removeButton = (index: number) => setInlineButtons(inlineButtons.filter((_, i) => i !== index));
  const updateButton = (index: number, field: "text" | "url", value: string) => {
    const updated = [...inlineButtons];
    updated[index] = { ...updated[index], [field]: value };
    setInlineButtons(updated);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 50 * 1024 * 1024; // 50MB Telegram limit
    if (file.size > maxSize) {
      toast({ title: "הקובץ גדול מדי", description: "מקסימום 50MB", variant: "destructive" });
      return;
    }

    setAttachedFile(file);

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setAttachedFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getFileType = (file: File): "photo" | "video" | "document" => {
    if (file.type.startsWith("image/")) return "photo";
    if (file.type.startsWith("video/")) return "video";
    return "document";
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

    if (!caption.trim() && !attachedFile) {
      toast({ title: "כתוב הודעה או צרף קובץ", variant: "destructive" });
      return;
    }

    const validButtons = inlineButtons.filter(b => b.text && b.url);

    // Handle scheduling
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
          title: caption || "פרסום מתוזמן",
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

      if (attachedFile) {
        // Send file via multipart form data
        const fileType = getFileType(attachedFile);
        const actionMap = { photo: "sendPhoto", video: "sendVideo", document: "sendDocument" };

        const formData = new FormData();
        formData.append("action", actionMap[fileType]);
        formData.append("chat_id", targetChannelId);
        formData.append("file", attachedFile);
        if (caption.trim()) formData.append("caption", caption);
        if (validButtons.length > 0) formData.append("inline_buttons", JSON.stringify(validButtons));

        const { data, error } = await supabase.functions.invoke("telegram-bot", {
          body: formData,
        });

        if (error) throw new Error(error.message);
        result = data;
      } else {
        // Send text only
        result = await sendMessageToChannel(
          targetChannelId,
          caption,
          validButtons.length > 0 ? validButtons : undefined
        );
      }

      if (result.ok) {
        toast({ title: "✅ פורסם בהצלחה!" });
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
    setCaption("");
    setTargetChannelId("");
    removeFile();
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

          {/* Message Text */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">
                {attachedFile ? "כיתוב (אופציונלי)" : "טקסט ההודעה"}
              </Label>
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
              placeholder={attachedFile ? "הוסף כיתוב לקובץ... (תומך ב-HTML)" : "כתוב את ההודעה שלך... (תומך ב-HTML)"}
              className="mt-1 bg-secondary border-border min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              HTML: &lt;b&gt;בולד&lt;/b&gt;, &lt;i&gt;נטוי&lt;/i&gt;, &lt;a href="..."&gt;קישור&lt;/a&gt;
            </p>
          </div>

          {/* File Attachment */}
          <div>
            <Label className="text-sm text-muted-foreground flex items-center gap-1.5 mb-2">
              <ImagePlus className="w-3.5 h-3.5" />
              צרף תמונה או סרטון
            </Label>

            {attachedFile ? (
              <div className="relative rounded-lg border border-border bg-secondary p-3">
                <button
                  type="button"
                  onClick={removeFile}
                  className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:opacity-80 z-10"
                >
                  <X className="w-3 h-3" />
                </button>

                {filePreview ? (
                  <img
                    src={filePreview}
                    alt="תצוגה מקדימה"
                    className="w-full max-h-40 object-contain rounded"
                  />
                ) : (
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    {attachedFile.type.startsWith("video/") ? (
                      <FileVideo className="w-8 h-8 text-primary" />
                    ) : (
                      <FileImage className="w-8 h-8 text-primary" />
                    )}
                    <div>
                      <p className="font-medium">{attachedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(attachedFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 hover:bg-secondary/50 transition-colors"
              >
                <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">לחץ לבחירת תמונה או סרטון</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, MP4, MOV • עד 50MB</p>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
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
