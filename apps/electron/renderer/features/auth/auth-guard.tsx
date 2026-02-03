import { useState } from "react";
import { useSetAtom } from "jotai";
import { IconLoader2, IconBrandGoogle, IconDeviceDesktop, IconPlus, IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { authDialogOpenAtom, authDialogModeAtom } from "@/lib/atoms";
import { trpc } from "@/lib/trpc";
import { MinimalTitleBar } from "@/features/layout/minimal-title-bar";
import backgroundImage from "@/assets/background.png";
import { cn } from "@/lib/utils";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const setAuthDialogOpen = useSetAtom(authDialogOpenAtom);
  const setAuthDialogMode = useSetAtom(authDialogModeAtom);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const {
    data: session,
    isLoading,
    error,
  } = trpc.auth.getSession.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });

  // Fetch accounts for multi-account support
  const { data: accountsData, isLoading: isLoadingAccounts } = trpc.auth.getAccounts.useQuery();
  const accounts = accountsData?.accounts || [];
  const hasAccounts = accounts.length > 0;

  // NOTE: Session synchronization is handled by the main process via encrypted storage.
  // The renderer should NOT try to sync its localStorage session to main, as this causes
  // race conditions with refresh tokens ("refresh_token_already_used" error).
  // The main process is the single source of truth for authentication.

  const utils = trpc.useUtils();

  const signInWithOAuth = trpc.auth.signInWithOAuth.useMutation({
    onSuccess: () => {
      toast.info("Opening Google sign in...");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start Google sign in");
    },
  });

  const enterLocalMode = trpc.auth.enterLocalMode.useMutation({
    onSuccess: () => {
      toast.success("Welcome! Using local storage mode.");
      // Invalidate session query to trigger re-render with local session
      utils.auth.getSession.invalidate();
      utils.auth.getAccounts.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to enter local mode");
    },
  });

  const switchAccount = trpc.auth.switchAccount.useMutation({
    onSuccess: () => {
      // Invalidate ALL user-specific caches when switching accounts
      utils.auth.getSession.invalidate();
      utils.auth.getUser.invalidate();
      utils.auth.getAccounts.invalidate();
      utils.chats.list.invalidate();
      utils.chats.listArchived.invalidate();
      utils.artifacts.list.invalidate();
      utils.userFiles.list.invalidate();
      toast.success("Welcome back!");
      setSwitchingId(null);
    },
    onError: () => {
      toast.error("Failed to switch account");
      setSwitchingId(null);
    },
  });

  const handleGoogleSignIn = () => {
    signInWithOAuth.mutate({ provider: "google" });
  };

  const handleLocalMode = () => {
    enterLocalMode.mutate();
  };

  const handleSelectAccount = (accountId: string) => {
    setSwitchingId(accountId);
    switchAccount.mutate({ accountId });
  };

  // If loading, show spinner
  if (isLoading || isLoadingAccounts) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If not authenticated, check if we have stored accounts to show account picker
  if (!session || error) {
    // If accounts exist, show account picker
    if (hasAccounts) {
      return (
        <div
          className="relative flex h-full w-full flex-col items-center justify-center gap-6"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Dark overlay for better text legibility */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <MinimalTitleBar />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-white drop-shadow-lg">
                Welcome back to S-AGI
              </h2>
              <p className="text-white/80 max-w-sm">
                Select an account to continue
              </p>
            </div>

            {/* Account List */}
            <div className="w-[320px] rounded-xl bg-white/10 backdrop-blur-md border border-white/20 overflow-hidden">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => handleSelectAccount(account.id)}
                  disabled={switchingId === account.id}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                    "hover:bg-white/10 border-b border-white/10 last:border-b-0",
                    switchingId === account.id && "opacity-70"
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    {account.avatarUrl ? (
                      <AvatarImage src={account.avatarUrl} />
                    ) : null}
                    <AvatarFallback className="bg-white/20 text-white">
                      {account.isLocal ? (
                        <IconDeviceDesktop size={18} />
                      ) : (
                        account.email?.charAt(0).toUpperCase() || "?"
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {account.isLocal ? "Local Account" : account.email}
                    </p>
                    <p className="text-xs text-white/60 truncate">
                      {account.isLocal ? "Offline mode" : account.provider || "Cloud"}
                    </p>
                  </div>
                  {switchingId === account.id ? (
                    <IconLoader2 size={18} className="animate-spin text-white/60" />
                  ) : (
                    <IconCheck size={18} className="text-white/40" />
                  )}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 w-[280px]">
              <div className="flex-1 border-t border-white/30" />
              <span className="text-xs text-white/60">or</span>
              <div className="flex-1 border-t border-white/30" />
            </div>

            {/* Add different account */}
            <Button
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={signInWithOAuth.isPending}
              className="min-w-[280px] bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
            >
              {signInWithOAuth.isPending ? (
                <IconLoader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <IconPlus className="mr-2 h-5 w-5" />
              )}
              Add Different Account
            </Button>
          </div>
        </div>
      );
    }

    // No accounts exist - show full login screen
    return (
      <div
        className="relative flex h-full w-full flex-col items-center justify-center gap-6"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Dark overlay for better text legibility */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        <MinimalTitleBar />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-white drop-shadow-lg">
              Welcome to S-AGI
            </h2>
            <p className="text-white/80 max-w-sm">
              Office agent for spreadsheet and word
            </p>
          </div>

          {/* Google Sign In - Primary */}
          <Button
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={signInWithOAuth.isPending}
            className="min-w-[280px] bg-white text-black hover:bg-white/90 shadow-lg"
          >
            {signInWithOAuth.isPending ? (
              <IconLoader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <IconBrandGoogle className="mr-2 h-5 w-5" />
            )}
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-4 w-[280px]">
            <div className="flex-1 border-t border-white/30" />
            <span className="text-xs text-white/60">or</span>
            <div className="flex-1 border-t border-white/30" />
          </div>

          {/* Email sign in option */}
          <Button
            variant="outline"
            onClick={() => {
              setAuthDialogMode("signin");
              setAuthDialogOpen(true);
            }}
            className="min-w-[280px] bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
          >
            Sign in with Email
          </Button>

          {/* Local mode option - PRIMARY for offline use */}
          <Button
            variant="outline"
            onClick={handleLocalMode}
            disabled={enterLocalMode.isPending}
            className="min-w-[280px] bg-emerald-600/80 border-emerald-500/50 text-white hover:bg-emerald-600 backdrop-blur-sm"
          >
            {enterLocalMode.isPending ? (
              <IconLoader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <IconDeviceDesktop className="mr-2 h-5 w-5" />
            )}
            Continue Offline (Local Storage)
          </Button>

          <p className="text-xs text-white/60 text-center max-w-[280px]">
            Local mode stores all data on your device. Sign in to enable cloud sync.
          </p>

          <p className="text-xs text-white/70 mt-2">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setAuthDialogMode("signup");
                setAuthDialogOpen(true);
              }}
              className="text-white hover:underline font-medium"
            >
              Create one
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Authenticated - render children
  return <>{children}</>;
}
