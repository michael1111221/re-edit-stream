import { useState } from "react";
import { motion } from "framer-motion";
import { Channel, ChannelMapping, BannedWord } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  Plus,
  ArrowLeft,
  Link2Off,
  Link2,
  Languages,
  FileSignature,
  ShieldBan,
  Trash2,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface MappingsViewProps {
  channels: Channel[];
}

export function MappingsView({ channels }: MappingsViewProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editMapping, setEditMapping] = useState<ChannelMapping | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sourceChannels = channels.filter((c) => c.type === "source");
  const targetChannels = channels.filter((c) => c.type === "target");

  const { data: mappings = [] } = useQuery({
    queryKey: ["channel_mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_mappings")
        .select("*, source_channel:channels!channel_mappings_source_channel_id_fkey(*), target_channel:channels!channel_mappings_target_channel_id_fkey(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ChannelMapping[];
    },
  });

  const addMapping = useMutation({
    mutationFn: async (data: { source_channel_id: string; target_channel_id: string }) => {
      const { error } = await supabase.from("channel_mappings").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel_mappings"] });
      setAddOpen(false);
      toast({ title: "מיפוי נוצר בהצלחה" });
    },
    onError: (e) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const updateMapping = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => {
      const { error } = await supabase.from("channel_mappings").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel_mappings"] });
      toast({ title: "מיפוי עודכן" });
    },
  });

  const deleteMapping = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channel_mappings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel_mappings"] });
      toast({ title: "מיפוי נמחק" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">מיפויי ערוצים</h2>
          <p className="text-sm text-muted-foreground mt-1">הגדר איזה ערוץ מקור מפרסם לאיזה ערוץ יעד, וחוקי עריכה לכל מיפוי</p>
        </div>
        <Button size="sm" className="gradient-primary text-primary-foreground gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4" />
          מיפוי חדש
        </Button>
      </div>

      {mappings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Settings2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>עדיין אין מיפויים. צור מיפוי ראשון כדי להגדיר את זרימת התוכן.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {mappings.map((mapping, i) => (
            <MappingCard
              key={mapping.id}
              mapping={mapping}
              index={i}
              onToggleActive={() =>
                updateMapping.mutate({ id: mapping.id, is_active: !mapping.is_active })
              }
              onEdit={() => setEditMapping(mapping)}
              onDelete={() => deleteMapping.mutate(mapping.id)}
            />
          ))}
        </div>
      )}

      <AddMappingDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        sourceChannels={sourceChannels}
        targetChannels={targetChannels}
        onAdd={(source, target) => addMapping.mutate({ source_channel_id: source, target_channel_id: target })}
      />

      {editMapping && (
        <EditMappingDialog
          open={!!editMapping}
          onOpenChange={(open) => !open && setEditMapping(null)}
          mapping={editMapping}
          onUpdate={(updates) => {
            updateMapping.mutate({ id: editMapping.id, ...updates });
            setEditMapping(null);
          }}
        />
      )}
    </div>
  );
}

function MappingCard({
  mapping,
  index,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  mapping: ChannelMapping;
  index: number;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const rules = [];
  if (mapping.remove_links) rules.push({ icon: Link2Off, label: "הסרת קישורים" });
  if (mapping.add_buttons) rules.push({ icon: Link2, label: "כפתורים" });
  if (mapping.auto_translate) rules.push({ icon: Languages, label: `תרגום ל${mapping.target_language}` });
  if (mapping.add_signature) rules.push({ icon: FileSignature, label: "חתימה" });
  if (mapping.filter_banned_words) rules.push({ icon: ShieldBan, label: "סינון מילים" });
  if ((mapping as any).filter_buttons) rules.push({ icon: Link2Off, label: "סינון כפתורים" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className="p-4 border-border hover:border-primary/30 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Switch checked={mapping.is_active} onCheckedChange={onToggleActive} />
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-info/30 text-info text-xs">
                {mapping.source_channel?.name || "—"}
              </Badge>
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                {mapping.target_channel?.name || "—"}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Settings2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {rules.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {rules.map((rule, i) => (
              <Badge key={i} variant="secondary" className="text-xs gap-1">
                <rule.icon className="w-3 h-3" />
                {rule.label}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function AddMappingDialog({
  open,
  onOpenChange,
  sourceChannels,
  targetChannels,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sourceChannels: Channel[];
  targetChannels: Channel[];
  onAdd: (source: string, target: string) => void;
}) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-foreground">מיפוי חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">ערוץ מקור</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="mt-1 bg-secondary border-border">
                <SelectValue placeholder="בחר ערוץ מקור" />
              </SelectTrigger>
              <SelectContent>
                {sourceChannels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">ערוץ יעד</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="mt-1 bg-secondary border-border">
                <SelectValue placeholder="בחר ערוץ יעד" />
              </SelectTrigger>
              <SelectContent>
                {targetChannels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full gradient-primary text-primary-foreground"
            disabled={!source || !target}
            onClick={() => {
              onAdd(source, target);
              setSource("");
              setTarget("");
            }}
          >
            צור מיפוי
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditMappingDialog({
  open,
  onOpenChange,
  mapping,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mapping: ChannelMapping;
  onUpdate: (updates: Record<string, any>) => void;
}) {
  const [removeLinks, setRemoveLinks] = useState(mapping.remove_links);
  const [addButtons, setAddButtons] = useState(mapping.add_buttons);
  const [autoTranslate, setAutoTranslate] = useState(mapping.auto_translate);
  const [targetLang, setTargetLang] = useState(mapping.target_language);
  const [addSignature, setAddSignature] = useState(mapping.add_signature);
  const [signatureText, setSignatureText] = useState(mapping.signature_text || "");
  const [filterBanned, setFilterBanned] = useState(mapping.filter_banned_words);
  const [filterButtons, setFilterButtons] = useState((mapping as any).filter_buttons ?? false);
  const [buttons, setButtons] = useState<{ text: string; url: string }[]>(
    (mapping.default_buttons as any[]) || []
  );

  // Banned words management
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newWord, setNewWord] = useState("");
  const [newWordAction, setNewWordAction] = useState<"remove_word" | "skip_post">("remove_word");

  const { data: bannedWords = [] } = useQuery({
    queryKey: ["banned_words", mapping.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banned_words")
        .select("*")
        .or(`mapping_id.eq.${mapping.id},is_global.eq.true`)
        .order("created_at");
      if (error) throw error;
      return data as BannedWord[];
    },
  });

  const addBannedWord = useMutation({
    mutationFn: async () => {
      if (!newWord.trim()) return;
      const { error } = await supabase.from("banned_words").insert({
        word: newWord.trim(),
        mapping_id: mapping.id,
        action: newWordAction,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banned_words", mapping.id] });
      setNewWord("");
    },
  });

  const deleteBannedWord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("banned_words").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["banned_words", mapping.id] }),
  });

  const handleSave = () => {
    onUpdate({
      remove_links: removeLinks,
      add_buttons: addButtons,
      auto_translate: autoTranslate,
      target_language: targetLang,
      add_signature: addSignature,
      signature_text: signatureText,
      filter_banned_words: filterBanned,
      default_buttons: buttons,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            חוקי עריכה: {mapping.source_channel?.name} → {mapping.target_channel?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Remove Links */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2Off className="w-4 h-4 text-muted-foreground" />
              <Label>הסרת קישורים מהטקסט</Label>
            </div>
            <Switch checked={removeLinks} onCheckedChange={setRemoveLinks} />
          </div>

          {/* Auto Translate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-muted-foreground" />
                <Label>תרגום אוטומטי</Label>
              </div>
              <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate} />
            </div>
            {autoTranslate && (
              <Input
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="bg-secondary border-border w-32"
                placeholder="שפת יעד"
              />
            )}
          </div>

          {/* Add Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-muted-foreground" />
                <Label>הוספת כפתורים</Label>
              </div>
              <Switch checked={addButtons} onCheckedChange={setAddButtons} />
            </div>
            {addButtons && (
              <div className="space-y-2">
                {buttons.map((btn, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      value={btn.text}
                      onChange={(e) => {
                        const copy = [...buttons];
                        copy[i] = { ...copy[i], text: e.target.value };
                        setButtons(copy);
                      }}
                      className="bg-secondary border-border flex-1"
                      placeholder="טקסט"
                    />
                    <Input
                      value={btn.url}
                      onChange={(e) => {
                        const copy = [...buttons];
                        copy[i] = { ...copy[i], url: e.target.value };
                        setButtons(copy);
                      }}
                      className="bg-secondary border-border flex-1 font-mono text-xs"
                      placeholder="https://..."
                      dir="ltr"
                    />
                    <Button variant="ghost" size="sm" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setButtons([...buttons, { text: "", url: "" }])}>
                  <Plus className="w-3 h-3 ml-1" /> כפתור
                </Button>
              </div>
            )}
          </div>

          {/* Signature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-muted-foreground" />
                <Label>הוספת חתימה</Label>
              </div>
              <Switch checked={addSignature} onCheckedChange={setAddSignature} />
            </div>
            {addSignature && (
              <Input
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
                className="bg-secondary border-border"
                placeholder="טקסט חתימה, לדוגמה: 📢 @mychannel"
              />
            )}
          </div>

          {/* Banned Words */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldBan className="w-4 h-4 text-muted-foreground" />
                <Label>סינון מילים אסורות</Label>
              </div>
              <Switch checked={filterBanned} onCheckedChange={setFilterBanned} />
            </div>
            {filterBanned && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    className="bg-secondary border-border flex-1"
                    placeholder="מילה אסורה"
                    onKeyDown={(e) => e.key === "Enter" && addBannedWord.mutate()}
                  />
                  <Select value={newWordAction} onValueChange={(v) => setNewWordAction(v as any)}>
                    <SelectTrigger className="w-28 bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remove_word">הסר מילה</SelectItem>
                      <SelectItem value="skip_post">דלג פוסט</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => addBannedWord.mutate()}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bannedWords.map((bw) => (
                    <Badge
                      key={bw.id}
                      variant={bw.action === "skip_post" ? "destructive" : "secondary"}
                      className="text-xs gap-1 cursor-pointer"
                      onClick={() => deleteBannedWord.mutate(bw.id)}
                    >
                      {bw.word}
                      {bw.is_global && " 🌍"}
                      <X className="w-2.5 h-2.5" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button className="w-full gradient-primary text-primary-foreground" onClick={handleSave}>
            שמור חוקי עריכה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
