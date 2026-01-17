import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { IconTrash, IconRefresh, IconBug } from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import { useSetAtom } from 'jotai'
import { selectedChatIdAtom } from '@/lib/atoms'

export function DebugTab() {
    const [isClearing, setIsClearing] = useState(false)
    const utils = trpc.useUtils()
    const setSelectedChatId = useSetAtom(selectedChatIdAtom)

    const handleClearLocalStorage = () => {
        try {
            localStorage.clear()
            toast.success('Local storage cleared')
        } catch (error) {
            toast.error('Failed to clear local storage')
        }
    }

    const handleResetOnboarding = () => {
        try {
            localStorage.removeItem('onboarding-complete')
            localStorage.removeItem('first-chat-created')
            toast.success('Onboarding reset - refresh to see changes')
        } catch (error) {
            toast.error('Failed to reset onboarding')
        }
    }

    const handleClearAllChats = async () => {
        setIsClearing(true)
        try {
            // This would need a tRPC endpoint to delete all chats
            // For now just invalidate and clear selection
            setSelectedChatId(null)
            await utils.chats.list.invalidate()
            toast.success('Chats cache cleared')
        } catch (error) {
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
        } catch (error) {
            toast.error('Failed to refresh session')
        }
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                <div className="flex items-center gap-2">
                    <IconBug size={18} className="text-orange-500" />
                    <h3 className="text-sm font-semibold text-foreground">Debug Tools</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                    Development tools for testing and debugging
                </p>
            </div>

            {/* Warning Banner */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                <p className="text-xs text-orange-500 font-medium">
                    These tools are only available in development mode. Use with caution!
                </p>
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
                                Remove all locally stored data (preferences, atoms)
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleClearLocalStorage}
                            size="sm"
                            className="text-xs"
                        >
                            <IconTrash size={14} className="mr-2" />
                            Clear
                        </Button>
                    </div>

                    {/* Reset Onboarding */}
                    <div className="flex items-center justify-between gap-4 pt-3 border-t">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                                Reset Onboarding
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Show the first-time user experience again
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleResetOnboarding}
                            size="sm"
                            className="text-xs"
                        >
                            <IconRefresh size={14} className="mr-2" />
                            Reset
                        </Button>
                    </div>

                    {/* Clear Chats Cache */}
                    <div className="flex items-center justify-between gap-4 pt-3 border-t">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                                Clear Chats Cache
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Invalidate React Query cache for chats
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleClearAllChats}
                            disabled={isClearing}
                            size="sm"
                            className="text-xs"
                        >
                            <IconTrash size={14} className="mr-2" />
                            Clear
                        </Button>
                    </div>

                    {/* Refresh Session */}
                    <div className="flex items-center justify-between gap-4 pt-3 border-t">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                                Refresh Session
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Re-fetch auth session from main process
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleRefreshSession}
                            size="sm"
                            className="text-xs"
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
                    <h4 className="text-sm font-medium text-foreground mb-3">Environment Info</h4>
                    <div className="space-y-2 text-xs font-mono">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">NODE_ENV:</span>
                            <span className="text-foreground">{import.meta.env.MODE}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Platform:</span>
                            <span className="text-foreground">{navigator.platform}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">User Agent:</span>
                            <span className="text-foreground truncate max-w-[300px]" title={navigator.userAgent}>
                                {navigator.userAgent.split(' ').slice(0, 3).join(' ')}...
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
