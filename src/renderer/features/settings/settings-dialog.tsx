import { useAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { IconX, IconUser, IconPalette, IconKey, IconBug } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { settingsModalOpenAtom, settingsActiveTabAtom, type SettingsTab } from '@/lib/atoms'
import { AccountTab, AppearanceTab, ApiKeysTab, DebugTab } from './tabs'

// Check if we're in development mode
const isDevelopment = import.meta.env.MODE === 'development'

interface TabConfig {
    id: SettingsTab
    label: string
    icon: typeof IconUser
    description: string
}

const ALL_TABS: TabConfig[] = [
    {
        id: 'account',
        label: 'Account',
        icon: IconUser,
        description: 'Manage your account settings'
    },
    {
        id: 'api-keys',
        label: 'API Keys',
        icon: IconKey,
        description: 'Configure AI provider API keys'
    },
    {
        id: 'appearance',
        label: 'Appearance',
        icon: IconPalette,
        description: 'Theme settings'
    },
    // Debug tab - only shown in development
    ...(isDevelopment
        ? [
            {
                id: 'debug' as SettingsTab,
                label: 'Debug',
                icon: IconBug,
                description: 'Test and debug tools'
            }
        ]
        : [])
]

interface TabButtonProps {
    tab: TabConfig
    isActive: boolean
    onClick: () => void
}

function TabButton({ tab, isActive, onClick }: TabButtonProps) {
    const Icon = tab.icon
    return (
        <button
            onClick={onClick}
            className={cn(
                'inline-flex items-center whitespace-nowrap ring-offset-background transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-40 cursor-pointer shadow-none',
                'h-8 w-full justify-start gap-2 text-left px-3 py-1.5 rounded-md text-sm',
                isActive
                    ? 'bg-foreground/10 text-foreground font-medium hover:bg-foreground/15'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground font-medium'
            )}
        >
            <Icon
                size={16}
                className={cn(isActive ? 'opacity-100' : 'opacity-50')}
            />
            {tab.label}
        </button>
    )
}

export function SettingsDialog() {
    const [isOpen, setIsOpen] = useAtom(settingsModalOpenAtom)
    const [activeTab, setActiveTab] = useAtom(settingsActiveTabAtom)
    const [mounted, setMounted] = useState(false)
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

    // Handle keyboard navigation
    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                setIsOpen(false)
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, setIsOpen])

    // Ensure portal target only accessed on client
    useEffect(() => {
        setMounted(true)
        if (typeof document !== 'undefined') {
            setPortalTarget(document.body)
        }
    }, [])

    const renderTabContent = () => {
        switch (activeTab) {
            case 'account':
                return <AccountTab />
            case 'api-keys':
                return <ApiKeysTab />
            case 'appearance':
                return <AppearanceTab />
            case 'debug':
                return isDevelopment ? <DebugTab /> : null
            default:
                return <AccountTab />
        }
    }

    const handleClose = () => {
        setIsOpen(false)
    }

    if (!mounted || !portalTarget) return null

    return createPortal(
        <AnimatePresence mode="wait">
            {isOpen && (
                <>
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-40 bg-black/25"
                        onClick={handleClose}
                        style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
                        data-modal="settings"
                    />

                    {/* Settings Dialog */}
                    <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[45]">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="w-[90vw] h-[80vh] max-w-[900px] p-0 flex flex-col rounded-[20px] bg-background border border-border bg-clip-padding shadow-2xl overflow-hidden"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="settings-dialog-title"
                            data-modal="settings"
                        >
                            <h2 id="settings-dialog-title" className="sr-only">
                                Settings
                            </h2>

                            <div className="flex h-full p-2">
                                {/* Left Sidebar - Tabs */}
                                <div className="w-52 px-1 py-5 space-y-4">
                                    <h2 className="text-lg font-semibold px-2 pb-3 text-foreground">
                                        Settings
                                    </h2>

                                    {/* All Tabs */}
                                    <div className="space-y-1">
                                        {ALL_TABS.map((tab) => (
                                            <TabButton
                                                key={tab.id}
                                                tab={tab}
                                                isActive={activeTab === tab.id}
                                                onClick={() => setActiveTab(tab.id)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Right Content Area */}
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex flex-col relative h-full bg-muted/30 rounded-xl w-full transition-all duration-300 overflow-y-auto">
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={activeTab}
                                                initial={{ opacity: 0, x: 10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -10 }}
                                                transition={{ duration: 0.15 }}
                                                className="h-full"
                                            >
                                                {renderTabContent()}
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>

                            {/* Close Button */}
                            <button
                                type="button"
                                onClick={handleClose}
                                className={cn(
                                    'absolute appearance-none outline-none select-none top-5 right-5',
                                    'rounded-full cursor-pointer flex items-center justify-center',
                                    'ring-offset-background focus:ring-ring',
                                    'bg-secondary h-7 w-7 text-foreground/70 hover:text-foreground',
                                    'focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
                                    'active:scale-95 transition-all duration-200 ease-in-out z-[60]'
                                )}
                            >
                                <IconX size={16} />
                                <span className="sr-only">Close</span>
                            </button>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>,
        portalTarget
    )
}
