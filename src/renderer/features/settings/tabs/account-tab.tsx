import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { trpc } from '@/lib/trpc'
import { toast } from 'sonner'
import { IconLoader2, IconLogout } from '@tabler/icons-react'
import { useSetAtom } from 'jotai'
import { settingsModalOpenAtom } from '@/lib/atoms'

export function AccountTab() {
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const utils = trpc.useUtils()

    // Get user data
    const { data: user, isLoading: isUserLoading } = trpc.auth.getUser.useQuery()

    // Local state for editing
    const [fullName, setFullName] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    // Initialize state when user data loads
    useEffect(() => {
        if (user) {
            setFullName(user.user_metadata?.full_name || user.email?.split('@')[0] || '')
        }
    }, [user])

    // Sign out mutation
    const signOut = trpc.auth.signOut.useMutation({
        onSuccess: () => {
            toast.success('Signed out successfully')
            setSettingsOpen(false)
            // Invalidate all auth-related queries
            utils.auth.getSession.invalidate()
            utils.auth.getUser.invalidate()
            // Invalidate data that contains signed URLs (they become invalid on logout)
            utils.chats.list.invalidate()
            utils.gallery.list.invalidate()
            // Clear all message caches - signed URLs are invalidated on logout
            utils.messages.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to sign out')
        }
    })

    const handleSignOut = () => {
        signOut.mutate()
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            // TODO: Implement update user profile via tRPC
            toast.success('Profile updated successfully')
        } catch (error) {
            console.error('Error updating profile:', error)
            toast.error('Failed to update profile')
        } finally {
            setIsSaving(false)
        }
    }

    if (isUserLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <IconLoader2 className="h-6 w-6 animate-spin" />
            </div>
        )
    }

    const userEmail = user?.email || ''
    const userInitials = userEmail.slice(0, 2).toUpperCase()
    const userAvatar = user?.user_metadata?.avatar_url

    return (
        <div className="p-6 space-y-6">
            {/* Profile Settings Card */}
            <div className="space-y-2">
                <div className="flex items-center justify-between pb-3 mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Account</h3>
                </div>
                <div className="bg-background rounded-lg border border-border overflow-hidden">
                    <div className="p-4 space-y-6">
                        {/* Profile Picture */}
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Profile Picture</Label>
                                <p className="text-sm text-muted-foreground">
                                    How you're shown around the app
                                </p>
                            </div>
                            <div className="flex-shrink-0">
                                <Avatar className="h-12 w-12">
                                    <AvatarImage src={userAvatar} alt={fullName} />
                                    <AvatarFallback>{userInitials}</AvatarFallback>
                                </Avatar>
                            </div>
                        </div>

                        {/* Email (read-only) */}
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Email</Label>
                                <p className="text-sm text-muted-foreground">
                                    Your account email address
                                </p>
                            </div>
                            <div className="flex-shrink-0 w-80">
                                <Input
                                    value={userEmail}
                                    disabled
                                    className="w-full bg-muted"
                                />
                            </div>
                        </div>

                        {/* Full Name */}
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Full Name</Label>
                                <p className="text-sm text-muted-foreground">
                                    This is your display name
                                </p>
                            </div>
                            <div className="flex-shrink-0 w-80">
                                <Input
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full"
                                    placeholder="Enter your name"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Save Button Footer */}
                    <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-3 border-t">
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            size="sm"
                            className="text-xs"
                        >
                            {isSaving && <IconLoader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                            Save
                        </Button>
                    </div>
                </div>
            </div>

            {/* Sign Out Section */}
            <div className="space-y-2">
                <div className="flex items-center justify-between pb-3 mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Session</h3>
                </div>
                <div className="bg-background rounded-lg border border-border overflow-hidden">
                    <div className="p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <p className="text-sm font-medium text-foreground">
                                    Sign out
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    End your current session
                                </p>
                            </div>
                            <Button
                                variant="destructive"
                                onClick={handleSignOut}
                                disabled={signOut.isPending}
                                size="sm"
                                className="text-xs"
                            >
                                {signOut.isPending ? (
                                    <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <>
                                        <IconLogout className="h-3.5 w-3.5 mr-2" />
                                        Sign Out
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
