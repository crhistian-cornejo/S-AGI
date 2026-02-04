import { useState } from "react";
import { useSetAtom } from "jotai";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconUsers,
  IconDeviceDesktop,
  IconBrandGoogle,
  IconMail,
  IconPlus,
  IconTrash,
  IconSwitchHorizontal,
  IconLogout,
  IconLoader2,
} from "@tabler/icons-react";
import { authDialogOpenAtom } from "@/lib/atoms";

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;

  return new Date(timestamp).toLocaleDateString();
}

function getProviderIcon(provider?: string, isLocal?: boolean) {
  if (isLocal) return <IconDeviceDesktop size={16} />;
  switch (provider) {
    case "google":
      return <IconBrandGoogle size={16} />;
    case "email":
      return <IconMail size={16} />;
    default:
      return <IconMail size={16} />;
  }
}

function getProviderLabel(provider?: string, isLocal?: boolean) {
  if (isLocal) return "Local / Offline";
  switch (provider) {
    case "google":
      return "Google";
    case "github":
      return "GitHub";
    case "email":
      return "Email";
    default:
      return provider || "Cloud";
  }
}

type AccountsTabProps = {
  variant?: "standalone" | "embedded";
  className?: string;
};

export function AccountsTab({ variant = "standalone", className }: AccountsTabProps) {
  const utils = trpc.useUtils();
  const setAuthDialogOpen = useSetAtom(authDialogOpenAtom);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const isEmbedded = variant === "embedded";

  // Fetch accounts
  const { data: accountsData, isLoading } = trpc.auth.getAccounts.useQuery();
  const accounts = accountsData?.accounts || [];

  // Mutations
  const switchAccount = trpc.auth.switchAccount.useMutation({
    onSuccess: () => {
      // Invalidate ALL user-specific caches when switching accounts
      utils.auth.getSession.invalidate();
      utils.auth.getUser.invalidate();
      utils.auth.getAccounts.invalidate();
      utils.chats.list.invalidate();
      utils.chats.listArchived.invalidate();
      utils.gallery.list.invalidate();
      utils.artifacts.list.invalidate();
      utils.userFiles.list.invalidate();
      toast.success("Switched account");
      setSwitchingId(null);
    },
    onError: () => {
      toast.error("Failed to switch account");
      setSwitchingId(null);
    },
  });

  const removeAccount = trpc.auth.removeAccount.useMutation({
    onSuccess: () => {
      utils.auth.getAccounts.invalidate();
      utils.auth.getSession.invalidate();
      toast.success("Account removed");
      setRemovingId(null);
    },
    onError: () => {
      toast.error("Failed to remove account");
      setRemovingId(null);
    },
  });

  const signOutAll = trpc.auth.signOutAll.useMutation({
    onSuccess: () => {
      window.desktopApi?.setSession(null);
      utils.auth.getSession.invalidate();
      utils.auth.getAccounts.invalidate();
      toast.success("Signed out from all accounts");
    },
    onError: () => {
      toast.error("Failed to sign out");
    },
  });

  const handleSwitch = (accountId: string) => {
    setSwitchingId(accountId);
    switchAccount.mutate({ accountId });
  };

  const handleRemove = (accountId: string) => {
    setRemovingId(accountId);
    removeAccount.mutate({ accountId });
  };

  return (
    <div className={cn(isEmbedded ? "space-y-8" : "p-6 space-y-8", className)}>
      {/* Header */}
      <div className="flex flex-col space-y-1.5">
        <div className="flex items-center gap-2">
          <IconUsers size={18} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">Accounts</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Manage your connected accounts and switch between them
        </p>
      </div>

      {/* Connected Accounts Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Connected Accounts
        </h4>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-8 text-center">
            <IconUsers size={32} className="mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No accounts connected</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add an account to get started
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
            {accounts.map((account) => (
              <div
                key={account.id}
                className={cn(
                  "flex items-center gap-4 px-4 py-3",
                  account.isActive && "bg-primary/5"
                )}
              >
                {/* Avatar */}
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    {account.avatarUrl ? (
                      <AvatarImage src={account.avatarUrl} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10">
                      {account.isLocal ? (
                        <IconDeviceDesktop size={18} />
                      ) : (
                        account.email?.charAt(0).toUpperCase() || "?"
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {account.isActive && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                  )}
                </div>

                {/* Account Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {account.isLocal ? "Local Account" : account.email}
                    </p>
                    {account.isActive && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-green-500/10 text-green-600 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {getProviderIcon(account.provider, account.isLocal)}
                      {getProviderLabel(account.provider, account.isLocal)}
                    </span>
                    <span className="text-xs text-muted-foreground/60">
                      {" \u2022 "}
                      Connected {formatTimeAgo(account.connectedAt)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {!account.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => handleSwitch(account.id)}
                      disabled={switchingId === account.id}
                    >
                      {switchingId === account.id ? (
                        <IconLoader2 size={14} className="animate-spin" />
                      ) : (
                        <IconSwitchHorizontal size={14} />
                      )}
                      Switch
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(account.id)}
                    disabled={removingId === account.id}
                  >
                    {removingId === account.id ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconTrash size={14} />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Actions
        </h4>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => setAuthDialogOpen(true)}
            className="h-9 gap-2"
          >
            <IconPlus size={16} />
            Add Account
          </Button>

          {accounts.length > 0 && (
            <Button
              variant="outline"
              onClick={() => signOutAll.mutate()}
              disabled={signOutAll.isPending}
              className="h-9 gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {signOutAll.isPending ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconLogout size={16} />
              )}
              Sign Out All
            </Button>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="pt-2 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground">
          Your accounts are securely stored using OS-level encryption. Switch between
          accounts to access different workspaces and data.
        </p>
      </div>
    </div>
  );
}
