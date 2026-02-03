import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
    IconTrash,
    IconRefresh,
    IconBug,
    IconActivity,
    IconDatabase,
    IconWorld,
    IconCpu,
    IconCheck,
    IconX,
    IconLoader2
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import { useSetAtom } from 'jotai'
import { selectedChatIdAtom, onboardingCompletedAtom } from "../../../lib/atoms/index"
import { cn } from '@/lib/utils'

export function DebugTab() {
    const [isClearing, setIsClearing] = useState(false)
    const [isCheckingHealth, setIsCheckingHealth] = useState(false)
    const utils = trpc.useUtils()
    const setSelectedChatId = useSetAtom(selectedChatIdAtom)

    // Fetch queries
    const { data: systemInfo } = trpc.settings.getSystemInfo.useQuery()
    const { data: health, refetch: refetchHealth } = trpc.settings.checkHealth.useQuery(undefined, {
        enabled: false // Only run on demand
    })

    const handleCheckHealth = async () => {
        setIsCheckingHealth(true)
        try {
            await refetchHealth()
            toast.success('Health check completed')
        } catch {
            toast.error('Health check failed')
        } finally {
            setIsCheckingHealth(false)
        }
    }

    const handleClearLocalStorage = () => {
        try {
            localStorage.clear()
            toast.success('Local storage cleared')
        } catch {
            toast.error('Failed to clear local storage')
        }
    }

    const setOnboardingCompleted = useSetAtom(onboardingCompletedAtom)

    const handleResetOnboarding = () => {
        try {
            setOnboardingCompleted(false)
            toast.success('Onboarding reset')
        } catch {
            toast.error('Failed to reset onboarding')
        }
    }

    const handleClearAllChats = async () => {
        setIsClearing(true)
        try {
            setSelectedChatId(null)
            await utils.chats.list.invalidate()
            toast.success('Chats cache cleared')
        } catch {
            toast.error('Failed to clear chats')
        } finally {
            setIsClearing(false)
        }
    }

    const handleRefreshSession = async () => {
        try {
            await utils.auth.getSession.invalidate()
            await utils.auth.getUser.invalidate()
            toast.success('Session refreshed')
        } catch {
            toast.error('Failed to refresh session')
        }
    }

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex flex-col space-y-1.5">
                <div className="flex items-center gap-2">
                    <IconBug size={18} className="text-orange-500" />
                    <h3 className="text-sm font-semibold text-foreground">Debug Tools</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                    Development tools for testing and debugging
                </p>
            </div>

            {/* Health Status Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        System Health
                    </h4>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-24 text-xs gap-1.5"
                        onClick={handleCheckHealth}
                        disabled={isCheckingHealth}
                    >
                        {isCheckingHealth ? <IconLoader2 size={14} className="animate-spin" /> : <IconActivity size={14} />}
                        Check
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <HealthCard
                        label="Internet"
                        status={health?.internet}
                        icon={<IconWorld size={16} />}
                        loading={isCheckingHealth}
                    />
                    <HealthCard
                        label="Supabase"
                        status={health?.supabase}
                        icon={<IconDatabase size={16} />}
                        loading={isCheckingHealth}
                    />
                </div>
            </div>

            {/* Debug Actions Section */}
            <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                </h4>

                <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
                    <SettingsRow
                        title="Clear Local Storage"
                        description="Remove all locally stored preferences"
                        action={
                            <Button
                                variant="outline"
                                onClick={handleClearLocalStorage}
                                size="sm"
                                className="h-8 w-24 text-xs"
                            >
                                <IconTrash size={14} className="mr-1.5" />
                                Clear
                            </Button>
                        }
                    />

                    <SettingsRow
                        title="Reset Onboarding"
                        description="Show the welcome guide again"
                        action={
                            <Button
                                variant="outline"
                                onClick={handleResetOnboarding}
                                size="sm"
                                className="h-8 w-24 text-xs"
                            >
                                <IconRefresh size={14} className="mr-1.5" />
                                Reset
                            </Button>
                        }
                    />

                    <SettingsRow
                        title="Clear Chats Cache"
                        description="Refresh all chat list data"
                        action={
                            <Button
                                variant="outline"
                                onClick={handleClearAllChats}
                                disabled={isClearing}
                                size="sm"
                                className="h-8 w-24 text-xs"
                            >
                                <IconTrash size={14} className="mr-1.5" />
                                Clear
                            </Button>
                        }
                    />

                    <SettingsRow
                        title="Refresh Session"
                        description="Re-fetch auth session"
                        action={
                            <Button
                                variant="outline"
                                onClick={handleRefreshSession}
                                size="sm"
                                className="h-8 w-24 text-xs"
                            >
                                <IconRefresh size={14} className="mr-1.5" />
                                Refresh
                            </Button>
                        }
                    />
                </div>
            </div>

            {/* Environment Info Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <IconCpu size={16} className="text-muted-foreground" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Environment Info
                    </h4>
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
                    <InfoRow label="App Version" value={systemInfo?.version} />
                    <InfoRow label="Electron" value={systemInfo?.electron} />
                    <InfoRow label="Chrome" value={systemInfo?.chrome} />
                    <InfoRow label="Node" value={systemInfo?.node} />
                    <InfoRow label="Platform" value={`${systemInfo?.platform} (${systemInfo?.arch})`} />
                    <InfoRow label="Memory" value={`${systemInfo?.freeMem}GB / ${systemInfo?.totalMem}GB free`} />
                </div>
            </div>
        </div>
    )
}

/** Reusable row component for settings actions */
function SettingsRow({
    title,
    description,
    action
}: {
    title: string
    description: string
    action: React.ReactNode
}) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {action}
        </div>
    )
}

function HealthCard({ label, status, icon, loading }: { label: string, status?: boolean, icon: React.ReactNode, loading?: boolean }) {
    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border",
            status === true ? "border-green-500/30 bg-green-500/5" :
            status === false ? "border-red-500/30 bg-red-500/5" :
            "border-border/50 bg-muted/20"
        )}>
            <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                status === true ? "bg-green-500/10 text-green-500" :
                status === false ? "bg-red-500/10 text-red-500" :
                "bg-muted text-muted-foreground"
            )}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{label}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    {loading ? (
                        <span className="text-[10px] text-muted-foreground">Checking...</span>
                    ) : status === true ? (
                        <>
                            <IconCheck size={10} className="text-green-500" />
                            <span className="text-[10px] text-green-600 font-medium uppercase tracking-tight">Healthy</span>
                        </>
                    ) : status === false ? (
                        <>
                            <IconX size={10} className="text-red-500" />
                            <span className="text-[10px] text-red-600 font-medium uppercase tracking-tight">Down</span>
                        </>
                    ) : (
                        <span className="text-[10px] text-muted-foreground uppercase tracking-tight">Unknown</span>
                    )}
                </div>
            </div>
        </div>
    )
}

function InfoRow({ label, value }: { label: string, value?: string | number }) {
    return (
        <div className="flex justify-between items-center px-4 py-2.5 text-[11px] font-mono">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground">{value ?? 'Loading...'}</span>
        </div>
    )
}
