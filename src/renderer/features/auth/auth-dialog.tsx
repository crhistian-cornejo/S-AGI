import { useState, useEffect } from 'react'
import { useAtom } from 'jotai'
import { toast } from 'sonner'
import { IconLoader2, IconBrandGoogle } from '@tabler/icons-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authDialogOpenAtom, authDialogModeAtom } from '@/lib/atoms'
import { trpc } from '@/lib/trpc'

export function AuthDialog() {
    const [open, setOpen] = useAtom(authDialogOpenAtom)
    const [mode, setMode] = useAtom(authDialogModeAtom)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)

    const utils = trpc.useUtils()

    // Listen for OAuth callback
    useEffect(() => {
        const cleanup = window.desktopApi?.onAuthCallback?.((data) => {
            if (data.code) {
                handleOAuthCallback(data.code)
            }
        })

        return () => {
            cleanup?.()
        }
    }, [])

    const handleOAuthCallback = async (code: string) => {
        setIsGoogleLoading(true)
        try {
            await exchangeCode.mutateAsync({ code })
        } catch (error) {
            // Error handled in mutation
        }
    }

    const signIn = trpc.auth.signIn.useMutation({
        onSuccess: async () => {
            // Session is already set in main process via tRPC - main process is the source of truth.
            // Do NOT set session in renderer's local Supabase client to avoid refresh token conflicts.
            toast.success('Signed in successfully!')
            setOpen(false)
            resetForm()
            utils.auth.getSession.invalidate()
            utils.auth.getUser.invalidate()
            utils.chats.list.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to sign in')
        },
        onSettled: () => setIsLoading(false)
    })

    const signUp = trpc.auth.signUp.useMutation({
        onSuccess: (data) => {
            if (data.session) {
                toast.success('Account created and signed in!')
                setOpen(false)
                resetForm()
                utils.auth.getSession.invalidate()
                utils.auth.getUser.invalidate()
            } else {
                toast.success('Check your email to confirm your account!')
                setMode('signin')
            }
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create account')
        },
        onSettled: () => setIsLoading(false)
    })

    const signInWithOAuth = trpc.auth.signInWithOAuth.useMutation({
        onSuccess: () => {
            toast.info('Opening Google sign in...')
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to start Google sign in')
            setIsGoogleLoading(false)
        }
    })

    const exchangeCode = trpc.auth.exchangeCodeForSession.useMutation({
        onSuccess: async () => {
            // Session is already set in main process via tRPC - main process is the source of truth.
            // Do NOT set session in renderer's local Supabase client to avoid refresh token conflicts.
            toast.success('Signed in with Google!')
            setOpen(false)
            resetForm()
            utils.auth.getSession.invalidate()
            utils.auth.getUser.invalidate()
            utils.chats.list.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to complete sign in')
        },
        onSettled: () => setIsGoogleLoading(false)
    })

    const resetForm = () => {
        setEmail('')
        setPassword('')
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) {
            toast.error('Please fill in all fields')
            return
        }
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters')
            return
        }

        setIsLoading(true)
        if (mode === 'signin') {
            signIn.mutate({ email, password })
        } else {
            signUp.mutate({ email, password })
        }
    }

    const handleGoogleSignIn = () => {
        setIsGoogleLoading(true)
        signInWithOAuth.mutate({ provider: 'google' })
    }

    const toggleMode = () => {
        setMode(mode === 'signin' ? 'signup' : 'signin')
        resetForm()
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'signin' ? 'Sign In' : 'Create Account'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'signin'
                            ? 'Sign in to access your chats and spreadsheets'
                            : 'Create an account to get started'
                        }
                    </DialogDescription>
                </DialogHeader>

                {/* Google Sign In Button */}
                <div className="mt-4">
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={handleGoogleSignIn}
                        disabled={isGoogleLoading || isLoading}
                    >
                        {isGoogleLoading ? (
                            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <IconBrandGoogle className="mr-2 h-4 w-4" />
                        )}
                        Continue with Google
                    </Button>
                </div>

                {/* Divider */}
                <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                            Or continue with email
                        </span>
                    </div>
                </div>

                {/* Email/Password Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isLoading || isGoogleLoading}
                            autoComplete="email"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading || isGoogleLoading}
                            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                        {isLoading ? (
                            <>
                                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                                {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                            </>
                        ) : (
                            mode === 'signin' ? 'Sign In with Email' : 'Create Account'
                        )}
                    </Button>
                </form>

                <div className="mt-4 text-center text-sm text-muted-foreground">
                    {mode === 'signin' ? (
                        <>
                            Don&apos;t have an account?{' '}
                            <button
                                type="button"
                                onClick={toggleMode}
                                className="text-primary hover:underline"
                                disabled={isLoading || isGoogleLoading}
                            >
                                Sign up
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{' '}
                            <button
                                type="button"
                                onClick={toggleMode}
                                className="text-primary hover:underline"
                                disabled={isLoading || isGoogleLoading}
                            >
                                Sign in
                            </button>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
