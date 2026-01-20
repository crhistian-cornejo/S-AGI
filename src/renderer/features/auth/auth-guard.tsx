import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { IconLoader2, IconBrandGoogle } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { authDialogOpenAtom, authDialogModeAtom } from '@/lib/atoms'
import { trpc } from '@/lib/trpc'
import backgroundImage from '@/assets/background.png'

interface AuthGuardProps {
    children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
    const setAuthDialogOpen = useSetAtom(authDialogOpenAtom)
    const setAuthDialogMode = useSetAtom(authDialogModeAtom)
    const utils = trpc.useUtils()

    const { data: session, isLoading, error } = trpc.auth.getSession.useQuery(undefined, {
        retry: false,
        refetchOnWindowFocus: true
    })

    // NOTE: Session synchronization is handled by the main process via encrypted storage.
    // The renderer should NOT try to sync its localStorage session to main, as this causes
    // race conditions with refresh tokens ("refresh_token_already_used" error).
    // The main process is the single source of truth for authentication.

    const signInWithOAuth = trpc.auth.signInWithOAuth.useMutation({
        onSuccess: () => {
            toast.info('Opening Google sign in...')
        },
        onError: (err) => {
            toast.error(err.message || 'Failed to start Google sign in')
        }
    })

    const handleGoogleSignIn = () => {
        signInWithOAuth.mutate({ provider: 'google' })
    }

    // If loading, show spinner
    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    // If not authenticated, show sign in prompt
    if (!session || error) {
        return (
            <div
                className="relative flex h-full w-full flex-col items-center justify-center gap-6"
                style={{
                    backgroundImage: `url(${backgroundImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                }}
            >
                {/* Dark overlay for better text legibility */}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center gap-6">
                    <div className="text-center space-y-2">
                        <h2 className="text-3xl font-bold text-white drop-shadow-lg">Welcome to S-AGI</h2>
                        <p className="text-white/80 max-w-sm">
                            Office agent for spreadsheet and word
                        </p>
                    </div>

                    {/* Google Sign In - Primary */}
                    <Button
                        size="lg"
                        onClick={handleGoogleSignIn}
                        disabled={signInWithOAuth.isPending}
                        className="min-w-[280px] bg-white text-black hover:bg-white/90 shadow-lg"
                    >
                        {signInWithOAuth.isPending ? (
                            <IconLoader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                            <IconBrandGoogle className="mr-2 h-5 w-5" />
                        )}
                        Continue with Google
                    </Button>

                    {/* Divider */}
                    <div className="flex items-center gap-4 w-[280px]">
                        <div className="flex-1 border-t border-white/30" />
                        <span className="text-xs text-white/60">or</span>
                        <div className="flex-1 border-t border-white/30" />
                    </div>

                    {/* Email sign in option */}
                    <Button
                        variant="outline"
                        onClick={() => {
                            setAuthDialogMode('signin')
                            setAuthDialogOpen(true)
                        }}
                        className="min-w-[280px] bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
                    >
                        Sign in with Email
                    </Button>

                    <p className="text-xs text-white/70 mt-4">
                        Don&apos;t have an account?{' '}
                        <button
                            type="button"
                            onClick={() => {
                                setAuthDialogMode('signup')
                                setAuthDialogOpen(true)
                            }}
                            className="text-white hover:underline font-medium"
                        >
                            Create one
                        </button>
                    </p>
                </div>
            </div>
        )
    }

    // Authenticated - render children
    return <>{children}</>
}
