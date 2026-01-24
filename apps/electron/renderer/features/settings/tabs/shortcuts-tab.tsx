import { useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ShortcutInput } from '@/components/ui/shortcut-input'
import { toast } from 'sonner'
import {
    IconKeyboard,
    IconRefresh,
    IconCheck,
    IconAlertTriangle
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export function ShortcutsTab() {
    // Fetch all hotkeys
    const { data: hotkeys, isLoading, refetch } = trpc.hotkeys.getHotkeys.useQuery()

    // Mutations
    const setHotkeyMutation = trpc.hotkeys.setHotkey.useMutation({
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Shortcut updated')
                refetch()
            } else {
                toast.error(result.error || 'Failed to update shortcut')
            }
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update shortcut')
        }
    })

    const validateShortcutMutation = trpc.hotkeys.validateShortcut.useMutation()

    const resetHotkeyMutation = trpc.hotkeys.resetHotkey.useMutation({
        onSuccess: () => {
            toast.success('Shortcut reset to default')
            refetch()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to reset shortcut')
        }
    })

    const resetAllMutation = trpc.hotkeys.resetAllHotkeys.useMutation({
        onSuccess: () => {
            toast.success('All shortcuts reset to defaults')
            refetch()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to reset shortcuts')
        }
    })

    // Validate shortcut before saving
    const handleValidate = useCallback(async (shortcut: string, excludeId: string) => {
        const result = await validateShortcutMutation.mutateAsync({ shortcut, excludeId })
        return result
    }, [validateShortcutMutation])

    // Update shortcut
    const handleShortcutChange = useCallback((id: string, shortcut: string) => {
        setHotkeyMutation.mutate({ id, shortcut })
    }, [setHotkeyMutation])

    // Toggle enabled
    const handleToggleEnabled = useCallback((id: string, enabled: boolean) => {
        setHotkeyMutation.mutate({ id, enabled })
    }, [setHotkeyMutation])

    // Reset single hotkey
    const handleReset = useCallback((id: string) => {
        resetHotkeyMutation.mutate({ id })
    }, [resetHotkeyMutation])

    // Reset all hotkeys
    const handleResetAll = useCallback(() => {
        resetAllMutation.mutate()
    }, [resetAllMutation])

    if (isLoading) {
        return (
            <div className="p-6 flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">Loading shortcuts...</div>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
            {/* Header */}
            <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                <div className="flex items-center gap-2">
                    <IconKeyboard size={18} className="text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                    Configure global keyboard shortcuts for quick access
                </p>
            </div>

            {/* Shortcuts List */}
            <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-1">
                    Global Shortcuts
                </h4>

                <div className="bg-background rounded-lg border border-border overflow-hidden">
                    <div className="p-4 space-y-4">
                        {hotkeys?.map((hotkey, index) => (
                            <div
                                key={hotkey.id}
                                className={cn(
                                    'flex items-center justify-between gap-4',
                                    index > 0 && 'pt-4 border-t border-border/50'
                                )}
                            >
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-sm font-medium">{hotkey.name}</Label>
                                        {/* Status badge */}
                                        {hotkey.enabled && (
                                            hotkey.isRegistered ? (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                                                    <IconCheck size={10} />
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                                                    <IconAlertTriangle size={10} />
                                                    {hotkey.error || 'Not registered'}
                                                </span>
                                            )
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                        {hotkey.description}
                                    </p>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    {/* Shortcut Input */}
                                    <ShortcutInput
                                        value={hotkey.shortcut}
                                        onChange={(value) => handleShortcutChange(hotkey.id, value)}
                                        onValidate={(value) => handleValidate(value, hotkey.id)}
                                        disabled={!hotkey.enabled}
                                    />

                                    {/* Enable/Disable Toggle */}
                                    <Switch
                                        checked={hotkey.enabled}
                                        onCheckedChange={(checked) => handleToggleEnabled(hotkey.id, checked)}
                                        className="data-[state=checked]:bg-primary"
                                    />

                                    {/* Reset Button */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleReset(hotkey.id)}
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                        title="Reset to default"
                                    >
                                        <IconRefresh size={14} />
                                    </Button>
                                </div>
                            </div>
                        ))}

                        {/* Empty state */}
                        {(!hotkeys || hotkeys.length === 0) && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No configurable shortcuts available
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Reset All */}
            <div className="flex justify-end pt-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetAll}
                    className="text-xs"
                    disabled={resetAllMutation.isPending}
                >
                    <IconRefresh size={14} className="mr-2" />
                    Reset All to Defaults
                </Button>
            </div>

            {/* Help text */}
            <div className="text-center pt-2">
                <p className="text-[10px] text-muted-foreground">
                    Click on a shortcut to record a new key combination. Press Escape to cancel.
                </p>
            </div>
        </div>
    )
}
