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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Channel } from "@/types/dashboard";
import { sendVideoToChannel, copyMessageToChannel } from "@/lib/telegram";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Video, Link2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Channel[];
}

type PublishMode = "video_url" | "copy_message";

export function PublishDialog({ open, onOpenChange, channels }: PublishDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<PublishMode>("video_url");
  const [targetChannelId, setTargetChannelId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [fromChatId, setFromChatId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [isSending, setIsSending] = useState(false);

  const targetChannels = channels.filter(c => c.type === "target" && c.status === "active");

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetChannelId) {
      toast({ title: "בחר ערוץ יעד", variant: "destructive" });
      return;
    }

    setIsSending(true);

    try {
      let result;

      if (mode === "video_url") {
        if (!videoUrl) {
          toast({ title: "הזן קישור לסרטון או file_id", variant: "destructive" });
          setIsSending(false);
          return;
        }
        result = await sendVideoToChannel(targetChannelId, videoUrl, caption || undefined);
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
          caption || undefined
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
      toast({
        title: "שגיאה",
        description: err.message || "שגיאת חיבור",
        variant: "destructive",
      });
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg" dir="rtl">
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
              mode === "video_url"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
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
              mode === "copy_message"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
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
            <>
              {/* Video URL / file_id */}
              <div>
                <Label className="text-sm text-muted-foreground">קישור לסרטון או file_id</Label>
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://example.com/video.mp4 או file_id"
                  className="mt-1 bg-secondary border-border font-mono text-sm"
                  dir="ltr"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ניתן להזין URL ישיר לסרטון או file_id מטלגרם
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Copy from channel */}
              <div>
                <Label className="text-sm text-muted-foreground">מזהה ערוץ מקור</Label>
                <Input
                  value={fromChatId}
                  onChange={(e) => setFromChatId(e.target.value)}
                  placeholder="@channel או -100xxxxxxxxxx"
                  className="mt-1 bg-secondary border-border font-mono text-sm"
                  dir="ltr"
                  required
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
                  required
                />
              </div>
            </>
          )}

          {/* Caption */}
          <div>
            <Label className="text-sm text-muted-foreground">כיתוב (אופציונלי)</Label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="כתוב כיתוב לסרטון... תומך ב-HTML"
              className="mt-1 bg-secondary border-border min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              תומך ב-HTML: &lt;b&gt;בולד&lt;/b&gt;, &lt;i&gt;נטוי&lt;/i&gt;, &lt;a href="..."&gt;קישור&lt;/a&gt;
            </p>
          </div>

          <Button
            type="submit"
            className="w-full gradient-primary text-primary-foreground gap-2"
            disabled={isSending}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                שולח...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                פרסם עכשיו
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
