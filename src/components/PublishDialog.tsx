import { useState, useRef, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Channel } from "@/types/dashboard";
import { sendMessageToChannel, InlineButton, deleteMessage, getChatInfo } from "@/lib/telegram";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Plus, Trash2, CalendarIcon, Clock, Link2, Languages, ImagePlus, X, FileVideo, FileImage, Save, FolderOpen, RotateCcw, Edit3, Bold, Underline, Italic, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Json } from "@/integrations/supabase/types";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Channel[];
  onScheduled?: () => void;
}

interface Template {
  id: string;
  name: string;
  caption: string;
  channel_handles: string[];
  inline_buttons: InlineButton[];
  media_url: string | null;
  media_type: string | null;
}

export function PublishDialog({ open, onOpenChange, channels, onScheduled }: PublishDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date>();
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [inlineButtons, setInlineButtons] = useState<InlineButton[]>([]);
  const [deleteBeforePublish, setDeleteBeforePublish] = useState(false);
  const [lastMessageIds, setLastMessageIds] = useState<Record<string, number>>({});
  const [templateMediaUrl, setTemplateMediaUrl] = useState<string | null>(null);
  const [templateMediaType, setTemplateMediaType] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const targetChannels = channels.filter(c => c.type === "target" && c.status === "active");

  useEffect(() => {
    if (open) {
      loadTemplates();
      loadLastMessageIds();
    }
  }, [open]);

  const loadLastMessageIds = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "last_published_messages")
      .single();
    if (data?.value && typeof data.value === "object") {
      setLastMessageIds(data.value as Record<string, number>);
    }
  };

  const saveLastMessageIds = async (ids: Record<string, number>) => {
    await supabase.from("system_settings").upsert({
      key: "last_published_messages",
      value: ids as unknown as Json,
    });
  };

  const loadTemplates = async () => {
    const { data } = await supabase.from("post_templates").select("*").order("created_at", { ascending: false });
    if (data) {
      setTemplates(data.map(t => ({
        id: t.id,
        name: t.name,
        caption: t.caption,
        channel_handles: (t.channel_handles as any) || [],
        inline_buttons: (t.inline_buttons as any) || [],
        media_url: (t as any).media_url || null,
        media_type: (t as any).media_type || null,
      })));
    }
  };

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: "הזן שם לתבנית", variant: "destructive" });
      return;
    }

    let mediaUrl: string | null = templateMediaUrl;
    let mediaType: string | null = templateMediaType;

    if (attachedFile) {
      try {
        mediaUrl = await uploadFileToStorage(attachedFile);
        mediaType = getFileType(attachedFile);
      } catch (err: any) {
        toast({ title: "שגיאה בהעלאת מדיה לתבנית", description: err.message, variant: "destructive" });
        return;
      }
    }

    const payload = {
      name: templateName,
      caption,
      channel_handles: selectedChannels as unknown as Json,
      inline_buttons: inlineButtons as unknown as Json,
      media_url: mediaUrl,
      media_type: mediaType,
    } as any;

    if (editingTemplateId) {
      const { error } = await supabase.from("post_templates").update(payload).eq("id", editingTemplateId);
      if (error) {
        toast({ title: "שגיאה בעדכון", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "✅ תבנית עודכנה!" });
      setEditingTemplateId(null);
    } else {
      const { error } = await supabase.from("post_templates").insert(payload);
      if (error) {
        toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "✅ תבנית נשמרה!" });
    }
    setTemplateName("");
    setShowSaveTemplate(false);
    loadTemplates();
  };

  const startEditTemplate = (t: Template) => {
    setCaption(t.caption);
    setSelectedChannels(t.channel_handles);
    setInlineButtons(t.inline_buttons);
    removeFile();
    if (t.media_url) {
      setTemplateMediaUrl(t.media_url);
      setTemplateMediaType(t.media_type);
      setFilePreview(t.media_type === "photo" ? t.media_url : null);
    } else {
      setTemplateMediaUrl(null);
      setTemplateMediaType(null);
    }
    setEditingTemplateId(t.id);
    setTemplateName(t.name);
    setShowSaveTemplate(true);
    toast({ title: `✏️ עורך תבנית "${t.name}"` });
  };

  const loadTemplate = (templateId: string) => {
    const t = templates.find(t => t.id === templateId);
    if (!t) return;
    setCaption(t.caption);
    setSelectedChannels(t.channel_handles);
    setInlineButtons(t.inline_buttons);

    // Load saved media
    removeFile();
    if (t.media_url) {
      setFilePreview(t.media_type === "photo" ? t.media_url : null);
      // Create a placeholder reference so sendToChannel uses the saved URL
      setTemplateMediaUrl(t.media_url);
      setTemplateMediaType(t.media_type);
    } else {
      setTemplateMediaUrl(null);
      setTemplateMediaType(null);
    }

    toast({ title: `📋 תבנית "${t.name}" נטענה` });
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("post_templates").delete().eq("id", id);
    loadTemplates();
    toast({ title: "תבנית נמחקה" });
  };

  const toggleChannel = (handle: string) => {
    setSelectedChannels(prev =>
      prev.includes(handle) ? prev.filter(h => h !== handle) : [...prev, handle]
    );
  };

  const selectAll = () => {
    if (selectedChannels.length === targetChannels.length) {
      setSelectedChannels([]);
    } else {
      setSelectedChannels(targetChannels.map(c => c.handle));
    }
  };

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
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "הקובץ גדול מדי", description: "מקסימום 50MB", variant: "destructive" });
      return;
    }
    setAttachedFile(file);
    if (file.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setAttachedFile(null);
    if (filePreview) { URL.revokeObjectURL(filePreview); setFilePreview(null); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getFileType = (file: File): "photo" | "video" | "document" => {
    if (file.type.startsWith("image/")) return "photo";
    if (file.type.startsWith("video/")) return "video";
    return "document";
  };

  const handleTranslate = async () => {
    if (!caption.trim()) return;
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

  const maybeCompressImage = async (file: File): Promise<File> => {
    if (!file.type.startsWith("image/") || file.size <= 9.5 * 1024 * 1024) return file;

    const imgUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = imgUrl;
      });

      const maxWidth = 1920;
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82)
      );

      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  };

  const uploadFileToStorage = async (file: File): Promise<string> => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error("המשתמש לא מחובר");

    const preparedFile = await maybeCompressImage(file);
    const ext = preparedFile.name.split(".").pop() || "bin";
    const path = `${userId}/publish/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("temp-uploads").upload(path, preparedFile);
    if (error) throw new Error("שגיאה בהעלאת קובץ: " + error.message);
    const { data: urlData } = supabase.storage.from("temp-uploads").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const resolveChatId = (channelHandle: string): string => {
    const ch = channels.find(c => c.handle === channelHandle);
    let chatId = ch?.telegram_chat_id?.trim() || channelHandle;
    // Auto-fix: if it's a numeric ID without -100 prefix, add it
    if (/^\d{6,}$/.test(chatId)) {
      chatId = `-100${chatId}`;
    }
    return chatId;
  };

  const validateChannelBeforePublish = async (channelHandle: string): Promise<string> => {
    const ch = channels.find(c => c.handle === channelHandle);
    const chatId = resolveChatId(channelHandle);
    const isPrivateInviteLink = /^https?:\/\/t\.me\/\+/i.test(ch?.handle || "");

    if (isPrivateInviteLink && !ch?.telegram_chat_id?.trim()) {
      throw new Error(`לערוץ "${ch?.name || channelHandle}" חסר Chat ID של ערוץ פרטי.`);
    }

    if (isPrivateInviteLink && !/^\-100\d{6,}$/.test(chatId)) {
      throw new Error(`ה-Chat ID של "${ch?.name || channelHandle}" חייב להתחיל ב--100. כרגע נשמר מזהה שלא נראה כמו ערוץ פרטי.`);
    }

    const info = await getChatInfo(chatId);
    if (!info.ok) {
      throw new Error(`הבוט לא מצליח לגשת לערוץ "${ch?.name || channelHandle}". ודא שזה ה-Chat ID של הערוץ עצמו ושהבוט חבר או אדמין בערוץ.`);
    }

    return chatId;
  };

  const sendToChannel = async (channelHandle: string, validButtons: InlineButton[], fileUrl?: string, mediaType?: string) => {
    const chatId = resolveChatId(channelHandle);
    if (fileUrl) {
      const fileType = mediaType as "photo" | "video" | "document" || (attachedFile ? getFileType(attachedFile) : "document");
      // Videos are sent as animations (GIF) for auto-play without sound
      const actionMap = { photo: "sendPhoto", video: "sendAnimation", document: "sendDocument" };
      const fieldMap = { photo: "photo", video: "animation", document: "document" };

      let { data, error } = await supabase.functions.invoke("telegram-bot", {
        body: {
          action: actionMap[fileType],
           chat_id: chatId,
          [fieldMap[fileType]]: fileUrl,
          caption: caption.trim() || undefined,
          inline_buttons: validButtons.length > 0 ? validButtons : undefined,
        },
      });

      if (!error && data?.ok === false && fileType === "photo") {
        const retry = await supabase.functions.invoke("telegram-bot", {
          body: {
            action: "sendDocument",
            chat_id: chatId,
            document: fileUrl,
            caption: caption.trim() || undefined,
            inline_buttons: validButtons.length > 0 ? validButtons : undefined,
          },
        });
        data = retry.data;
        error = retry.error;
      }

      if (error) throw new Error(error.message);
      return data;
    } else {
      return await sendMessageToChannel(
        chatId,
        caption,
        validButtons.length > 0 ? validButtons : undefined
      );
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedChannels.length === 0) {
      toast({ title: "בחר לפחות ערוץ יעד אחד", variant: "destructive" });
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

      setIsSending(true);
      try {
        // Upload file if attached for scheduled post
        let fileUrl: string | undefined;
        let mediaType: string | undefined;
        if (attachedFile) {
          fileUrl = await uploadFileToStorage(attachedFile);
          mediaType = getFileType(attachedFile);
        } else if (templateMediaUrl) {
          fileUrl = templateMediaUrl;
          mediaType = templateMediaType || undefined;
        }

        const validButtons = inlineButtons.filter(b => b.text && b.url);

        const inserts = selectedChannels.map(handle => {
          const ch = channels.find(c => c.handle === handle);
          return {
            title: caption || "פרסום מתוזמן",
            channel_id: ch?.id || null,
            scheduled_for: scheduledFor.toISOString(),
            video_id: null,
            media_url: fileUrl || null,
            media_type: mediaType || null,
            inline_buttons: validButtons.length > 0 ? validButtons as unknown as Json[] : [],
          };
        });
        const { error } = await supabase.from("scheduled_posts").insert(inserts);
        if (error) throw error;
        toast({ title: `✅ תוזמן ל-${selectedChannels.length} ערוצים!` });
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

    // Publish now to all selected channels
    setIsSending(true);
    let successCount = 0;
    let failCount = 0;
    const updatedMessageIds = { ...lastMessageIds };

    // Upload file once if attached, or use template media
    let fileUrl: string | undefined;
    let mediaType: string | undefined;
    if (attachedFile) {
      try {
        fileUrl = await uploadFileToStorage(attachedFile);
        mediaType = getFileType(attachedFile);
      } catch (err: any) {
        toast({ title: "שגיאה בהעלאת קובץ", description: err.message, variant: "destructive" });
        setIsSending(false);
        return;
      }
    } else if (templateMediaUrl) {
      fileUrl = templateMediaUrl;
      mediaType = templateMediaType || undefined;
    }

    for (const handle of selectedChannels) {
      try {
        const resolvedChatId = await validateChannelBeforePublish(handle);

        if (deleteBeforePublish && lastMessageIds[handle]) {
          try {
            await deleteMessage(resolvedChatId, lastMessageIds[handle]);
          } catch (err) {
            console.warn(`Could not delete last message in ${handle}:`, err);
          }
        }

        const result = await sendToChannel(handle, validButtons, fileUrl, mediaType);
        if (result.ok) {
          successCount++;
          const msgId = result.result?.message_id || result.result?.message_id;
          if (msgId) {
            updatedMessageIds[handle] = msgId;
          }
        } else {
          failCount++;
          console.error(`Failed to publish to ${handle}:`, result.description);
          toast({ title: "שגיאה בפרסום", description: result.description || `השליחה נכשלה עבור ${handle}`, variant: "destructive" });
        }
      } catch (err: any) {
        failCount++;
        console.error(`Error publishing to ${handle}:`, err);
        toast({ title: "שגיאה בפרסום", description: err.message || `השליחה נכשלה עבור ${handle}`, variant: "destructive" });
      }
    }

    // Save updated message IDs
    if (successCount > 0) {
      setLastMessageIds(updatedMessageIds);
      await saveLastMessageIds(updatedMessageIds);
    }

    setIsSending(false);

    if (successCount > 0) {
      toast({ title: `✅ פורסם ל-${successCount} ערוצים${failCount > 0 ? ` (${failCount} נכשלו)` : ""}` });
      onOpenChange(false);
      resetForm();
    } else {
      toast({ title: "שגיאה בפרסום", description: "לא הצלחנו לפרסם לאף ערוץ", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setCaption("");
    setSelectedChannels([]);
    removeFile();
    setIsScheduled(false);
    setScheduleDate(undefined);
    setScheduleTime("12:00");
    setInlineButtons([]);
    setTemplateMediaUrl(null);
    setTemplateMediaType(null);
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
          {/* Templates Section */}
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-foreground flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-primary" /> תבניות שמורות
              </Label>
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                className="h-7 text-xs gap-1"
              >
                <Save className="w-3 h-3" /> שמור תבנית
              </Button>
            </div>

            {templates.length > 0 && (
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded px-2 py-1.5 bg-secondary hover:bg-muted transition-colors">
                    <button
                      type="button"
                      onClick={() => loadTemplate(t.id)}
                      className="text-sm text-foreground hover:text-primary transition-colors text-right flex-1"
                    >
                      {t.name}
                    </button>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => startEditTemplate(t)}
                        className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(t.id)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground">אין תבניות שמורות עדיין</p>
            )}

            {showSaveTemplate && (
              <div className="flex gap-2 items-center mt-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="שם התבנית..."
                  className="bg-secondary border-border text-sm flex-1"
                />
                <Button type="button" size="sm" onClick={saveAsTemplate} className="h-8 text-xs">
                  {editingTemplateId ? "עדכן" : "שמור"}
                </Button>
                {editingTemplateId && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setEditingTemplateId(null); setShowSaveTemplate(false); setTemplateName(""); }} className="h-8 text-xs">
                    ביטול
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Target Channels - Multi Select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm text-muted-foreground">ערוצי יעד</Label>
              {targetChannels.length > 1 && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-primary hover:underline"
                >
                  {selectedChannels.length === targetChannels.length ? "בטל הכל" : "בחר הכל"}
                </button>
              )}
            </div>
            {targetChannels.length === 0 ? (
              <p className="text-xs text-warning">אין ערוצי יעד פעילים. הוסף ערוץ יעד קודם.</p>
            ) : (
              <div className="space-y-1.5 rounded-md border border-border bg-secondary p-2 max-h-32 overflow-y-auto">
                {targetChannels.map((ch) => (
                  <label
                    key={ch.id}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted",
                      selectedChannels.includes(ch.handle) && "bg-muted"
                    )}
                  >
                    <Checkbox
                      checked={selectedChannels.includes(ch.handle)}
                      onCheckedChange={() => toggleChannel(ch.handle)}
                    />
                    <span className="text-sm text-foreground">{ch.name}</span>
                    <span className="text-xs text-muted-foreground mr-auto" dir="ltr">{ch.handle}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedChannels.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                נבחרו {selectedChannels.length} ערוצים
              </p>
            )}
          </div>

          {/* Message Text */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">
                {attachedFile ? "כיתוב (אופציונלי)" : "טקסט ההודעה"}
              </Label>
              <Button
                type="button" variant="ghost" size="sm"
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
                <button type="button" onClick={() => { removeFile(); setTemplateMediaUrl(null); setTemplateMediaType(null); }}
                  className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:opacity-80 z-10">
                  <X className="w-3 h-3" />
                </button>
                {filePreview ? (
                  <img src={filePreview} alt="תצוגה מקדימה" className="w-full max-h-40 object-contain rounded" />
                ) : (
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    {attachedFile.type.startsWith("video/") ? <FileVideo className="w-8 h-8 text-primary" /> : <FileImage className="w-8 h-8 text-primary" />}
                    <div>
                      <p className="font-medium">{attachedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(attachedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  </div>
                )}
              </div>
            ) : templateMediaUrl ? (
              <div className="relative rounded-lg border border-border bg-secondary p-3">
                <button type="button" onClick={() => { setTemplateMediaUrl(null); setTemplateMediaType(null); setFilePreview(null); }}
                  className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:opacity-80 z-10">
                  <X className="w-3 h-3" />
                </button>
                {templateMediaType === "photo" ? (
                  <img src={templateMediaUrl} alt="מדיה מתבנית" className="w-full max-h-40 object-contain rounded" />
                ) : (
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    {templateMediaType === "video" ? <FileVideo className="w-8 h-8 text-primary" /> : <FileImage className="w-8 h-8 text-primary" />}
                    <p className="font-medium text-muted-foreground">מדיה מתבנית שמורה</p>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 hover:bg-secondary/50 transition-colors">
                <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">לחץ לבחירת תמונה או סרטון</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, MP4, MOV • עד 50MB</p>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
          </div>

          {/* Inline Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                כפתורים לחיצים
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addButton} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> הוסף כפתור
              </Button>
            </div>
            {inlineButtons.map((btn, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={btn.text} onChange={(e) => updateButton(i, "text", e.target.value)}
                  placeholder="טקסט הכפתור" className="bg-secondary border-border text-sm flex-1" />
                <Input value={btn.url} onChange={(e) => updateButton(i, "url", e.target.value)}
                  placeholder="https://..." className="bg-secondary border-border text-sm flex-1 font-mono" dir="ltr" />
                <button type="button" onClick={() => removeButton(i)} className="text-muted-foreground hover:text-destructive p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Delete Before Publish Toggle */}
          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-foreground flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-destructive" /> מחק פרסום קודם לפני שליחה
              </Label>
              <Switch checked={deleteBeforePublish} onCheckedChange={setDeleteBeforePublish} />
            </div>
            {deleteBeforePublish && (
              <p className="text-xs text-muted-foreground mt-2">
                הפרסום האחרון שנשלח לכל ערוץ יימחק אוטומטית לפני שליחת הפרסום החדש
              </p>
            )}
          </div>

          {/* Schedule Toggle */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-foreground flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-warning" /> תזמן לפרסום
              </Label>
              <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
            </div>
            {isScheduled && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">תאריך</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn(
                        "w-full mt-1 justify-start text-right font-normal bg-secondary border-border",
                        !scheduleDate && "text-muted-foreground"
                      )}>
                        <CalendarIcon className="ml-2 h-4 w-4" />
                        {scheduleDate ? format(scheduleDate, "dd/MM/yyyy") : "בחר תאריך"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                      <Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate}
                        disabled={(date) => { const today = new Date(); today.setHours(0,0,0,0); return date < today; }} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">שעה</Label>
                  <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
                    className="mt-1 bg-secondary border-border" dir="ltr" />
                </div>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full gradient-primary text-primary-foreground gap-2" disabled={isSending}>
            {isSending ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{isScheduled ? "מתזמן..." : "שולח..."}</>
            ) : (
              <>
                {isScheduled ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {isScheduled ? "תזמן פרסום" : selectedChannels.length > 1 ? `פרסם ל-${selectedChannels.length} ערוצים` : "פרסם עכשיו"}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
