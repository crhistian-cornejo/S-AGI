import { useState, useEffect } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import {
    IconSettings,
    IconBrandOpenai,
    IconBrain,
    IconCheck,
    IconX,
    IconEye,
    IconEyeOff,
    IconLoader2,
    IconUser,
    IconPalette,
    IconCode,
    IconRobot,
    IconShieldLock,
    IconSearch,
    IconChevronRight,
    IconExternalLink,
    IconSun,
    IconMoon,
    IconDeviceDesktop,
    IconFileDescription,
    IconKey,
    IconLock
} from '@tabler/icons-react'
import {
    settingsModalOpenAtom,
    currentProviderAtom,
    aiConnectionStatusAtom,
    hasOpenaiKeyAtom,
    hasAnthropicKeyAtom,
    themeAtom
} from '@/lib/atoms'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { createPortal } from 'react-dom'

type SettingsTab = 'account' | 'appearance' | 'models' | 'editor' | 'security'

interface TabButtonProps {
    id: SettingsTab
    label: string
    icon: any
    isActive: boolean
    onClick: () => void
}

function TabButton({ id, label, icon: Icon, isActive, onClick }: TabButtonProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex items-center whitespace-nowrap ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 cursor-pointer shadow-none h-8 w-full justify-start gap-2 text-left px-3 py-1.5 rounded-md text-sm font-medium",
                isActive
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
        >
            <Icon
                size={16}
                className={cn(isActive ? "opacity-100" : "opacity-50")}
            />
            {label}
        </button>
    )
}

export function SettingsDialog() {
    const [isOpen, setIsOpen] = useAtom(settingsModalOpenAtom)
    const [activeTab, setActiveTab] = useState<SettingsTab>('models')
    const [provider, setProvider] = useAtom(currentProviderAtom)
    const [theme, setTheme] = useAtom(themeAtom)
    const setConnectionStatus = useSetAtom(aiConnectionStatusAtom)
    const setHasOpenaiKey = useSetAtom(hasOpenaiKeyAtom)
    const setHasAnthropicKey = useSetAtom(hasAnthropicKeyAtom)

    const [tempOpenaiKey, setTempOpenaiKey] = useState('')
    const [tempAnthropicKey, setTempAnthropicKey] = useState('')
    const [showOpenaiKey, setShowOpenaiKey] = useState(false)
    const [showAnthropicKey, setShowAnthropicKey] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Query for current status from main process
    const { data: keyStatus, refetch: refetchStatus } = trpc.settings.getApiKeyStatus.useQuery()

    // Mutations for saving keys
    const saveOpenAIMutation = trpc.settings.setOpenAIKey.useMutation({
        onSuccess: () => {
            refetchStatus()
            setTempOpenaiKey('')
        }
    })
    const saveAnthropicMutation = trpc.settings.setAnthropicKey.useMutation({
        onSuccess: () => {
            refetchStatus()
            setTempAnthropicKey('')
        }
    })

    // Sync status to atoms
    useEffect(() => {
        if (keyStatus) {
            setHasOpenaiKey(keyStatus.hasOpenAI)
            setHasAnthropicKey(keyStatus.hasAnthropic)
            if ((provider === 'openai' && keyStatus.hasOpenAI) ||
                (provider === 'anthropic' && keyStatus.hasAnthropic)) {
                setConnectionStatus('connected')
            } else {
                setConnectionStatus('disconnected')
            }
        }
    }, [keyStatus, provider, setHasOpenaiKey, setHasAnthropicKey, setConnectionStatus])

    const validateOpenAIKey = (key: string) => {
        return key.startsWith('sk-') && key.length > 20
    }

    const validateAnthropicKey = (key: string) => {
        return key.startsWith('sk-ant-') && key.length > 20
    }

    const handleSaveOpenAI = () => {
        if (validateOpenAIKey(tempOpenaiKey)) {
            saveOpenAIMutation.mutate({ key: tempOpenaiKey })
        }
    }

    const handleSaveAnthropic = () => {
        if (validateAnthropicKey(tempAnthropicKey)) {
            saveAnthropicMutation.mutate({ key: tempAnthropicKey })
        }
    }

    const handleClearOpenAI = () => {
        saveOpenAIMutation.mutate({ key: null })
        setTempOpenaiKey('')
    }

    const handleClearAnthropic = () => {
        saveAnthropicMutation.mutate({ key: null })
        setTempAnthropicKey('')
    }

    const isLoading = saveOpenAIMutation.isPending || saveAnthropicMutation.isPending

    const tabs: { id: SettingsTab; label: string; icon: any }[] = [
        { id: 'account', label: 'Account', icon: IconUser },
        { id: 'appearance', label: 'Appearance', icon: IconPalette },
        { id: 'models', label: 'AI Models', icon: IconRobot },
        { id: 'editor', label: 'Editor', icon: IconCode },
        { id: 'security', label: 'Security', icon: IconShieldLock },
    ]

    const renderTabContent = () => {
        switch (activeTab) {
            case 'models':
                return (
                    <motion.div
                        key="models"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className="p-6 space-y-8"
                    >
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">AI Models</h3>
                            <p className="text-sm text-muted-foreground">Configure your AI providers and models.</p>
                        </div>

                        <div className="space-y-6">
                            <section className="space-y-4">
                                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Preferred Provider</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { id: 'openai' as const, name: 'OpenAI', icon: IconBrandOpenai, desc: 'GPT-4o, o1', has: keyStatus?.hasOpenAI },
                                        { id: 'anthropic' as const, name: 'Anthropic', icon: IconBrain, desc: 'Claude 3.5', has: keyStatus?.hasAnthropic }
                                    ].map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => setProvider(p.id)}
                                            className={cn(
                                                "p-4 rounded-xl border text-left transition-all relative group overflow-hidden",
                                                provider === p.id
                                                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                                    : "border-border bg-muted/20 hover:border-primary/30"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "p-2 rounded-lg transition-colors",
                                                    provider === p.id ? "bg-primary text-primary-foreground" : "bg-background border border-border group-hover:border-primary/50"
                                                )}>
                                                    <p.icon size={18} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-sm">{p.name}</p>
                                                    <p className="text-[11px] text-muted-foreground truncate">{p.desc}</p>
                                                </div>
                                            </div>
                                            {p.has && (
                                                <div className="absolute top-2 right-2">
                                                    <IconCheck size={14} className="text-green-500" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <Separator className="opacity-50" />

                            <section className="space-y-4">
                                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">API Keys</h4>
                                <div className="space-y-4">
                                    {/* OpenAI Field */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-semibold">OpenAI API Key</Label>
                                            <a href="https://platform.openai.com/api-keys" target="_blank" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                                                Get key <IconExternalLink size={10} />
                                            </a>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <IconKey size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                <Input
                                                    type={showOpenaiKey ? 'text' : 'password'}
                                                    placeholder={keyStatus?.hasOpenAI ? "••••••••••••••••" : "sk-..."}
                                                    value={tempOpenaiKey}
                                                    onChange={(e) => setTempOpenaiKey(e.target.value)}
                                                    className="pl-9 h-9 bg-muted/30 border-border focus-visible:ring-primary/20"
                                                />
                                                <button
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                                >
                                                    {showOpenaiKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                                                </button>
                                            </div>
                                            {keyStatus?.hasOpenAI ? (
                                                <Button variant="outline" size="sm" onClick={handleClearOpenAI} className="h-9 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                                                    Clear
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    onClick={handleSaveOpenAI}
                                                    disabled={!validateOpenAIKey(tempOpenaiKey) || isLoading}
                                                    className="h-9 px-4"
                                                >
                                                    {saveOpenAIMutation.isPending ? <IconLoader2 size={14} className="animate-spin" /> : 'Save'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Anthropic Field */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-semibold">Anthropic API Key</Label>
                                            <a href="https://console.anthropic.com/settings/keys" target="_blank" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                                                Get key <IconExternalLink size={10} />
                                            </a>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <IconKey size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                <Input
                                                    type={showAnthropicKey ? 'text' : 'password'}
                                                    placeholder={keyStatus?.hasAnthropic ? "••••••••••••••••" : "sk-ant-..."}
                                                    value={tempAnthropicKey}
                                                    onChange={(e) => setTempAnthropicKey(e.target.value)}
                                                    className="pl-9 h-9 bg-muted/30 border-border focus-visible:ring-primary/20"
                                                />
                                                <button
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                                                >
                                                    {showAnthropicKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                                                </button>
                                            </div>
                                            {keyStatus?.hasAnthropic ? (
                                                <Button variant="outline" size="sm" onClick={handleClearAnthropic} className="h-9 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                                                    Clear
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    onClick={handleSaveAnthropic}
                                                    disabled={!validateAnthropicKey(tempAnthropicKey) || isLoading}
                                                    className="h-9 px-4"
                                                >
                                                    {saveAnthropicMutation.isPending ? <IconLoader2 size={14} className="animate-spin" /> : 'Save'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                                <IconLock size={16} className="text-primary mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-primary">Encypted Storage</p>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Your keys are encrypted using OS-level security (DPAPI/Keychain) and never leave your machine.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )
            case 'appearance':
                return (
                    <motion.div
                        key="appearance"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className="p-6 space-y-8"
                    >
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
                            <p className="text-sm text-muted-foreground">Customize the visual style of the application.</p>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-background rounded-xl border border-border overflow-hidden">
                                <div className="flex items-center justify-between p-4 border-b border-border/50">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium">Interface Theme</Label>
                                        <p className="text-xs text-muted-foreground">Select your preferred color mode.</p>
                                    </div>
                                    <div className="flex bg-muted p-1 rounded-lg border border-border">
                                        {[
                                            { id: 'light' as const, label: 'Light', icon: IconSun },
                                            { id: 'dark' as const, label: 'Dark', icon: IconMoon },
                                            { id: 'system' as const, label: 'System', icon: IconDeviceDesktop }
                                        ].map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => setTheme(t.id)}
                                                className={cn(
                                                    "p-2 rounded-md transition-all flex items-center gap-2 px-3",
                                                    theme === t.id
                                                        ? "bg-background shadow-sm text-primary"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                <t.icon size={14} />
                                                <span className="text-xs font-medium">{t.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium">Glass Effects</Label>
                                        <p className="text-xs text-muted-foreground">Enable dynamic background blur and transparency.</p>
                                    </div>
                                    <Switch checked={true} />
                                </div>
                            </div>

                            <section className="space-y-4">
                                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Localization</h4>
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold">Language</Label>
                                    <div className="p-3 rounded-xl bg-muted/30 border border-border text-xs font-medium flex justify-between items-center opacity-60">
                                        <span>English (US)</span>
                                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Default</span>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </motion.div>
                )
            case 'account':
                return (
                    <motion.div
                        key="account"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className="p-6 space-y-8"
                    >
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">Account</h3>
                            <p className="text-sm text-muted-foreground">Manage your identity and sync settings.</p>
                        </div>

                        <div className="flex flex-col items-center justify-center p-12 bg-muted/10 border-2 border-dashed border-border rounded-2xl gap-4">
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <IconUser size={32} />
                            </div>
                            <div className="text-center space-y-1">
                                <h4 className="font-bold text-base">Sign in to S-AGI</h4>
                                <p className="text-xs text-muted-foreground max-w-xs">
                                    Synchronize your chats, settings and API configurations across devices.
                                </p>
                            </div>
                            <Button className="font-bold px-8">Sign In / Sign Up</Button>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Resources</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <button className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/10 hover:bg-muted/30 transition-colors text-xs font-medium">
                                    Documentation
                                    <IconFileDescription size={14} className="text-muted-foreground" />
                                </button>
                                <button className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/10 hover:bg-muted/30 transition-colors text-xs font-medium">
                                    Privacy Policy
                                    <IconShieldLock size={14} className="text-muted-foreground" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )
            case 'editor':
                return (
                    <motion.div
                        key="editor"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className="p-6 space-y-8"
                    >
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">Editor</h3>
                            <p className="text-sm text-muted-foreground">Configure the spreadsheet editor behavior.</p>
                        </div>

                        <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="p-4 bg-muted rounded-full text-muted-foreground">
                                <IconCode size={32} />
                            </div>
                            <div className="space-y-1">
                                <p className="font-semibold">Coming Soon</p>
                                <p className="text-xs text-muted-foreground max-w-[240px]">
                                    We're working on advanced spreadsheet settings, formulas, and UI customizations.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )
            case 'security':
                return (
                    <motion.div
                        key="security"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className="p-6 space-y-8"
                    >
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">Security</h3>
                            <p className="text-sm text-muted-foreground">Privacy and encryption settings.</p>
                        </div>

                        <div className="space-y-6">
                            <div className="p-5 rounded-2xl border border-border bg-muted/20 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-green-500/10 text-green-600">
                                        <IconShieldLock size={20} />
                                    </div>
                                    <p className="font-bold text-sm">System-Level Privacy</p>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    S-AGI uses the industry-standard DPAPI (Windows) and Keychain (macOS) to ensure your local secrets are tied to your system login. Even if someone copies your database files, they won't be able to decrypt your keys without your OS password.
                                </p>
                            </div>

                            <Separator className="opacity-50" />

                            <div className="flex items-center justify-between px-2">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">App Lock</Label>
                                    <p className="text-xs text-muted-foreground">Require system password to open the app.</p>
                                </div>
                                <Switch checked={false} disabled />
                            </div>
                        </div>
                    </motion.div>
                )
            default:
                return null
        }
    }

    if (!mounted) return null

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-[860px] h-[600px] p-0 gap-0 overflow-hidden border-none bg-background shadow-2xl rounded-[20px]">
                <div className="flex h-full relative">
                    {/* Left Sidebar */}
                    <div className="w-56 p-2 flex flex-col border-r border-border/50 bg-muted/10">
                        <div className="px-3 py-5">
                            <h2 className="text-lg font-semibold tracking-tight text-foreground">Settings</h2>
                        </div>

                        <div className="space-y-1 mt-1">
                            {tabs.map((tab) => (
                                <TabButton
                                    key={tab.id}
                                    id={tab.id}
                                    label={tab.label}
                                    icon={tab.icon}
                                    isActive={activeTab === tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                />
                            ))}
                        </div>

                        <div className="mt-auto p-2">
                            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-foreground/5 border border-foreground/5">
                                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-bold">
                                    S
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold leading-none mb-1">Standard Plan</p>
                                    <p className="text-[10px] text-muted-foreground leading-none">Free account</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Content */}
                    <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
                        <ScrollArea className="flex-1">
                            <AnimatePresence mode="wait">
                                {renderTabContent()}
                            </AnimatePresence>
                        </ScrollArea>
                    </div>

                    {/* Close Button */}
                    <button
                        onClick={() => setIsOpen(false)}
                        className="absolute right-4 top-4 p-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-all hover:scale-110 active:scale-95 z-10"
                    >
                        <IconX size={16} />
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
