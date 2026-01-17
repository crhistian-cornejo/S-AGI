import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconPlus,
    IconMessage,
    IconSettings,
    IconMoon,
    IconSun,
    IconBrandOpenai,
    IconBrain,
    IconDots,
    IconTrash,
    IconPencil,
    IconArchive
} from '@tabler/icons-react'
import { useTheme } from 'next-themes'
import {
    selectedChatIdAtom,
    currentProviderAtom,
    settingsModalOpenAtom
} from '@/lib/atoms'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn, formatRelativeTime } from '@/lib/utils'

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
    const { resolvedTheme, setTheme } = useTheme()

    // Get API key status from main process
    const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery()

    // Connection status from tRPC
    const isConnected = provider === 'openai' ? keyStatus?.hasOpenAI : keyStatus?.hasAnthropic

    // Fetch chats
    const { data: chats, isLoading, refetch } = trpc.chats.list.useQuery({})
    
    const createChat = trpc.chats.create.useMutation({
        onSuccess: (chat: Chat) => {
            console.log('[Sidebar] Chat created:', chat.id)
            setSelectedChatId(chat.id)
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

    const handleNewChat = () => {
        createChat.mutate({ title: 'New Chat' })
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

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-3">
                <Button
                    className="w-full justify-start gap-2"
                    onClick={handleNewChat}
                    disabled={createChat.isPending}
                >
                    <IconPlus size={16} />
                    New Chat
                </Button>
            </div>

            {/* Chat list */}
            <ScrollArea className="flex-1 px-2">
                <div className="space-y-1 pb-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : !chats?.length ? (
                        <div className="text-sm text-muted-foreground text-center py-8 px-4">
                            <IconMessage size={32} className="mx-auto mb-2 opacity-30" />
                            <p>No chats yet</p>
                            <p className="text-xs mt-1">Create a new chat to get started</p>
                        </div>
                    ) : (
                        chats.map((chat: Chat) => (
                            <div
                                key={chat.id}
                                className={cn(
                                    'group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                                    selectedChatId === chat.id
                                        ? 'bg-accent text-accent-foreground'
                                        : 'text-foreground/80 hover:bg-accent/50'
                                )}
                                onClick={() => setSelectedChatId(chat.id)}
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
                                            className="text-destructive focus:text-destructive"
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
                    <div className="flex-1 min-w-0">
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

                {/* Actions */}
                <div className="flex items-center justify-between">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={toggleTheme}
                            >
                                {resolvedTheme === 'dark' ? (
                                    <IconSun size={16} />
                                ) : (
                                    <IconMoon size={16} />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Toggle theme</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setSettingsOpen(true)}
                            >
                                <IconSettings size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Settings</TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </div>
    )
}
