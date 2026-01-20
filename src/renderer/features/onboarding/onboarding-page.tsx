"use client"

import { useState } from "react"
import { useSetAtom, useAtom } from "jotai"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "motion/react"
import { IconRocket, IconCheck, IconKey, IconArrowRight, IconShieldCheck, IconLoader2, IconEye, IconEyeOff, IconPalette, IconMoon, IconSun, IconDeviceDesktop } from "@tabler/icons-react"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { onboardingCompletedAtom, settingsActiveTabAtom, settingsModalOpenAtom, themeAtom, selectedFullThemeIdAtom, fullThemeDataAtom } from "@/lib/atoms"
import { BUILTIN_THEMES } from "@/lib/themes/builtin-themes"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

type OnboardingStep = "welcome" | "theme" | "api-keys" | "ready"

export function OnboardingPage() {
  const [step, setStep] = useState<OnboardingStep>("welcome")
  const setOnboardingCompleted = useSetAtom(onboardingCompletedAtom)
  const [direction, setDirection] = useState(1)

  const handleNext = () => {
    setDirection(1)
    if (step === "welcome") setStep("theme")
    else if (step === "theme") setStep("api-keys")
    else if (step === "api-keys") setStep("ready")
  }

  const handleBack = () => {
    setDirection(-1)
    if (step === "theme") setStep("welcome")
    else if (step === "api-keys") setStep("theme")
  }

  const handleComplete = () => {
    setOnboardingCompleted(true)
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none overflow-hidden relative">
        {/* Draggable title bar area */}
        <div
            className="fixed top-0 left-0 right-0 h-10 z-50"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />

        {/* Steps Content */}
        <div className="w-full max-w-[500px] px-8 relative z-10">
            <AnimatePresence mode="wait" custom={direction}>
                {step === "welcome" && (
                    <WelcomeStep key="welcome" onNext={handleNext} />
                )}
                {step === "theme" && (
                    <ThemeStep key="theme" onNext={handleNext} onBack={handleBack} />
                )}
                {step === "api-keys" && (
                    <ApiKeysStep key="api-keys" onNext={handleNext} onBack={handleBack} />
                )}
                {step === "ready" && (
                    <ReadyStep key="ready" onComplete={handleComplete} />
                )}
            </AnimatePresence>
        </div>

        {/* Background ambient effects */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px]" />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px]" />
        </div>
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="space-y-8 text-center"
        >
            <div className="space-y-6">
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="flex items-center justify-center gap-4 mx-auto w-max"
                >
                    <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-xl backdrop-blur-sm">
                        <Logo className="w-10 h-10 text-primary" />
                    </div>
                </motion.div>
            
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                        Welcome to S-AGI
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-sm mx-auto leading-relaxed">
                        Your intelligent workspace for spreadsheets and documents.
                    </p>
                </div>
            </div>

            <div className="space-y-3 py-4 text-left max-w-sm mx-auto">
                {[
                    "AI-powered spreadsheet data analysis",
                    "Intelligent document writing assistance",
                    "Seamless integration with your workflow"
                ].map((feature, i) => (
                    <motion.div 
                        key={feature}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + (i * 0.1) }}
                        className="flex items-center gap-3 text-sm text-foreground/80 bg-secondary/50 p-3 rounded-xl border border-border/50 backdrop-blur-sm"
                    >
                        <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                            <IconCheck className="w-3.5 h-3.5 text-green-500" />
                        </div>
                        {feature}
                    </motion.div>
                ))}
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="pt-4"
            >
                <Button
                    onClick={onNext}
                    size="lg"
                    className="w-full h-12 text-base font-medium shadow-lg hover:shadow-primary/20 transition-all duration-300 group"
                >
                    <span className="mr-2">Get Started</span>
                    <IconArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
            </motion.div>
        </motion.div>
    )
}

function ThemePreview({ theme }: { theme: any }) {
    const bgColor = theme?.colors?.['editor.background'] || '#1a1a1a'
    const accentColor = theme?.colors?.['focusBorder'] || theme?.colors?.['button.background'] || theme?.colors?.['textLink.foreground'] || '#0034FF'
    const isDark = theme.type === 'dark'

    return (
        <div
            className="w-8 h-6 rounded-sm flex items-center justify-center gap-1 shrink-0 font-bold text-[10px]"
            style={{
                backgroundColor: bgColor,
                boxShadow: 'inset 0 0 0 0.5px rgba(128, 128, 128, 0.2)',
            }}
        >
            <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: accentColor }}
            />
            <span style={{ color: isDark ? '#fff' : '#000', opacity: 0.8 }}>Aa</span>
        </div>
    )
}

function ThemeStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
    const [theme, setJotaiTheme] = useAtom(themeAtom)
    const [selectedThemeId, setSelectedThemeId] = useAtom(selectedFullThemeIdAtom)
    const setFullThemeData = useSetAtom(fullThemeDataAtom)
    const { setTheme } = useTheme()

    const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
        setJotaiTheme(newTheme)
        setTheme(newTheme)
        if (newTheme === 'system') {
            setSelectedThemeId(null)
            setFullThemeData(null)
        } else {
            // Pick default theme for the selected mode if current one doesn't match
            const currentThemeObj = BUILTIN_THEMES.find(t => t.id === selectedThemeId)
            if (!currentThemeObj || currentThemeObj.type !== newTheme) {
                const defaultId = newTheme === 'dark' ? 'sagi-dark' : 'sagi-light'
                handleSpecificThemeChange(defaultId)
            }
        }
    }

    const handleSpecificThemeChange = (themeId: string) => {
        const themeObj = BUILTIN_THEMES.find(t => t.id === themeId)
        if (themeObj) {
            setSelectedThemeId(themeId)
            setFullThemeData(themeObj)
            setJotaiTheme(themeObj.type)
            setTheme(themeObj.type)
        }
    }

    const filteredThemes = theme === 'system' 
        ? [] 
        : BUILTIN_THEMES.filter(t => t.type === theme)

    return (
        <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
        >
            <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <IconPalette className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Choose your style</h2>
                <p className="text-muted-foreground">
                    Select a theme that fits your workspace.
                </p>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                    <ThemeButton 
                        active={theme === 'light'} 
                        onClick={() => handleThemeChange('light')} 
                        icon={<IconSun size={20} />} 
                        label="Light" 
                    />
                    <ThemeButton 
                        active={theme === 'dark'} 
                        onClick={() => handleThemeChange('dark')} 
                        icon={<IconMoon size={20} />} 
                        label="Dark" 
                    />
                    <ThemeButton 
                        active={theme === 'system'} 
                        onClick={() => handleThemeChange('system')} 
                        icon={<IconDeviceDesktop size={20} />} 
                        label="System" 
                    />
                </div>

                <AnimatePresence mode="popLayout">
                    {filteredThemes.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="grid grid-cols-2 gap-2 mt-4 max-h-[200px] overflow-y-auto pr-2 scrollbar-thin"
                        >
                            {filteredThemes.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => handleSpecificThemeChange(t.id)}
                                    className={cn(
                                        "flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group",
                                        selectedThemeId === t.id
                                            ? "border-primary bg-primary/5 text-primary"
                                            : "border-border/40 bg-secondary/20 text-muted-foreground hover:border-border hover:bg-secondary/40"
                                    )}
                                >
                                    <ThemePreview theme={t} />
                                    <span className="text-[11px] font-medium truncate">{t.name}</span>
                                    {selectedThemeId === t.id && <IconCheck size={12} className="ml-auto" />}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="space-y-3 pt-4">
                <Button onClick={onNext} size="lg" className="w-full h-11">
                    Continue
                </Button>
                <Button variant="ghost" onClick={onBack} className="w-full h-11 text-muted-foreground font-normal">
                    Go Back
                </Button>
            </div>
        </motion.div>
    )
}

function ThemeButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-200",
                active 
                    ? "border-primary bg-primary/5 text-primary shadow-sm" 
                    : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-border hover:bg-secondary/50"
            )}
        >
            {icon}
            <span className="text-xs font-medium">{label}</span>
        </button>
    )
}

function ApiKeysStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
    const [openaiKey, setOpenaiKey] = useState("")
    const [showKey, setShowKey] = useState(false)
    const utils = trpc.useUtils()
    
    // Get API key status
    const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery()
    
    // Settings state
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const setActiveTab = useSetAtom(settingsActiveTabAtom)

    const setOpenAIKeyMutation = trpc.settings.setOpenAIKey.useMutation({
        onSuccess: () => {
            toast.success('OpenAI API key saved')
            utils.settings.getApiKeyStatus.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update OpenAI API key')
        }
    })

    const handleSave = async () => {
        if (!openaiKey.trim()) return
        await setOpenAIKeyMutation.mutateAsync({ key: openaiKey.trim() })
        onNext()
    }

    const handleSkip = () => {
        onNext()
    }

    return (
        <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
        >
            <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                    <IconKey className="w-6 h-6 text-blue-500" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Connect AI</h2>
                <p className="text-muted-foreground">
                    To use the AI features, you'll need to provide your OpenAI API key.
                </p>
            </div>

            <div className="space-y-4">
                <div 
                    className="bg-secondary/30 border border-border rounded-xl p-5 space-y-4 shadow-sm"
                >
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label htmlFor="openai-key-input" className="text-sm font-medium cursor-pointer">
                                OpenAI API Key
                            </label>
                            {keyStatus?.hasOpenAI && (
                                <span className="text-xs text-green-500 flex items-center gap-1">
                                    <IconCheck size={12} /> Configured
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                id="openai-key-input"
                                value={openaiKey}
                                onChange={(e) => setOpenaiKey(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                type={showKey ? "text" : "password"}
                                placeholder={keyStatus?.hasOpenAI ? "••••••••••••••••" : "sk-..."}
                                className="pr-10 h-11"
                            />
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setShowKey(!showKey)
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                            </button>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                            <p className="text-xs text-muted-foreground">
                                Your key is stored locally and securely.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveTab('api-keys')
                                    setSettingsOpen(true)
                                }}
                                className="text-xs text-primary hover:underline font-medium"
                            >
                                Advanced settings
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-blue-500/5 text-blue-500 rounded-lg text-xs leading-relaxed border border-blue-500/10">
                        <IconShieldCheck className="w-4 h-4 shrink-0" />
                        We never share your keys with anyone.
                    </div>
                </div>
            </div>

            <div className="space-y-3 pt-4">
                <Button
                    onClick={handleSave}
                    disabled={setOpenAIKeyMutation.isPending || (!openaiKey && !keyStatus?.hasOpenAI)}
                    size="lg"
                    className="w-full h-11"
                >
                    {setOpenAIKeyMutation.isPending ? (
                        <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        "Save & Continue"
                    )}
                </Button>
                
                <div className="flex gap-2">
                    <Button
                        variant="ghost" 
                        onClick={onBack}
                        className="flex-1 h-11 text-muted-foreground font-normal"
                    >
                        Back
                    </Button>
                    <Button
                        variant="ghost" 
                        onClick={handleSkip}
                        className="flex-1 h-11 hover:bg-transparent hover:underline text-muted-foreground font-normal"
                    >
                        {keyStatus?.hasOpenAI ? "Continue" : "Skip for now"}
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}

function ReadyStep({ onComplete }: { onComplete: () => void }) {
    return (
        <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4 }}
            className="space-y-8 text-center"
        >
            <div className="flex justify-center mb-8">
                <div className="w-24 h-24 relative">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
                        className="absolute inset-0 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/20"
                    >
                        <IconCheck className="w-12 h-12 text-white" strokeWidth={3} />
                    </motion.div>
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        transition={{ duration: 1, repeat: Infinity, repeatDelay: 1 }}
                        className="absolute inset-0 bg-green-500 rounded-full z-[-1]"
                    />
                </div>
            </div>

            <div className="space-y-3">
                <h2 className="text-3xl font-bold tracking-tight">You're all set!</h2>
                <p className="text-muted-foreground text-lg max-w-sm mx-auto">
                    S-AGI is ready to help you with your spreadsheets and documents.
                </p>
            </div>

            <div className="pt-8">
                <Button
                    onClick={onComplete}
                    size="lg"
                    className="w-full h-12 text-base font-medium shadow-lg hover:shadow-primary/20 transition-all duration-300"
                >
                    Start Using S-AGI
                    <IconRocket className="ml-2 w-4 h-4" />
                </Button>
            </div>
        </motion.div>
    )
}
