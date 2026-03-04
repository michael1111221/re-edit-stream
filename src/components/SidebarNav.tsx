import { 
  LayoutDashboard, 
  Radio, 
  GitBranch, 
  Calendar, 
  Settings, 
  Zap
} from "lucide-react";
import { PageView } from "@/types/dashboard";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

const navItems: { id: PageView; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "דאשבורד", icon: LayoutDashboard },
  { id: "channels", label: "ערוצים", icon: Radio },
  { id: "pipeline", label: "תור עיבוד", icon: GitBranch },
  { id: "schedule", label: "תזמון", icon: Calendar },
  { id: "settings", label: "הגדרות", icon: Settings },
];

export function SidebarNav({ currentPage, onNavigate }: SidebarNavProps) {
  return (
    <aside className="fixed right-0 top-0 h-screen w-56 border-l border-border bg-sidebar flex flex-col z-50">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md gradient-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-lg">TeleFlow</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 text-right",
                isActive
                  ? "bg-secondary text-primary glow-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", isActive && "text-primary")} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse-glow" />
          <span className="text-xs text-muted-foreground">מערכת פעילה</span>
        </div>
      </div>
    </aside>
  );
}
