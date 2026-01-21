import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { trpc } from '@/lib/trpc'
import { toast } from 'sonner'
import { IconEdit, IconLoader2, IconLogout } from '@tabler/icons-react'
import { useSetAtom } from 'jotai'
import { settingsModalOpenAtom } from '@/lib/atoms'
import { Textarea } from '@/components/ui/textarea'
import { AvatarEditorDialog, type AvatarUpdate } from '../components/avatar-editor-dialog'

export function AccountTab() {
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const utils = trpc.useUtils()

    // Get user data
    const { data: user, isLoading: isUserLoading } = trpc.auth.getUser.useQuery()

    // Local state for editing
    const [fullName, setFullName] = useState('')
    const [username, setUsername] = useState('')
    const [pronouns, setPronouns] = useState('')
    const [bio, setBio] = useState('')
    const [website, setWebsite] = useState('')
    const [location, setLocation] = useState('')
    const [timezone, setTimezone] = useState('')
    const [avatarUpdate, setAvatarUpdate] = useState<AvatarUpdate | null>(null)
    const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [initialSnapshot, setInitialSnapshot] = useState<string>('')

    // Initialize state when user data loads
    useEffect(() => {
        if (user) {
            const md = (user.user_metadata as Record<string, unknown> | undefined) ?? {}
            const nextFullName = (md.full_name as string | undefined) || user.email?.split('@')[0] || ''
            const nextUsername = (md.username as string | undefined) || ''
            const nextPronouns = (md.pronouns as string | undefined) || ''
            const nextBio = (md.bio as string | undefined) || ''
            const nextWebsite = (md.website as string | undefined) || ''
            const nextLocation = (md.location as string | undefined) || ''
            const nextTimezone = (md.timezone as string | undefined) || ''

            setFullName(nextFullName)
            setUsername(nextUsername)
            setPronouns(nextPronouns)
            setBio(nextBio)
            setWebsite(nextWebsite)
            setLocation(nextLocation)
            setTimezone(nextTimezone)
            setAvatarUpdate(null)

            setInitialSnapshot(
                JSON.stringify({
                    fullName: nextFullName,
                    username: nextUsername,
                    pronouns: nextPronouns,
                    bio: nextBio,
                    website: nextWebsite,
                    location: nextLocation,
                    timezone: nextTimezone,
                    avatar: null
                })
            )
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

    const updateProfile = trpc.auth.updateProfile.useMutation({
        onSuccess: () => {
            toast.success('Profile updated successfully')
            utils.auth.getUser.invalidate()
            utils.auth.getSession.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update profile')
        }
    })

    const isDirty =
        initialSnapshot !==
        JSON.stringify({
            fullName,
            username,
            pronouns,
            bio,
            website,
            location,
            timezone,
            avatar: avatarUpdate
        })

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await updateProfile.mutateAsync({
                fullName: fullName.trim() || null,
                username: username.trim() ? username.trim().toLowerCase() : null,
                pronouns: pronouns.trim() || null,
                bio: bio.trim() || null,
                website: website.trim() || null,
                location: location.trim() || null,
                timezone: timezone.trim() || null,
                avatar: avatarUpdate ?? undefined
            })
            setAvatarUpdate(null)
        } catch (error) {
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
    const md = (user?.user_metadata as Record<string, unknown> | undefined) ?? {}
    const userAvatar = md.avatar_url as string | undefined
    const avatarPath = typeof md.avatar_path === 'string' ? md.avatar_path : null
    const avatarProviderUrl = typeof md.avatar_provider_url === 'string' ? md.avatar_provider_url : null
    const providerAvatar = avatarProviderUrl ?? (!avatarPath && userAvatar ? userAvatar : null)

    const avatarPreview =
        avatarUpdate?.mode === 'upload'
            ? avatarUpdate.dataUrl
            : avatarUpdate?.mode === 'provider'
                ? avatarUpdate.providerUrl
                : avatarUpdate?.mode === 'remove'
                    ? undefined
                    : userAvatar

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
                            <div className="flex-shrink-0 flex items-center gap-3">
                                <Avatar className="h-12 w-12">
                                    <AvatarImage src={avatarPreview} alt={fullName} />
                                    <AvatarFallback>{userInitials}</AvatarFallback>
                                </Avatar>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setAvatarDialogOpen(true)}
                                >
                                    <IconEdit className="h-3.5 w-3.5 mr-2" />
                                    Edit
                                </Button>
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

                        {/* Username */}
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Username</Label>
                                <p className="text-sm text-muted-foreground">
                                    Lowercase letters, numbers, and underscores
                                </p>
                            </div>
                            <div className="flex-shrink-0 w-80">
                                <Input
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full"
                                    placeholder="your_name"
                                />
                            </div>
                        </div>

                        {/* Pronouns */}
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Pronouns</Label>
                                <p className="text-sm text-muted-foreground">
                                    Optional
                                </p>
                            </div>
                            <div className="flex-shrink-0 w-80">
                                <Input
                                    value={pronouns}
                                    onChange={(e) => setPronouns(e.target.value)}
                                    className="w-full"
                                    placeholder="she/her, he/him, they/them"
                                />
                            </div>
                        </div>

                        {/* Bio */}
                        <div className="flex items-start justify-between gap-6">
                            <div className="flex-1 pt-1">
                                <Label className="text-sm font-medium">Bio</Label>
                                <p className="text-sm text-muted-foreground">
                                    A short description shown in your profile
                                </p>
                            </div>
                            <div className="flex-shrink-0 w-80">
                                <Textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    className="w-full"
                                    placeholder="Tell us about you"
                                />
                                <div className="mt-1 text-xs text-muted-foreground text-right tabular-nums">
                                    {bio.length}/240
                                </div>
                            </div>
                        </div>

                        {/* Website */}
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Website</Label>
                                <p className="text-sm text-muted-foreground">
                                    Public URL (https://...)
                                </p>
                            </div>
                            <div className="flex-shrink-0 w-80">
                                <Input
                                    value={website}
                                    onChange={(e) => setWebsite(e.target.value)}
                                    className="w-full"
                                    placeholder="https://example.com"
                                />
                            </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Location</Label>
                                <p className="text-sm text-muted-foreground">
                                    Optional
                                </p>
                            </div>
                            <div className="flex-shrink-0 w-80">
                                <Input
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="w-full"
                                    placeholder="City, Country"
                                />
                            </div>
                        </div>

                        {/* Timezone */}
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Timezone</Label>
                                <p className="text-sm text-muted-foreground">
                                    Optional (IANA name, e.g. America/Mexico_City)
                                </p>
                            </div>
                            <div className="flex-shrink-0 w-80">
                                <Input
                                    value={timezone}
                                    onChange={(e) => setTimezone(e.target.value)}
                                    className="w-full"
                                    placeholder="America/Mexico_City"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Save Button Footer */}
                    <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-3 border-t">
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (!user) return
                                const md = (user.user_metadata as Record<string, unknown> | undefined) ?? {}
                                setFullName((md.full_name as string | undefined) || user.email?.split('@')[0] || '')
                                setUsername((md.username as string | undefined) || '')
                                setPronouns((md.pronouns as string | undefined) || '')
                                setBio((md.bio as string | undefined) || '')
                                setWebsite((md.website as string | undefined) || '')
                                setLocation((md.location as string | undefined) || '')
                                setTimezone((md.timezone as string | undefined) || '')
                                setAvatarUpdate(null)
                            }}
                            disabled={!isDirty || isSaving}
                            size="sm"
                            className="text-xs"
                        >
                            Reset
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !isDirty}
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

            <AvatarEditorDialog
                open={avatarDialogOpen}
                onOpenChange={setAvatarDialogOpen}
                currentAvatarUrl={userAvatar ?? null}
                providerAvatarUrl={providerAvatar}
                value={avatarUpdate}
                onChange={setAvatarUpdate}
            />
        </div>
    )
}
