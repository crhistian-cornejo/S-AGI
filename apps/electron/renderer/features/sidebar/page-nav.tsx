import { useAtom } from "jotai";
import {
  IconFileText,
  IconFileTypePdf,
  IconNotes,
  IconPlus,
  IconTable,
} from "@tabler/icons-react";
import { activeTabAtom } from "@/lib/atoms";
import { cn } from "@/lib/utils";

type PageNavProps = {
  onNewChat?: () => void;
  showNewChat?: boolean;
  className?: string;
};

const NAV_ITEMS = [
  { id: "excel", label: "Spreadsheets", icon: IconTable },
  { id: "doc", label: "Docs", icon: IconFileText },
  { id: "pdf", label: "PDFs", icon: IconFileTypePdf },
  { id: "ideas", label: "Notes", icon: IconNotes },
] as const;

export function PageNav({
  onNewChat,
  showNewChat = true,
  className,
}: PageNavProps) {
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);

  return (
    <div className={cn("space-y-1", className)}>
      {showNewChat && (
        <button
          type="button"
          onClick={() => {
            setActiveTab("chat");
            if (onNewChat) {
              onNewChat();
            } else {
              setActiveTab("chat");
            }
          }}
          className={cn(
            "w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium",
            "bg-background border border-border/60 text-foreground hover:bg-muted/30 transition-colors",
          )}
        >
          <IconPlus size={16} />
          <span>New thread</span>
        </button>
      )}
      <div className="pt-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-background border border-border/60 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
