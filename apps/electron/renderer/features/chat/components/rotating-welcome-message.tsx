import { useMemo } from "react";
import { Logo } from "@/components/ui/logo";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const GENERIC_WELCOME_MESSAGES = [
  "What are we building today?",
  "Ready when you are.",
  "Need a quick spreadsheet?",
  "Let's make this sheet shine.",
  "What should we tackle next?",
];

const NAMED_WELCOME_TEMPLATES = [
  "{name}, what are we building today?",
  "Ready when you are, {name}.",
  "{name}, need a quick spreadsheet?",
  "Let's make this sheet shine, {name}.",
  "What should we tackle next, {name}?",
];

const PLACEHOLDER_NAMES = new Set([
  "account",
  "cuenta",
  "local",
  "user",
  "usuario",
]);

type AuthAccount = {
  displayName?: string | null;
  email?: string | null;
  isActive?: boolean;
};

type AccountsQueryData = {
  accounts?: AuthAccount[];
};

type UserLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type SessionLike = {
  user?: UserLike | null;
};

function toFriendlyName(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutDomain = trimmed.includes("@")
    ? trimmed.split("@")[0] ?? ""
    : trimmed;
  const normalized = withoutDomain
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const firstToken = normalized.split(" ")[0] ?? "";
  const cleanToken = firstToken.replace(/[^\p{L}\p{N}]/gu, "");
  if (!cleanToken) return null;

  const candidate =
    cleanToken.charAt(0).toUpperCase() + cleanToken.slice(1).toLowerCase();
  return PLACEHOLDER_NAMES.has(candidate.toLowerCase()) ? null : candidate;
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function resolveUserName(
  accountsData?: AccountsQueryData,
  user?: UserLike | null,
  session?: SessionLike | null
): string | null {
  const activeAccount = accountsData?.accounts?.find((account) => account.isActive);
  const userMetadata = user?.user_metadata;
  const sessionMetadata = session?.user?.user_metadata;

  const nameCandidates = [
    activeAccount?.displayName,
    getMetadataString(userMetadata, "full_name"),
    getMetadataString(userMetadata, "name"),
    getMetadataString(userMetadata, "username"),
    getMetadataString(sessionMetadata, "full_name"),
    getMetadataString(sessionMetadata, "name"),
    activeAccount?.email,
    user?.email,
    session?.user?.email,
  ];

  for (const candidate of nameCandidates) {
    const friendlyName = toFriendlyName(candidate);
    if (friendlyName) return friendlyName;
  }
  return null;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function useThreadWelcomeMessage(threadId?: string | null) {
  const { data: session } = trpc.auth.getSession.useQuery();
  const { data: user } = trpc.auth.getUser.useQuery();
  const { data: accountsData } = trpc.auth.getAccounts.useQuery();

  const userName = useMemo(
    () =>
      resolveUserName(
        accountsData as AccountsQueryData | undefined,
        user as UserLike | null | undefined,
        session as SessionLike | null | undefined
      ),
    [accountsData, user, session]
  );

  const welcomeMessages = useMemo(() => {
    if (!userName) return GENERIC_WELCOME_MESSAGES;
    return NAMED_WELCOME_TEMPLATES.map((template) =>
      template.replace("{name}", userName)
    );
  }, [userName]);

  const messageIndex = useMemo(() => {
    if (welcomeMessages.length === 0) return 0;
    const seed = `${threadId ?? "thread"}:${userName ?? "guest"}`;
    return hashString(seed) % welcomeMessages.length;
  }, [threadId, userName, welcomeMessages.length]);

  return welcomeMessages[messageIndex] ?? GENERIC_WELCOME_MESSAGES[0];
}

export interface RotatingWelcomeMessageProps {
  className?: string;
  threadId?: string | null;
  onLogoClick?: () => void;
  logoAriaLabel?: string;
}

export function RotatingWelcomeMessage({
  className,
  threadId,
  onLogoClick,
  logoAriaLabel = "Welcome",
}: RotatingWelcomeMessageProps) {
  const welcomeMessage = useThreadWelcomeMessage(threadId);

  return (
    <div
      className={cn(
        "flex flex-col items-center text-muted-foreground animate-in fade-in duration-700",
        className
      )}
    >
      <div className="mb-6">
        {onLogoClick ? (
          <button
            type="button"
            onClick={onLogoClick}
            className="rounded-2xl p-2 transition-colors hover:bg-muted/50"
            aria-label={logoAriaLabel}
          >
            <Logo size={64} />
          </button>
        ) : (
          <Logo size={64} />
        )}
      </div>
      <h1
        key={welcomeMessage}
        className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight text-center animate-in fade-in duration-500"
      >
        {welcomeMessage}
      </h1>
    </div>
  );
}
