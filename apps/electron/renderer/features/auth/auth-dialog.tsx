import { useState, useEffect } from 'react'
import { useAtom } from 'jotai'
import { toast } from 'sonner'
import { IconLoader2, IconBrandGoogle, IconDeviceDesktop } from '@tabler/icons-react'
import {
    Dialog,
    DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { authDialogOpenAtom } from '@/lib/atoms'
import { trpc } from '@/lib/trpc'
import backgroundImage from '@/assets/background.png'

export function AuthDialog() {
    const [open, setOpen] = useAtom(authDialogOpenAtom)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const [isLocalLoading, setIsLocalLoading] = useState(false)

    const utils = trpc.useUtils()

    // Reset loading states when dialog opens
    // This fixes the bug where isGoogleLoading stays true if user closes OAuth window without completing
    useEffect(() => {
        if (open) {
            setIsGoogleLoading(false)
            setIsLocalLoading(false)
        }
    }, [open])

    // Mutation to set session from OAuth tokens
    const setSession = trpc.auth.setSession.useMutation({
        onSuccess: () => {
            toast.success('Sesión iniciada con Google')
            setOpen(false)
            setIsGoogleLoading(false)
            utils.auth.getSession.invalidate()
            utils.auth.getUser.invalidate()
            utils.auth.getAccounts.invalidate()
            utils.chats.list.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Error al completar inicio de sesión')
            setIsGoogleLoading(false)
        }
    })

    // Listen for OAuth tokens from the OAuth window
    useEffect(() => {
        const cleanup = window.desktopApi?.onOAuthTokens?.((data) => {
            if (data.access_token && data.refresh_token) {
                setSession.mutate({
                    access_token: data.access_token,
                    refresh_token: data.refresh_token
                })
            }
        })

        return () => {
            cleanup?.()
        }
    }, [])

    const signInWithOAuth = trpc.auth.signInWithOAuth.useMutation({
        onSuccess: () => {
            toast.info('Abriendo Google...')
        },
        onError: (error) => {
            toast.error(error.message || 'Error al iniciar sesión con Google')
            setIsGoogleLoading(false)
        }
    })

    const enterLocalMode = trpc.auth.enterLocalMode.useMutation({
        onSuccess: () => {
            toast.success('Modo local activado')
            setOpen(false)
            utils.auth.getSession.invalidate()
            utils.auth.getUser.invalidate()
            utils.auth.getAccounts.invalidate()
            utils.chats.list.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Error al activar modo local')
        },
        onSettled: () => setIsLocalLoading(false)
    })

    const handleGoogleSignIn = () => {
        setIsGoogleLoading(true)
        signInWithOAuth.mutate({ provider: 'google' })
    }

    const handleLocalMode = () => {
        setIsLocalLoading(true)
        enterLocalMode.mutate()
    }

    const isLoading = isGoogleLoading || isLocalLoading

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
                className="sm:max-w-[420px] p-0 overflow-hidden border-0 bg-transparent"
                style={{
                    backgroundImage: `url(${backgroundImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            >
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                {/* Content */}
                <div className="relative z-10 p-6 flex flex-col items-center gap-5">
                    <div className="text-center space-y-1.5 pt-2">
                        <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                            Agregar Cuenta
                        </h2>
                        <p className="text-white/70 text-sm">
                            Elige cómo quieres continuar
                        </p>
                    </div>

                    <div className="w-full space-y-3 pt-2">
                        {/* Google Sign In Button */}
                        <Button
                            type="button"
                            size="lg"
                            className="w-full h-12 text-base font-medium bg-white text-black hover:bg-white/90 shadow-lg"
                            onClick={handleGoogleSignIn}
                            disabled={isLoading}
                        >
                            {isGoogleLoading ? (
                                <IconLoader2 className="mr-3 h-5 w-5 animate-spin" />
                            ) : (
                                <IconBrandGoogle className="mr-3 h-5 w-5" />
                            )}
                            Continuar con Google
                        </Button>

                        {/* Divider */}
                        <div className="flex items-center gap-4">
                            <div className="flex-1 border-t border-white/30" />
                            <span className="text-xs text-white/60">o</span>
                            <div className="flex-1 border-t border-white/30" />
                        </div>

                        {/* Local Mode Button */}
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full h-12 text-base font-medium bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
                            onClick={handleLocalMode}
                            disabled={isLoading}
                        >
                            {isLocalLoading ? (
                                <IconLoader2 className="mr-3 h-5 w-5 animate-spin" />
                            ) : (
                                <IconDeviceDesktop className="mr-3 h-5 w-5" />
                            )}
                            Usar sin cuenta (local)
                        </Button>
                    </div>

                    <p className="text-[11px] text-white/50 text-center">
                        El modo local guarda todo en tu dispositivo
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
