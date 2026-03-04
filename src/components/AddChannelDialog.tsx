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
import { Switch } from "@/components/ui/switch";
import { TablesInsert } from "@/integrations/supabase/types";

interface AddChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (channel: TablesInsert<"channels">) => void;
}

export function AddChannelDialog({ open, onOpenChange, onAdd }: AddChannelDialogProps) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [type, setType] = useState<"source" | "target">("source");
  const [isOwned, setIsOwned] = useState(true);
  const [language, setLanguage] = useState("he");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ name, handle, type, is_owned: isOwned, language });
    setName("");
    setHandle("");
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
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} className="mt-1 bg-secondary border-border font-mono" dir="ltr" placeholder="@channel" required />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">סוג</Label>
            <div className="flex gap-2 mt-1">
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
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 bg-secondary border-border w-24" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">ערוץ שלי</Label>
            <Switch checked={isOwned} onCheckedChange={setIsOwned} />
          </div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground">
            הוסף ערוץ
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
