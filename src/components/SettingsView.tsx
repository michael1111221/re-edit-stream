import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Languages, 
  Link2, 
  Zap,
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Webhook
} from "lucide-react";
import { setWebhook, deleteWebhook, getBotInfo } from "@/lib/telegram";
import { useToast } from "@/hooks/use-toast";

export function SettingsView() {
  const { toast } = useToast();
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<"idle" | "connected" | "error">("idle");
  const [botInfo, setBotInfo] = useState<any>(null);
  const [botLoading, setBotLoading] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`;

  const handleConnectWebhook = async () => {
    setWebhookLoading(true);
    try {
      const result = await setWebhook(webhookUrl);
      if (result.ok) {
        setWebhookStatus("connected");
        toast({ title: "✅ Webhook חובר בהצלחה!" });
      } else {
        setWebhookStatus("error");
        toast({ title: "שגיאה", description: result.description, variant: "destructive" });
      }
    } catch (err: any) {
      setWebhookStatus("error");
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleDisconnectWebhook = async () => {
    setWebhookLoading(true);
    try {
      const result = await deleteWebhook();
      if (result.ok) {
        setWebhookStatus("idle");
        toast({ title: "Webhook נותק" });
      }
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleTestBot = async () => {
    setBotLoading(true);
    try {
      const result = await getBotInfo();
      if (result.ok) {
        setBotInfo(result.result);
        toast({ title: `✅ הבוט פעיל: @${result.result.username}` });
      } else {
        toast({ title: "שגיאה בבדיקת הבוט", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBotLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl" dir="rtl">
      <h2 className="text-xl font-semibold text-foreground">הגדרות</h2>

      {/* Bot & Webhook Settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-border bg-card p-5 shadow-card space-y-4"
      >
        <div className="flex items-center gap-2 text-foreground">
          <Bot className="w-5 h-5 text-primary" />
          <h3 className="font-medium">בוט טלגרם & Webhook</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleTestBot}
              variant="outline"
              size="sm"
              disabled={botLoading}
              className="gap-2"
            >
              {botLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              בדוק חיבור בוט
            </Button>
            {botInfo && (
              <span className="text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500 inline ml-1" />
                @{botInfo.username}
              </span>
            )}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm text-muted-foreground">Webhook URL</Label>
            </div>
            <code className="block text-xs bg-secondary p-2 rounded font-mono break-all" dir="ltr">
              {webhookUrl}
            </code>
            <div className="flex gap-2">
              <Button
                onClick={handleConnectWebhook}
                size="sm"
                disabled={webhookLoading}
                className="gap-2"
              >
                {webhookLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : webhookStatus === "connected" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : webhookStatus === "error" ? (
                  <XCircle className="w-4 h-4" />
                ) : (
                  <Webhook className="w-4 h-4" />
                )}
                {webhookStatus === "connected" ? "מחובר ✓" : "חבר Webhook"}
              </Button>
              {webhookStatus === "connected" && (
                <Button
                  onClick={handleDisconnectWebhook}
                  variant="outline"
                  size="sm"
                  disabled={webhookLoading}
                >
                  נתק
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Translation Settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-lg border border-border bg-card p-5 shadow-card space-y-4"
      >
        <div className="flex items-center gap-2 text-foreground">
          <Languages className="w-5 h-5 text-accent" />
          <h3 className="font-medium">הגדרות תרגום</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">תרגום אוטומטי</Label>
            <Switch defaultChecked />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">שפת יעד ברירת מחדל</Label>
            <Input defaultValue="עברית" className="mt-1 bg-secondary border-border" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">תרגום כתוביות</Label>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">תרגום כותרת ותיאור</Label>
            <Switch defaultChecked />
          </div>
        </div>
      </motion.div>

      {/* Links Settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-lg border border-border bg-card p-5 shadow-card space-y-4"
      >
        <div className="flex items-center gap-2 text-foreground">
          <Link2 className="w-5 h-5 text-primary" />
          <h3 className="font-medium">ניהול קישורים</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">הסרת קישורים מהמקור</Label>
            <Switch defaultChecked />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">קישור ברירת מחדל להוספה</Label>
            <Input defaultValue="https://t.me/mychannel" className="mt-1 bg-secondary border-border font-mono text-sm" dir="ltr" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">הוסף ווטרמארק</Label>
            <Switch />
          </div>
        </div>
      </motion.div>

      {/* Automation Settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-lg border border-border bg-card p-5 shadow-card space-y-4"
      >
        <div className="flex items-center gap-2 text-foreground">
          <Zap className="w-5 h-5 text-warning" />
          <h3 className="font-medium">אוטומציה</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">עיבוד אוטומטי של סרטונים חדשים</Label>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">פרסום אוטומטי לאחר עיבוד</Label>
            <Switch />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">מספר עיבודים מקבילי</Label>
            <Input type="number" defaultValue="3" className="mt-1 bg-secondary border-border w-24" />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">השהייה בין פרסומים (דקות)</Label>
            <Input type="number" defaultValue="30" className="mt-1 bg-secondary border-border w-24" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
