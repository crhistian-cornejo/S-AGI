import { useAtom } from 'jotai'
import { IconSettings, IconLogout, IconMoon, IconSun, IconDeviceDesktop } from '@tabler/icons-react'
import { useTheme } from 'next-themes'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { settingsModalOpenAtom } from '@/lib/atoms'
import { trpc } from '@/lib/trpc'
import { toast } from 'sonner'

export function SettingsDialog() {
    const [open, setOpen] = useAtom(settingsModalOpenAtom)
    const { theme, setTheme } = useTheme()
    const utils = trpc.useUtils()

    const signOut = trpc.auth.signOut.useMutation({
        onSuccess: () => {
            toast.success('Signed out successfully')
            setOpen(false)
            utils.auth.getSession.invalidate()
            utils.auth.getUser.invalidate()
            utils.chats.list.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to sign out')
        }
    })

    const handleSignOut = () => {
        signOut.mutate()
    }

    const themes = [
        { value: 'light', label: 'Light', icon: IconSun },
        { value: 'dark', label: 'Dark', icon: IconMoon },
        { value: 'system', label: 'System', icon: IconDeviceDesktop }
    ]

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <IconSettings size={20} />
                        Settings
                    </DialogTitle>
                    <DialogDescription>
                        Customize your S-AGI experience
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Theme Selection */}
                    <div className="space-y-3">
                        <Label>Theme</Label>
                        <div className="flex gap-2">
                            {themes.map(({ value, label, icon: Icon }) => (
                                <Button
                                    key={value}
                                    variant={theme === value ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setTheme(value)}
                                    className="flex-1"
                                >
                                    <Icon size={16} className="mr-2" />
                                    {label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Sign Out */}
                    <div className="pt-4 border-t">
                        <Button
                            variant="destructive"
                            onClick={handleSignOut}
                            disabled={signOut.isPending}
                            className="w-full"
                        >
                            <IconLogout size={16} className="mr-2" />
                            {signOut.isPending ? 'Signing out...' : 'Sign Out'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
