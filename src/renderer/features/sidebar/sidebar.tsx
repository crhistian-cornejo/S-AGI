import { useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconPlus,
    IconMessage,
    IconSettings,
    IconBrandOpenai,
    IconBrain,
    IconDots,
    IconTrash,
    IconPencil,
    IconArchive,
    IconUser,
    IconLogout,
    IconLayoutSidebarLeftCollapse,
    IconSearch
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    selectedChatIdAtom,
    currentProviderAtom,
    settingsModalOpenAtom,
    sidebarOpenAtom,
    selectedArtifactAtom,
    artifactPanelOpenAtom
} from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuLabel
} from '@/components/ui/dropdown-menu'
import {
    Avatar,
    AvatarImage,
    AvatarFallback
} from '@/components/ui/avatar'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useHotkeys } from 'react-hotkeys-hook'

interface Chat {
    id: string
    title: string | null
    updated_at: string
    archived: boolean
}

export function Sidebar() {
    const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom)
    const provider = useAtomValue(currentProviderAtom)
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const [, setSidebarOpen] = useAtom(sidebarOpenAtom)
    const setSelectedArtifact = useSetAtom(selectedArtifactAtom)
    const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom)
    const [searchQuery, setSearchQuery] = useState('')

    // Get API key status from main process
    const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery()

    // Connection status from tRPC
    const isConnected = provider === 'openai' ? keyStatus?.hasOpenAI : keyStatus?.hasAnthropic

    // Fetch session
    const { data: session } = trpc.auth.getSession.useQuery()
    const user = session?.user

    // Fetch chats
    const { data: chats, isLoading, refetch } = trpc.chats.list.useQuery({})

    // Filter chats based on search query
    const filteredChats = chats?.filter(chat =>
        (chat.title || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase())
    )

    const createChat = trpc.chats.create.useMutation({
        onSuccess: (chat: Chat) => {
            console.log('[Sidebar] Chat created:', chat.id)
            setSelectedChatId(chat.id)
            setSelectedArtifact(null)
            setArtifactPanelOpen(false)
            refetch()
        },
        onError: (error) => {
            console.error('[Sidebar] Failed to create chat:', error)
        }
    })

    const deleteChat = trpc.chats.delete.useMutation({
        onSuccess: () => {
            refetch()
        }
    })

    const archiveChat = trpc.chats.archive.useMutation({
        onSuccess: () => {
            refetch()
        }
    })

    const utils = trpc.useUtils()

    const signOut = trpc.auth.signOut.useMutation({
        onSuccess: () => {
            window.desktopApi?.setSession(null)
            utils.auth.getSession.invalidate()
        }
    })

    const handleNewChat = () => {
        createChat.mutate({ title: 'New Chat' })
    }

    const handleChatSelect = (chatId: string) => {
        setSelectedChatId(chatId)
        setSelectedArtifact(null)
        setArtifactPanelOpen(false)
    }



    const handleDeleteChat = (chatId: string) => {
        deleteChat.mutate({ id: chatId })
        if (selectedChatId === chatId) {
            setSelectedChatId(null)
        }
    }

    const handleArchiveChat = (chatId: string) => {
        archiveChat.mutate({ id: chatId })
        if (selectedChatId === chatId) {
            setSelectedChatId(null)
        }
    }



    return (
        <div className="flex flex-col h-full">
            {/* Header / New Chat */}
            <div className="p-3 flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            className="flex-1 justify-start gap-2 h-9 rounded-xl"
                            onClick={handleNewChat}
                            disabled={createChat.isPending}
                        >
                            <IconPlus size={16} />
                            <span>New Chat</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">New Conversation</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-xl shrink-0"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <IconLayoutSidebarLeftCollapse size={18} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Collapse Sidebar</TooltipContent>
                </Tooltip>
            </div>

            {/* Search Bar */}
            <div className="px-3 pb-2">
                <div className="relative group">
                    <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        placeholder="Search conversations..."
                        className="pl-9 h-9 bg-accent/30 border-none rounded-xl text-xs placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/20 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Chat list */}
            <ScrollArea className="flex-1 px-2">
                <div className="space-y-1 pb-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : !filteredChats?.length ? (
                        <div className="text-sm text-muted-foreground text-center py-8 px-4">
                            <IconMessage size={32} className="mx-auto mb-2 opacity-30" />
                            <p>{searchQuery ? 'No results found' : 'No conversations yet'}</p>
                        </div>
                    ) : (
                        filteredChats.map((chat: Chat) => (
                            <div
                                key={chat.id}
                                className={cn(
                                    'group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                                    selectedChatId === chat.id
                                        ? 'bg-accent text-accent-foreground'
                                        : 'text-foreground/80 hover:bg-accent/50'
                                )}
                                onClick={() => handleChatSelect(chat.id)}
                            >
                                <IconMessage size={16} className="shrink-0 opacity-60" />
                                <div className="flex-1 min-w-0">
                                    <p className="truncate font-medium">
                                        {chat.title || 'Untitled'}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {formatRelativeTime(chat.updated_at)}
                                    </p>
                                </div>

                                {/* Actions menu */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background rounded transition-opacity"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <IconDots size={14} />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                        <DropdownMenuItem>
                                            <IconPencil size={14} className="mr-2" />
                                            Rename
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleArchiveChat(chat.id)}>
                                            <IconArchive size={14} className="mr-2" />
                                            Archive
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            variant="destructive"
                                            onClick={() => handleDeleteChat(chat.id)}
                                        >
                                            <IconTrash size={14} className="mr-2" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-border space-y-3">
                {/* AI Provider Status */}
                <button
                    onClick={() => setSettingsOpen(true)}
                    className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                        'hover:bg-accent/50 text-left'
                    )}
                >
                    {provider === 'openai' ? (
                        <IconBrandOpenai size={18} className="shrink-0" />
                    ) : (
                        <IconBrain size={18} className="shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 text-left">
                        <p className="font-medium truncate">
                            {provider === 'openai' ? 'OpenAI' : 'Anthropic'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {isConnected ? 'Connected' : 'Not configured'}
                        </p>
                    </div>
                    <span
                        className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            isConnected ? 'bg-green-500' : 'bg-yellow-500'
                        )}
                    />
                </button>


                <div className="flex items-center justify-center">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                className="h-9 w-full justify-start gap-2 px-2 hover:bg-accent/50"
                            >
                                <Avatar className="h-6 w-6">
                                    <AvatarImage src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture} />
                                    <AvatarFallback className="bg-primary/10">
                                        {user?.email?.charAt(0).toUpperCase() || <IconUser size={14} />}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="flex-1 text-left truncate text-xs font-medium">
                                    {user?.email || 'Not logged in'}
                                </span>
                                <IconDots size={14} className="opacity-40" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="top" className="w-56">
                            <DropdownMenuLabel>My Account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                                <IconSettings size={14} className="mr-2" />
                                Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => signOut.mutate()}
                            >
                                <IconLogout size={14} className="mr-2" />
                                Sign out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    )
}
