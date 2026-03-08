import { useState, useEffect } from "react";
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
  Webhook,
  User,
  Eye,
  EyeOff,
  Copy,
  Globe,
  Key,
  Smartphone,
  Monitor
} from "lucide-react";
import { setWebhook, deleteWebhook, getBotInfo } from "@/lib/telegram";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function SettingsView() {
  const { toast } = useToast();
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<"idle" | "connected" | "error">("idle");
  const [botInfo, setBotInfo] = useState<any>(null);
  const [botLoading, setBotLoading] = useState(false);

  // MTProto settings
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [showApiHash, setShowApiHash] = useState(false);
  const [mtprotoSaving, setMtprotoSaving] = useState(false);
  const [mtprotoLoaded, setMtprotoLoaded] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  // deployMode removed — local only

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`;
  const ingestUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-post`;

  // Load MTProto settings
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("system_settings")
        .select("*")
        .eq("key", "mtproto_config")
        .single();
      
      if (data?.value) {
        const val = data.value as any;
        setApiId(val.api_id || "");
        setApiHash(val.api_hash || "");
        setPhone(val.phone || "");
      }
      setMtprotoLoaded(true);
    }
    load();
  }, []);

  const handleSaveMtproto = async () => {
    setMtprotoSaving(true);
    try {
      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key: "mtproto_config",
          value: { api_id: apiId, api_hash: apiHash, phone },
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      toast({ title: "✅ הגדרות MTProto נשמרו!" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setMtprotoSaving(false);
    }
  };

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "הועתק!" });
  };

  const steps = [
    { num: 1, icon: Globe, title: "קבל API ID ו-Hash", done: !!apiId && !!apiHash },
    { num: 2, icon: Smartphone, title: "הזן מספר טלפון", done: !!phone },
    { num: 3, icon: Key, title: "שמור הגדרות", done: mtprotoLoaded && !!apiId },
    { num: 4, icon: Monitor, title: "הפעל ניטור", done: false },
  ];

  return (
    <div className="space-y-6 max-w-2xl" dir="rtl">
      <h2 className="text-xl font-semibold text-foreground">הגדרות</h2>

      {/* MTProto Setup Wizard */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-border bg-card p-5 shadow-card space-y-5"
      >
        <div className="flex items-center gap-2 text-foreground">
          <User className="w-5 h-5 text-accent" />
          <h3 className="font-medium">חיבור ניטור ערוצי מקור</h3>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-1">
          {steps.map((step, i) => (
            <div key={step.num} className="flex items-center gap-1 flex-1">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-colors ${
                step.done ? "bg-accent text-accent-foreground" : setupStep === step.num ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}>
                {step.done ? <CheckCircle2 className="w-4 h-4" /> : step.num}
              </div>
              <span className={`text-xs hidden sm:inline ${setupStep === step.num ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {step.title}
              </span>
              {i < steps.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Get API credentials */}
        {setupStep === 1 && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-foreground font-medium">📋 איך משיגים API ID ו-Hash?</p>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>היכנסו ל-<a href="https://my.telegram.org/apps" target="_blank" rel="noopener" className="text-primary underline">my.telegram.org</a> <ExternalLink className="w-3 h-3 inline" /></li>
                <li>התחברו עם מספר הטלפון שלכם</li>
                <li>לחצו על "API development tools"</li>
                <li>מלאו שם אפליקציה (כל שם) ולחצו Create</li>
                <li>העתיקו את ה-<strong>App api_id</strong> ו-<strong>App api_hash</strong></li>
              </ol>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">API ID</Label>
              <Input value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="12345678" className="mt-1 bg-secondary border-border font-mono" dir="ltr" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">API Hash</Label>
              <div className="relative mt-1">
                <Input type={showApiHash ? "text" : "password"} value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder="abcdef1234567890..." className="bg-secondary border-border font-mono pl-10" dir="ltr" />
                <button type="button" onClick={() => setShowApiHash(!showApiHash)} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showApiHash ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button onClick={() => setSetupStep(2)} disabled={!apiId || !apiHash} className="gap-2">
              המשך <span className="text-xs">←</span>
            </Button>
          </div>
        )}

        {/* Step 2: Phone number */}
        {setupStep === 2 && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="bg-secondary/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                הזינו את מספר הטלפון המחובר לחשבון הטלגרם שבו אתם מנויים לערוצי המקור. 
                המספר ישמש לאימות חד-פעמי בלבד.
              </p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">מספר טלפון (כולל קידומת)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+972501234567" className="mt-1 bg-secondary border-border font-mono" dir="ltr" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSetupStep(1)}>חזרה</Button>
              <Button onClick={() => setSetupStep(3)} disabled={!phone} className="gap-2">
                המשך <span className="text-xs">←</span>
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Save */}
        {setupStep === 3 && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-1">
              <p className="text-sm font-medium text-foreground">סיכום הפרטים:</p>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>API ID: <span className="font-mono text-foreground">{apiId}</span></p>
                <p>API Hash: <span className="font-mono text-foreground">{apiHash.slice(0, 6)}...</span></p>
                <p>טלפון: <span className="font-mono text-foreground">{phone}</span></p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSetupStep(2)}>חזרה</Button>
              <Button onClick={async () => { await handleSaveMtproto(); setSetupStep(4); }} disabled={mtprotoSaving} className="gap-2">
                {mtprotoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                שמור והמשך
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Run Locally */}
        {setupStep === 4 && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
              <p className="text-sm font-medium text-foreground mb-1">💻 הרצה מהמחשב שלך</p>
              <p className="text-xs text-muted-foreground">דורש Python 3.10+ בלבד. הסקריפט רץ ברקע ומעביר פוסטים חדשים אוטומטית.</p>
            </div>

            {/* Step 1: Install */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                <p className="text-sm font-medium text-foreground">התקנת ספריות</p>
              </div>
              <div className="relative">
                <pre className="text-xs bg-secondary p-3 rounded-lg font-mono" dir="ltr">pip install telethon aiohttp</pre>
                <Button variant="ghost" size="sm" className="absolute top-1 left-1 h-6 w-6 p-0" onClick={() => copyToClipboard("pip install telethon aiohttp")}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Step 2: Create .env */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                <p className="text-sm font-medium text-foreground">צרו קובץ <code className="bg-secondary px-1 rounded text-xs">.env</code> באותה תיקייה</p>
              </div>
              <div className="relative">
                <pre className="text-xs bg-secondary p-3 rounded-lg font-mono whitespace-pre" dir="ltr">{`TELEGRAM_API_ID=${apiId}
TELEGRAM_API_HASH=${apiHash}
TELEGRAM_PHONE=${phone}
INGEST_URL=${ingestUrl}
INGEST_API_KEY=YOUR_KEY_HERE
MONITOR_CHANNELS=@channel1,@channel2`}</pre>
                <Button variant="secondary" size="sm" className="absolute top-1.5 left-1.5 gap-1 h-6 text-xs" onClick={() => copyToClipboard(`TELEGRAM_API_ID=${apiId}\nTELEGRAM_API_HASH=${apiHash}\nTELEGRAM_PHONE=${phone}\nINGEST_URL=${ingestUrl}\nINGEST_API_KEY=YOUR_KEY_HERE\nMONITOR_CHANNELS=@channel1,@channel2`)}>
                  <Copy className="w-3 h-3" /> העתק
                </Button>
              </div>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside mr-2">
                <li>שנו <code className="bg-secondary px-1 rounded">YOUR_KEY_HERE</code> למפתח INGEST שלכם</li>
                <li>שנו <code className="bg-secondary px-1 rounded">@channel1,@channel2</code> לערוצי המקור שלכם</li>
              </ul>
            </div>

            {/* Step 3: Download monitor.py */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                <p className="text-sm font-medium text-foreground">הורידו את <code className="bg-secondary px-1 rounded text-xs">monitor.py</code></p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">הקובץ נמצא בתיקייה <code className="bg-secondary px-1 rounded">vps-monitor/monitor.py</code> בפרויקט. העתיקו אותו לתיקייה שבה יצרתם את ה-.env.</p>
              </div>
            </div>

            {/* Step 4: Run */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
                <p className="text-sm font-medium text-foreground">הריצו את הסקריפט</p>
              </div>
              <div className="relative">
                <pre className="text-xs bg-secondary p-3 rounded-lg font-mono" dir="ltr">python monitor.py</pre>
                <Button variant="ghost" size="sm" className="absolute top-1 left-1 h-6 w-6 p-0" onClick={() => copyToClipboard("python monitor.py")}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-foreground font-medium">🔐 בהרצה הראשונה:</p>
                <p className="text-xs text-muted-foreground">תקבלו קוד אימות בטלגרם — הזינו אותו בטרמינל. זה קורה פעם אחת בלבד.</p>
              </div>
            </div>

            {/* Keep running tip */}
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-foreground">💡 טיפ: שמירה על הסקריפט פעיל</p>
              <p className="text-xs text-muted-foreground">הסקריפט צריך לרוץ כל הזמן. ב-Windows: השאירו את חלון ה-CMD/PowerShell פתוח. ב-Mac/Linux: השתמשו ב-<code className="bg-secondary px-1 rounded cursor-pointer hover:text-foreground" onClick={() => copyToClipboard("nohup python monitor.py &")}>nohup python monitor.py &</code></p>
            </div>

            <Button variant="outline" onClick={() => setSetupStep(1)} size="sm">חזרה לשלב 1</Button>
          </div>
        )}
      </motion.div>

      {/* Bot & Webhook Settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
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
                <CheckCircle2 className="w-4 h-4 text-accent inline ml-1" />
                @{botInfo.username}
              </span>
            )}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm text-muted-foreground">Webhook URL</Label>
            </div>
            <div className="flex items-center gap-2">
              <code className="block text-xs bg-secondary p-2 rounded font-mono break-all flex-1" dir="ltr">
                {webhookUrl}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(webhookUrl)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
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
        transition={{ delay: 0.1 }}
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
        transition={{ delay: 0.15 }}
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
        transition={{ delay: 0.2 }}
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
