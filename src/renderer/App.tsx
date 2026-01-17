import { useEffect } from 'react'
import { Provider as JotaiProvider } from 'jotai'
import { ThemeProvider, useTheme } from 'next-themes'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TRPCProvider } from './lib/trpc'
import { TooltipProvider } from './components/ui/tooltip'
import { MainLayout } from './features/layout/main-layout'
import { SettingsDialog } from './features/settings/settings-dialog'
import { AuthDialog, AuthGuard, OAuthCallbackHandler } from './features/auth'
import { appStore } from './lib/stores/jotai-store'

// Create React Query client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            refetchOnWindowFocus: false
        }
    }
})

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
            <QueryClientProvider client={queryClient}>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    <TRPCProvider>
                        <TooltipProvider delayDuration={100}>
                            <OAuthCallbackHandler />
                            <div
                                data-sagi-app
                                className="h-screen w-screen bg-background text-foreground overflow-hidden"
                            >
                                <AuthGuard>
                                    <MainLayout />
                                </AuthGuard>
                            </div>
                            <AuthDialog />
                            <SettingsDialog />
                            <ThemedToaster />
                        </TooltipProvider>
                    </TRPCProvider>
                </ThemeProvider>
            </QueryClientProvider>
        </JotaiProvider>
    )
}
