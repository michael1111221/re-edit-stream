import { motion } from "framer-motion";
import { Channel } from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Radio, 
  ExternalLink, 
  Pause, 
  Play, 
  Video,
  Plus,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelListProps {
  channels: Channel[];
  onAddChannel?: () => void;
  onToggleStatus?: (channel: Channel) => void;
  onDeleteChannel?: (channel: Channel) => void;
}

export function ChannelList({ channels, onAddChannel, onToggleStatus, onDeleteChannel }: ChannelListProps) {
  const sourceChannels = channels.filter(c => c.type === "source");
  const targetChannels = channels.filter(c => c.type === "target");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">ניהול ערוצים</h2>
        <Button size="sm" className="gradient-primary text-primary-foreground gap-1.5" onClick={onAddChannel}>
          <Plus className="w-4 h-4" />
          הוסף ערוץ
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-info" />
            <h3 className="text-sm font-medium text-muted-foreground">ערוצי מקור ({sourceChannels.length})</h3>
          </div>
          {sourceChannels.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">אין ערוצי מקור</div>}
          {sourceChannels.map((channel, i) => (
            <ChannelCard key={channel.id} channel={channel} index={i} onToggleStatus={onToggleStatus} onDelete={onDeleteChannel} />
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <h3 className="text-sm font-medium text-muted-foreground">ערוצי יעד ({targetChannels.length})</h3>
          </div>
          {targetChannels.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">אין ערוצי יעד</div>}
          {targetChannels.map((channel, i) => (
            <ChannelCard key={channel.id} channel={channel} index={i} onToggleStatus={onToggleStatus} onDelete={onDeleteChannel} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChannelCard({ channel, index, onToggleStatus }: { channel: Channel; index: number; onToggleStatus?: (channel: Channel) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="rounded-lg border border-border bg-card p-4 shadow-card hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            channel.type === "source" ? "bg-info/15" : "bg-primary/15"
          )}>
            <Radio className={cn(
              "w-5 h-5",
              channel.type === "source" ? "text-info" : "text-primary"
            )} />
          </div>
          <div>
            <div className="font-medium text-foreground">{channel.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{channel.handle}</div>
          </div>
        </div>

        <Badge variant="outline" className={cn(
          "text-xs",
          channel.status === "active" ? "border-success/30 text-success" : "border-warning/30 text-warning"
        )}>
          {channel.status === "active" ? "פעיל" : "מושהה"}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Video className="w-3 h-3" />
            {channel.video_count} סרטונים
          </span>
          {!channel.is_owned && (
            <span className="flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              ערוץ חיצוני
            </span>
          )}
        </div>
        <button
          onClick={() => onToggleStatus?.(channel)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {channel.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
      </div>
    </motion.div>
  );
}
