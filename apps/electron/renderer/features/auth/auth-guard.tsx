import { useState } from "react";
import { IconLoader2, IconBrandGoogle, IconDeviceDesktop, IconPlus, IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import { MinimalTitleBar } from "@/features/layout/minimal-title-bar";
import backgroundImage from "@/assets/background.png";
import { cn } from "@/lib/utils";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
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

  const utils = trpc.useUtils();

  const signInWithOAuth = trpc.auth.signInWithOAuth.useMutation({
    onSuccess: () => {
      toast.info("Abriendo Google...");
    },
    onError: (err) => {
      toast.error(err.message || "Error al iniciar sesión con Google");
    },
  });

  const enterLocalMode = trpc.auth.enterLocalMode.useMutation({
    onSuccess: () => {
      toast.success("Modo local activado");
      utils.auth.getSession.invalidate();
      utils.auth.getAccounts.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Error al activar modo local");
    },
  });

  const switchAccount = trpc.auth.switchAccount.useMutation({
    onSuccess: () => {
      utils.auth.getSession.invalidate();
      utils.auth.getUser.invalidate();
      utils.auth.getAccounts.invalidate();
      utils.chats.list.invalidate();
      utils.chats.listArchived.invalidate();
      utils.artifacts.list.invalidate();
      utils.userFiles.list.invalidate();
      toast.success("Bienvenido de nuevo");
      setSwitchingId(null);
    },
    onError: () => {
      toast.error("Error al cambiar de cuenta");
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
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <MinimalTitleBar />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-white drop-shadow-lg">
                Bienvenido a S-AGI
              </h2>
              <p className="text-white/80 max-w-sm">
                Selecciona una cuenta para continuar
              </p>
            </div>

            {/* Account List */}
            <div className="w-[320px] rounded-xl bg-white/10 backdrop-blur-md border border-white/20 overflow-hidden">
              {accounts.map((account) => {
                const avatarUrl = account.avatarUrl || '';
                const isEmoji = avatarUrl.startsWith('emoji://');
                const emoji = isEmoji ? decodeURIComponent(avatarUrl.split('://')[1]?.split('?')[0] || '👤') : null;
                const bgColor = isEmoji ? decodeURIComponent(avatarUrl.split('bg=')[1] || '#6366f1') : null;

                return (
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
                      {isEmoji ? (
                        <AvatarFallback
                          className="text-xl"
                          style={{ backgroundColor: bgColor || undefined }}
                        >
                          {emoji}
                        </AvatarFallback>
                      ) : avatarUrl && !account.isLocal ? (
                        <AvatarImage src={avatarUrl} />
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
                        {account.isLocal ? (account.displayName || "Cuenta Local") : account.email}
                      </p>
                      <p className="text-xs text-white/60 truncate">
                        {account.isLocal ? "Modo offline" : account.provider || "Cloud"}
                      </p>
                    </div>
                    {switchingId === account.id ? (
                      <IconLoader2 size={18} className="animate-spin text-white/60" />
                    ) : (
                      <IconCheck size={18} className="text-white/40" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 w-[280px]">
              <div className="flex-1 border-t border-white/30" />
              <span className="text-xs text-white/60">o</span>
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
              Agregar otra cuenta
            </Button>
          </div>
        </div>
      );
    }

    // No accounts exist - show login screen (Google + Local only)
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
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        <MinimalTitleBar />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-white drop-shadow-lg">
              Bienvenido a S-AGI
            </h2>
            <p className="text-white/80 max-w-sm">
              Tu asistente de oficina con IA
            </p>
          </div>

          {/* Google Sign In - Primary */}
          <Button
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={signInWithOAuth.isPending}
            className="min-w-[280px] bg-white text-black hover:bg-white/90 shadow-lg h-12 text-base"
          >
            {signInWithOAuth.isPending ? (
              <IconLoader2 className="mr-3 h-5 w-5 animate-spin" />
            ) : (
              <IconBrandGoogle className="mr-3 h-5 w-5" />
            )}
            Continuar con Google
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-4 w-[280px]">
            <div className="flex-1 border-t border-white/30" />
            <span className="text-xs text-white/60">o</span>
            <div className="flex-1 border-t border-white/30" />
          </div>

          {/* Local mode option */}
          <Button
            variant="outline"
            onClick={handleLocalMode}
            disabled={enterLocalMode.isPending}
            className="min-w-[280px] bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm h-12 text-base"
          >
            {enterLocalMode.isPending ? (
              <IconLoader2 className="mr-3 h-5 w-5 animate-spin" />
            ) : (
              <IconDeviceDesktop className="mr-3 h-5 w-5" />
            )}
            Usar sin cuenta (local)
          </Button>

          <p className="text-[11px] text-white/50 text-center max-w-[280px]">
            El modo local guarda todo en tu dispositivo
          </p>
        </div>
      </div>
    );
  }

  // Authenticated - render children
  return <>{children}</>;
}
