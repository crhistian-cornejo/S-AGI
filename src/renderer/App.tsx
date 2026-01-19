import { useEffect } from 'react'
import { Provider as JotaiProvider, useSetAtom } from 'jotai'
import { ThemeProvider, useTheme } from 'next-themes'
import { Toaster } from 'sonner'
import { TRPCProvider, trpc } from './lib/trpc'
import { TooltipProvider } from './components/ui/tooltip'
import { MainLayout } from './features/layout/main-layout'
import { SettingsDialog } from './features/settings/settings-dialog'
import { AuthDialog, AuthGuard, OAuthCallbackHandler } from './features/auth'
import { OnboardingGuard } from './features/onboarding'
import { VSCodeThemeProvider } from './lib/themes'
import { appStore } from './lib/stores/jotai-store'
import {
    hasChatGPTPlusAtom,
    chatGPTPlusStatusAtom,
    hasGeminiAdvancedAtom,
    geminiAdvancedStatusAtom,
} from './lib/atoms'

/**
 * Themed Toaster component
 */
function ThemedToaster() {
    const { resolvedTheme } = useTheme()

    return (
        <Toaster
            position="bottom-right"
            theme={resolvedTheme as 'light' | 'dark' | 'system'}
            closeButton
        />
    )
}

/**
 * Synchronize OAuth connection statuses to Jotai atoms on app load
 */
function ConnectionStatusSync() {
    const setHasChatGPTPlus = useSetAtom(hasChatGPTPlusAtom)
    const setChatGPTPlusStatus = useSetAtom(chatGPTPlusStatusAtom)
    const setHasGeminiAdvanced = useSetAtom(hasGeminiAdvancedAtom)
    const setGeminiAdvancedStatus = useSetAtom(geminiAdvancedStatusAtom)

    // Query connection statuses
    const { data: chatGPTStatus } = trpc.auth.getChatGPTStatus.useQuery()
    const { data: geminiStatus } = trpc.auth.getGeminiStatus.useQuery()

    // Sync ChatGPT Plus status
    useEffect(() => {
        if (chatGPTStatus) {
            setHasChatGPTPlus(chatGPTStatus.isConnected)
            setChatGPTPlusStatus({
                isConnected: chatGPTStatus.isConnected,
                email: chatGPTStatus.email ?? undefined,
                accountId: chatGPTStatus.accountId ?? undefined,
                connectedAt: chatGPTStatus.connectedAt ?? undefined
            })
        }
    }, [chatGPTStatus, setHasChatGPTPlus, setChatGPTPlusStatus])

    // Sync Gemini Advanced status
    useEffect(() => {
        if (geminiStatus) {
            setHasGeminiAdvanced(geminiStatus.isConnected)
            setGeminiAdvancedStatus({
                isConnected: geminiStatus.isConnected,
                email: geminiStatus.email ?? undefined,
                connectedAt: geminiStatus.connectedAt ?? undefined
            })
        }
    }, [geminiStatus, setHasGeminiAdvanced, setGeminiAdvancedStatus])

    return null
}

/**
 * Main App component with all providers
 */
export function App() {
    // Listen for auth callback from main process
    useEffect(() => {
        const cleanup = window.desktopApi?.onAuthCallback?.((_data) => {
            console.log('[Auth] Received callback with code')
            // Handle auth callback - will be processed by auth store
        })

        return () => {
            cleanup?.()
        }
    }, [])

    return (
        <JotaiProvider store={appStore}>
            <VSCodeThemeProvider>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    <TRPCProvider>
                        <ConnectionStatusSync />
                        <TooltipProvider delayDuration={100}>
                            <OAuthCallbackHandler />
                            <div
                                data-sagi-app
                                className="h-screen w-screen bg-background text-foreground overflow-hidden"
                            >
                                <AuthGuard>
                                    <OnboardingGuard>
                                        <MainLayout />
                                    </OnboardingGuard>
                                </AuthGuard>
                            </div>
                            <AuthDialog />
                            <SettingsDialog />
                            <ThemedToaster />
                        </TooltipProvider>
                    </TRPCProvider>
                </ThemeProvider>
            </VSCodeThemeProvider>
        </JotaiProvider>
    )
}
