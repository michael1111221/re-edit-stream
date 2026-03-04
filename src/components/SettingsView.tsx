import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Languages, 
  Link2, 
  LinkIcon, 
  Bell, 
  Zap,
  Shield
} from "lucide-react";

export function SettingsView() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-semibold text-foreground">הגדרות</h2>

      {/* Translation Settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
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
