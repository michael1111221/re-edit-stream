import {
  LayoutDashboard,
  Radio,
  GitBranch,
  Calendar,
  Settings,
  Zap,
  Send,
  Route,
  BookOpen,
  Activity,
  LogOut,
  X,
} from "lucide-react";
import { PageView } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface SidebarNavProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
  onPublish?: () => void;
  open: boolean;
  onClose: () => void;
}

const navItems: { id: PageView; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "דאשבורד", icon: LayoutDashboard },
  { id: "channels", label: "ערוצים", icon: Radio },
  { id: "mappings", label: "מיפויים", icon: Route },
  { id: "catalog", label: "בוט קטלוג", icon: BookOpen },
  { id: "pipeline", label: "תור עיבוד", icon: GitBranch },
  { id: "schedule", label: "תזמון", icon: Calendar },
  { id: "scheduler-runs", label: "ריצות תזמון", icon: Activity },
  { id: "settings", label: "הגדרות", icon: Settings },
];

export function SidebarNav({ currentPage, onNavigate, onPublish, open, onClose }: SidebarNavProps) {
  const handleNavigate = (page: PageView) => {
    onNavigate(page);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-background/70 backdrop-blur-sm z-40"
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed right-0 top-0 h-screen w-64 border-l border-border bg-sidebar flex flex-col z-50 transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md gradient-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground text-lg">TeleFlow</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-2 text-muted-foreground hover:text-foreground"
            aria-label="סגור תפריט"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-md text-base font-medium transition-all duration-200 text-right",
                  isActive
                    ? "bg-secondary text-primary glow-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-primary")} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3">
          <button
            onClick={() => {
              onPublish?.();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-md text-sm font-medium gradient-primary text-primary-foreground transition-all hover:opacity-90"
          >
            <Send className="w-4 h-4" />
            פרסם לטלגרם
          </button>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse-glow" />
            <span className="text-xs text-muted-foreground">מערכת פעילה</span>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-muted-foreground hover:text-destructive transition-colors p-2 -m-2"
            title="התנתק"
            aria-label="התנתק"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
