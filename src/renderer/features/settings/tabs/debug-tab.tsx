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
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
            <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                <div className="flex items-center gap-2">
                    <IconBug size={18} className="text-orange-500" />
                    <h3 className="text-sm font-semibold text-foreground">Debug Tools</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                    Development tools for testing and debugging
                </p>
            </div>

            {/* Health Status */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        System Health
                    </h4>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-[10px] gap-1.5"
                        onClick={handleCheckHealth}
                        disabled={isCheckingHealth}
                    >
                        {isCheckingHealth ? <IconLoader2 size={12} className="animate-spin" /> : <IconActivity size={12} />}
                        Run Check
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

            {/* Debug Actions */}
            <div className="bg-background rounded-lg border border-border overflow-hidden">
                <div className="p-4 space-y-4">
                    {/* Clear Local Storage */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                                Clear Local Storage
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Remove all locally stored preferences
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleClearLocalStorage}
                            size="sm"
                            className="text-xs h-8"
                        >
                            <IconTrash size={14} className="mr-2" />
                            Clear
                        </Button>
                    </div>

                    {/* Reset Onboarding */}
                    <div className="flex items-center justify-between gap-4 pt-3 border-t border-border/50">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                                Reset Onboarding
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Show the welcome guide again
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleResetOnboarding}
                            size="sm"
                            className="text-xs h-8"
                        >
                            <IconRefresh size={14} className="mr-2" />
                            Reset
                        </Button>
                    </div>

                    {/* Clear Chats Cache */}
                    <div className="flex items-center justify-between gap-4 pt-3 border-t border-border/50">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                                Clear Chats Cache
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Refresh all chat list data
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleClearAllChats}
                            disabled={isClearing}
                            size="sm"
                            className="text-xs h-8"
                        >
                            <IconTrash size={14} className="mr-2" />
                            Clear
                        </Button>
                    </div>

                    {/* Refresh Session */}
                    <div className="flex items-center justify-between gap-4 pt-3 border-t border-border/50">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                                Refresh Session
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Re-fetch auth session
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleRefreshSession}
                            size="sm"
                            className="text-xs h-8"
                        >
                            <IconRefresh size={14} className="mr-2" />
                            Refresh
                        </Button>
                    </div>
                </div>
            </div>

            {/* Environment Info */}
            <div className="bg-background rounded-lg border border-border overflow-hidden">
                <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <IconCpu size={16} className="text-muted-foreground" />
                        <h4 className="text-sm font-medium text-foreground">Environment Info</h4>
                    </div>
                    <div className="space-y-2 text-[11px] font-mono">
                        <InfoRow label="App Version" value={systemInfo?.version} />
                        <InfoRow label="Electron" value={systemInfo?.electron} />
                        <InfoRow label="Chrome" value={systemInfo?.chrome} />
                        <InfoRow label="Node" value={systemInfo?.node} />
                        <InfoRow label="Platform" value={`${systemInfo?.platform} (${systemInfo?.arch})`} />
                        <InfoRow label="Memory" value={`${systemInfo?.freeMem}GB / ${systemInfo?.totalMem}GB free`} />
                    </div>
                </div>
            </div>
        </div>
    )
}

function HealthCard({ label, status, icon, loading }: { label: string, status?: boolean, icon: React.ReactNode, loading?: boolean }) {
    return (
        <div className="bg-background rounded-xl border border-border p-3 flex items-center gap-3">
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
        <div className="flex justify-between border-b border-border/30 pb-1.5 last:border-0 last:pb-0">
            <span className="text-muted-foreground">{label}:</span>
            <span className="text-foreground">{value ?? 'Loading...'}</span>
        </div>
    )
}
