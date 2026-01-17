import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { useAtom } from 'jotai'
import { IconCommand, IconKeyboard, IconCpu } from '@tabler/icons-react'
import { shortcutsDialogOpenAtom } from '@/lib/atoms'
import { cn, isMacOS } from '@/lib/utils'
import { Kbd } from '@/components/ui/kbd'

const EASING_CURVE = [0.55, 0.055, 0.675, 0.19] as const

interface Shortcut {
    label: string
    keys: Array<string>
    altKeys?: Array<string>
}

// Map logical keys to display keys based on OS
const useShortcutKeyDisplay = (keyName: string) => {
    return useMemo(() => {
        const isMac = isMacOS()

        if (keyName === 'cmd') {
            return isMac ? <span className="text-xs">⌘</span> : <span className="text-xs">Ctrl</span>
        }
        if (keyName === 'opt') {
            return isMac ? <span className="text-xs">⌥</span> : <span className="text-xs">Alt</span>
        }
        if (keyName === 'shift') {
            return isMac ? <span className="text-xs">⇧</span> : <span className="text-xs">Shift</span>
        }
        if (keyName === 'ctrl') {
            return isMac ? <span className="text-xs">⌃</span> : <span className="text-xs">Ctrl</span>
        }
        if (keyName === 'delete') {
            return isMac ? <span className="text-xs">⌫</span> : <span className="text-xs">Del</span>
        }

        return keyName
    }, [keyName])
}

function ShortcutKey({ keyName }: { keyName: string }) {
    const displayElement = useShortcutKeyDisplay(keyName)

    return (
        <Kbd>
            {displayElement}
        </Kbd>
    )
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
            <span className="text-sm text-foreground/90">{shortcut.label}</span>
            <div className="flex items-center gap-1">
                {shortcut.keys.map((key, index) => (
                    <ShortcutKey key={index} keyName={key} />
                ))}
                {shortcut.altKeys && (
                    <>
                        <span className="text-[10px] text-muted-foreground mx-1">or</span>
                        {shortcut.altKeys.map((key, index) => (
                            <ShortcutKey key={`alt-${index}`} keyName={key} />
                        ))}
                    </>
                )}
            </div>
        </div>
    )
}

const GENERAL_SHORTCUTS: Shortcut[] = [
    { label: 'Show shortcuts', keys: ['?'] },
    { label: 'Settings', keys: ['cmd', ','] },
    { label: 'Toggle sidebar', keys: ['cmd', '\\'] },
]

const CHAT_SHORTCUTS: Shortcut[] = [
    { label: 'New Chat', keys: ['cmd', 'N'] },
    { label: 'Focus Input', keys: ['/'] },
    { label: 'Stop Generation', keys: ['Esc'] },
]

const ARTIFACT_SHORTCUTS: Shortcut[] = [
    { label: 'Save Artifact', keys: ['cmd', 'S'] },
    { label: 'Close Artifact Panel', keys: ['Esc'] },
]

export function ShortcutsDialog() {
    const [isOpen, setIsOpen] = useAtom(shortcutsDialogOpenAtom)
    const [mounted, setMounted] = useState(false)
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

    // Handle ESC key to close dialog
    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                setIsOpen(false)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, setIsOpen])

    useEffect(() => {
        setMounted(true)
        if (typeof document !== 'undefined') {
            setPortalTarget(document.body)
        }
    }, [])

    if (!mounted || !portalTarget) return null

    return createPortal(
        <AnimatePresence mode="wait" initial={false}>
            {isOpen && (
                <>
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: 1,
                            transition: { duration: 0.18, ease: EASING_CURVE },
                        }}
                        exit={{
                            opacity: 0,
                            pointerEvents: 'none',
                            transition: { duration: 0.15, ease: EASING_CURVE },
                        }}
                        className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[1px]"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Main Dialog */}
                    <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[61] pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 0 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 0 }}
                            transition={{ duration: 0.2, ease: EASING_CURVE }}
                            className="w-[90vw] max-w-[500px] pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-background/95 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl overflow-hidden">
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-primary/10 rounded-lg">
                                            <IconKeyboard className="w-5 h-5 text-primary" />
                                        </div>
                                        <h2 className="text-lg font-semibold tracking-tight">
                                            Keyboard Shortcuts
                                        </h2>
                                    </div>

                                    <div className="space-y-6">
                                        {/* General Section */}
                                        <div>
                                            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3 pl-1">
                                                General
                                            </h3>
                                            <div className="bg-muted/30 rounded-lg px-3 border border-border/50">
                                                {GENERAL_SHORTCUTS.map((shortcut, index) => (
                                                    <ShortcutRow key={index} shortcut={shortcut} />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Chat Section */}
                                        <div>
                                            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3 pl-1">
                                                Chat
                                            </h3>
                                            <div className="bg-muted/30 rounded-lg px-3 border border-border/50">
                                                {CHAT_SHORTCUTS.map((shortcut, index) => (
                                                    <ShortcutRow key={index} shortcut={shortcut} />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Artifacts Section */}
                                        <div>
                                            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3 pl-1">
                                                Artifacts
                                            </h3>
                                            <div className="bg-muted/30 rounded-lg px-3 border border-border/50">
                                                {ARTIFACT_SHORTCUTS.map((shortcut, index) => (
                                                    <ShortcutRow key={index} shortcut={shortcut} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-end">
                                        <div className="text-[10px] text-muted-foreground">
                                            Press <kbd className="font-sans px-1 bg-muted rounded border border-border">Esc</kbd> to close
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>,
        portalTarget
    )
}
