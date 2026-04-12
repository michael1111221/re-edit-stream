import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TablesInsert } from "@/integrations/supabase/types";
import { getChatInfo } from "@/lib/telegram";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface AddChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (channel: TablesInsert<"channels">) => void;
}

export function AddChannelDialog({ open, onOpenChange, onAdd }: AddChannelDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [type, setType] = useState<"source" | "target">("source");
  const [isOwned, setIsOwned] = useState(true);
  const [language, setLanguage] = useState("he");
  const [isValidating, setIsValidating] = useState(false);

  const normalizedHandle = handle.trim();
  // Auto-prepend -100 if user enters just the numeric part
  const normalizedChatId = (() => {
    const raw = telegramChatId.trim();
    if (/^\d{6,}$/.test(raw)) return `-100${raw}`;
    return raw;
  })();
  const isPrivateInviteLink = useMemo(
    () => /^https?:\/\/t\.me\/\+/i.test(normalizedHandle),
    [normalizedHandle]
  );

  const validatePrivateChannel = async () => {
    if (!normalizedChatId) {
      toast({
        title: "חסר Chat ID",
        description: "לערוץ פרטי צריך להזין את מזהה הערוץ המספרי.",
        variant: "destructive",
      });
      return false;
    }

    if (!/^\-100\d{6,}$/.test(normalizedChatId)) {
      toast({
        title: "Chat ID לא תקין",
        description: "לערוץ פרטי בטלגרם ה-Chat ID בדרך כלל מתחיל ב--100, למשל -1001234567890.",
        variant: "destructive",
      });
      return false;
    }

    setIsValidating(true);
    try {
      const result = await getChatInfo(normalizedChatId);
      if (!result.ok) {
        toast({
          title: "הבוט לא מזהה את הערוץ",
          description: "ודא שזה ה-Chat ID של הערוץ עצמו ושהבוט חבר או אדמין בערוץ הפרטי.",
          variant: "destructive",
        });
        return false;
      }

      toast({ title: "ערוץ פרטי אומת בהצלחה" });
      return true;
    } catch (err: any) {
      toast({ title: "שגיאת אימות", description: err.message, variant: "destructive" });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isPrivateInviteLink) {
      const isValid = await validatePrivateChannel();
      if (!isValid) return;
    }

    onAdd({
      name,
      handle,
      type,
      is_owned: isOwned,
      language,
      telegram_chat_id: normalizedChatId || null,
    });
    setName("");
    setHandle("");
    setTelegramChatId("");
    setType("source");
    setIsOwned(true);
    setLanguage("he");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-foreground">הוסף ערוץ חדש</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">שם הערוץ</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-secondary border-border" required />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Handle</Label>
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} className="mt-1 bg-secondary border-border font-mono" dir="ltr" placeholder="@channel או https://t.me/+invite" required />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Telegram Chat ID (לערוצים פרטיים)</Label>
            <Input value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} className="mt-1 bg-secondary border-border font-mono" dir="ltr" placeholder="-1001234567890" />
            <p className="mt-1 text-xs text-muted-foreground">
              בערוץ פרטי חייבים את מזהה הערוץ עצמו, שבדרך כלל מתחיל ב-<span dir="ltr">-100</span>, ולא מזהה של משתמש או צ'אט רגיל.
            </p>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">סוג</Label>
            <div className="mt-1 flex gap-2">
              <Button type="button" size="sm" variant={type === "source" ? "default" : "outline"} onClick={() => setType("source")}>
                מקור
              </Button>
              <Button type="button" size="sm" variant={type === "target" ? "default" : "outline"} onClick={() => setType("target")}>
                יעד
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">שפה</Label>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 w-24 bg-secondary border-border" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">ערוץ שלי</Label>
            <Switch checked={isOwned} onCheckedChange={setIsOwned} />
          </div>
          {isPrivateInviteLink && (
            <Button type="button" variant="outline" className="w-full" onClick={validatePrivateChannel} disabled={isValidating}>
              {isValidating ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              בדוק Chat ID לערוץ הפרטי
            </Button>
          )}
          <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={isValidating}>
            הוסף ערוץ
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
