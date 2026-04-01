import { useState } from "react";
import { motion } from "framer-motion";
import { Channel } from "@/types/dashboard";
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
import { Plus, Trash2, FolderOpen, GripVertical, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface CatalogViewProps {
  channels: Channel[];
}

type CatalogCategory = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type CategoryChannel = {
  id: string;
  category_id: string;
  channel_id: string;
  sort_order: number;
  channel?: Channel | null;
};

export function CatalogView({ channels }: CatalogViewProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<CatalogCategory | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["catalog_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_categories")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as CatalogCategory[];
    },
  });

  const addCategory = useMutation({
    mutationFn: async (cat: { name: string; description?: string; icon: string }) => {
      const { error } = await supabase.from("catalog_categories").insert({
        ...cat,
        sort_order: categories.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog_categories"] });
      setAddOpen(false);
      toast({ title: "קטגוריה נוספה" });
    },
    onError: (e) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog_categories"] });
      toast({ title: "קטגוריה נמחקה" });
    },
  });

  const toggleCategory = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("catalog_categories").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog_categories"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">בוט קטלוג</h2>
          <p className="text-sm text-muted-foreground mt-1">
            נהל קטגוריות וערוצים שיוצגו בבוט הקטלוג לגולשים
          </p>
        </div>
        <Button size="sm" className="gradient-primary text-primary-foreground gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4" />
          קטגוריה חדשה
        </Button>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>עדיין אין קטגוריות. צור קטגוריה ראשונה כדי לארגן את הערוצים.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 border-border hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={cat.is_active}
                      onCheckedChange={(v) => toggleCategory.mutate({ id: cat.id, is_active: v })}
                    />
                    <span className="text-lg">{cat.icon}</span>
                    <div>
                      <span className="font-medium text-foreground">{cat.name}</span>
                      {cat.description && (
                        <p className="text-xs text-muted-foreground">{cat.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditCategory(cat)}>
                      ערוצים
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`למחוק את הקטגוריה "${cat.name}"?`)) {
                          deleteCategory.mutate(cat.id);
                        }
                      }}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <AddCategoryDialog open={addOpen} onOpenChange={setAddOpen} onAdd={(data) => addCategory.mutate(data)} />

      {editCategory && (
        <EditCategoryChannelsDialog
          open={!!editCategory}
          onOpenChange={(o) => !o && setEditCategory(null)}
          category={editCategory}
          allChannels={channels}
        />
      )}
    </div>
  );
}

function AddCategoryDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (data: { name: string; description?: string; icon: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📁");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-foreground">קטגוריה חדשה</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div>
              <Label className="text-sm text-muted-foreground">אייקון</Label>
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="mt-1 bg-secondary border-border w-16 text-center text-lg"
              />
            </div>
            <div className="flex-1">
              <Label className="text-sm text-muted-foreground">שם</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 bg-secondary border-border"
                placeholder="למשל: ספורט"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">תיאור (אופציונלי)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 bg-secondary border-border"
              placeholder="ערוצי ספורט מובילים"
            />
          </div>
          <Button
            className="w-full gradient-primary text-primary-foreground"
            disabled={!name.trim()}
            onClick={() => {
              onAdd({ name: name.trim(), description: description.trim() || undefined, icon });
              setName("");
              setDescription("");
              setIcon("📁");
            }}
          >
            צור קטגוריה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditCategoryChannelsDialog({
  open,
  onOpenChange,
  category,
  allChannels,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: CatalogCategory;
  allChannels: Channel[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedChannel, setSelectedChannel] = useState("");

  const targetChannels = allChannels.filter((c) => c.type === "target");

  const { data: categoryChannels = [] } = useQuery({
    queryKey: ["catalog_category_channels", category.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_category_channels")
        .select("*, channel:channels(*)")
        .eq("category_id", category.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as CategoryChannel[];
    },
  });

  const addChannelToCategory = useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase.from("catalog_category_channels").insert({
        category_id: category.id,
        channel_id: channelId,
        sort_order: categoryChannels.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog_category_channels", category.id] });
      setSelectedChannel("");
      toast({ title: "ערוץ נוסף לקטגוריה" });
    },
    onError: (e) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const removeChannelFromCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_category_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog_category_channels", category.id] });
      toast({ title: "ערוץ הוסר מהקטגוריה" });
    },
  });

  const assignedIds = categoryChannels.map((cc) => cc.channel_id);
  const availableChannels = targetChannels.filter((c) => !assignedIds.includes(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {category.icon} ערוצים ב"{category.name}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add channel */}
          <div className="flex gap-2">
            <Select value={selectedChannel} onValueChange={setSelectedChannel}>
              <SelectTrigger className="bg-secondary border-border flex-1">
                <SelectValue placeholder="בחר ערוץ להוספה" />
              </SelectTrigger>
              <SelectContent>
                {availableChannels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!selectedChannel}
              onClick={() => addChannelToCategory.mutate(selectedChannel)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Channel list */}
          {categoryChannels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              אין ערוצים בקטגוריה זו עדיין
            </p>
          ) : (
            <div className="space-y-2">
              {categoryChannels.map((cc) => (
                <div key={cc.id} className="flex items-center justify-between bg-secondary rounded-md px-3 py-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{cc.channel?.name}</span>
                    <span className="text-xs text-muted-foreground">{cc.channel?.handle}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeChannelFromCategory.mutate(cc.id)}
                    className="text-destructive hover:text-destructive h-7 w-7 p-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
