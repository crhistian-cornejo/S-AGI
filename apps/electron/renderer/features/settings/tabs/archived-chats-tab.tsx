import { useMemo, useState } from "react";
import { useSetAtom } from "jotai";
import {
  IconArchive,
  IconArchiveOff,
  IconLoader2,
  IconSearch,
  IconTrash,
  IconMessageCircle,
} from "@tabler/icons-react";
import { trpc } from "@/lib/trpc";
import { activeTabAtom, selectedChatIdAtom } from "@/lib/atoms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function formatRelativeTime(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function ArchivedChatsTab() {
  const [query, setQuery] = useState("");
  const setActiveTab = useSetAtom(activeTabAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const utils = trpc.useUtils();

  const { data: archivedChats, isLoading, refetch } =
    trpc.chats.listArchived.useQuery(undefined, {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 30,
    });

  const restoreChat = trpc.chats.restore.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate();
      utils.chats.listArchived.invalidate();
      refetch();
      toast.success("Chat restored");
    },
    onError: (error) => {
      toast.error(`Failed to restore chat: ${error.message}`);
    },
  });

  const deleteChat = trpc.chats.delete.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate();
      utils.chats.listArchived.invalidate();
      refetch();
      toast.success("Chat deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete chat: ${error.message}`);
    },
  });

  const filtered = useMemo(() => {
    const list = archivedChats || [];
    const text = query.trim().toLowerCase();
    if (!text) return list;
    return list.filter((chat) => (chat.title || "Untitled").toLowerCase().includes(text));
  }, [archivedChats, query]);

  const openChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setActiveTab("chat");
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <IconArchive size={18} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">Archived Chats</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Review, restore, or delete archived conversations.
        </p>
      </div>

      <div className="relative max-w-md">
        <IconSearch
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search archived chats..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <IconLoader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-8 text-center">
          <IconArchive size={26} className="mx-auto mb-2 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {query.trim() ? "No archived chats match your search." : "No archived chats yet."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
          {filtered.map((chat) => (
            <div key={chat.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {chat.title || "Untitled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Updated {formatRelativeTime(chat.updated_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => openChat(chat.id)}
                >
                  <IconMessageCircle size={14} />
                  Open
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => restoreChat.mutate({ id: chat.id })}
                  disabled={restoreChat.isPending}
                >
                  <IconArchiveOff size={14} />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteChat.mutate({ id: chat.id })}
                  disabled={deleteChat.isPending}
                >
                  <IconTrash size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
