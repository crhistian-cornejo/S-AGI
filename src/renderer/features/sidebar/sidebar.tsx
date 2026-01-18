import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
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
    IconSearch,
    IconPin,
    IconPinFilled,
    IconArchiveOff,
    IconChevronDown,
    IconChevronRight
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CursorTooltip } from '@/components/ui/cursor-tooltip'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

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
import { cn, formatRelativeTime, isMacOS } from '@/lib/utils'

const formatFullDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

const getShortId = (id: string): string => {
    return id.slice(0, 8) + '...'
}

// ============================================================================
// FadeScrollArea - Scroll area with fade effect at top/bottom when content overflows
// ============================================================================
interface FadeScrollAreaProps {
    children: React.ReactNode
    className?: string
}

function FadeScrollArea({ children, className }: FadeScrollAreaProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [canScrollUp, setCanScrollUp] = useState(false)
    const [canScrollDown, setCanScrollDown] = useState(false)

    const checkScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        
        const { scrollTop, scrollHeight, clientHeight } = el
        setCanScrollUp(scrollTop > 0)
        setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1)
    }, [])

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        checkScroll()
        el.addEventListener('scroll', checkScroll, { passive: true })
        
        // Also check on resize
        const resizeObserver = new ResizeObserver(checkScroll)
        resizeObserver.observe(el)

        return () => {
            el.removeEventListener('scroll', checkScroll)
            resizeObserver.disconnect()
        }
    }, [checkScroll])

    return (
        <div className={cn("relative flex-1 overflow-hidden", className)}>
            {/* Top fade */}
            <div 
                className={cn(
                    "absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
                    "bg-gradient-to-b from-background to-transparent",
                    canScrollUp ? "opacity-100" : "opacity-0"
                )}
            />
            
            {/* Scrollable content */}
            <div 
                ref={scrollRef}
                className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
            >
                {children}
            </div>
            
            {/* Bottom fade */}
            <div 
                className={cn(
                    "absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
                    "bg-gradient-to-t from-background to-transparent",
                    canScrollDown ? "opacity-100" : "opacity-0"
                )}
            />
        </div>
    )
}

interface Chat {
    id: string
    title: string | null
    updated_at: string
    archived: boolean
    pinned?: boolean
}

// ============================================================================
// ChatItem - Individual chat item with context menu
// ============================================================================
interface ChatItemProps {
    chat: Chat
    isSelected: boolean
    isEditing: boolean
    editingTitle: string
    onSelect: () => void
    onStartRename: () => void
    onSaveRename: (title: string) => void
    onCancelRename: () => void
    onSetEditingTitle: (title: string) => void
    onArchive: () => void
    onDelete: () => void
    onTogglePin: () => void
    onRestore?: () => void
    isArchived?: boolean
}

function ChatItem({
    chat,
    isSelected,
    isEditing,
    editingTitle,
    onSelect,
    onStartRename,
    onSaveRename,
    onCancelRename,
    onSetEditingTitle,
    onArchive,
    onDelete,
    onTogglePin,
    onRestore,
    isArchived
}: ChatItemProps) {
    return (
        // biome-ignore lint/a11y/useSemanticElements: <explanation>
<div
            className={cn(
                'group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground/80 hover:bg-accent/50'
            )}
            onClick={() => !isEditing && onSelect()}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !isEditing) {
                    onSelect()
                }
            }}
            role="button"
            tabIndex={0}
        >
            <IconMessage size={16} className="shrink-0 opacity-60" />
            <div className="flex-1 min-w-0">
                {isEditing ? (
                    <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => onSetEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') {
                                onSaveRename(editingTitle)
                            } else if (e.key === 'Escape') {
                                onCancelRename()
                            }
                        }}
                        onBlur={() => onSaveRename(editingTitle)}
                        className="w-full bg-background border border-border rounded px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <CursorTooltip
                        content={
                            <div className="space-y-2">
                                <div className="space-y-0.5">
                                    <p className="font-medium text-foreground text-sm leading-tight">{chat.title || 'Untitled'}</p>
                                    <p className="text-[11px] font-mono text-muted-foreground/60">ID: {getShortId(chat.id)}</p>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    {chat.pinned && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                            Pinned
                                        </span>
                                    )}
                                    {isArchived && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                            Archived
                                        </span>
                                    )}
                                    {isSelected && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                                            Active
                                        </span>
                                    )}
                                </div>

                                <div className="pt-1 border-t border-border/50 space-y-1">
                                    <p className="text-xs text-muted-foreground">
                                        Updated {formatRelativeTime(chat.updated_at)}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/70">
                                        {formatFullDate(chat.updated_at)}
                                    </p>
                                </div>
                            </div>
                        }
                        containerClassName="w-full"
                    >
                        <p className="truncate font-medium">
                            {chat.title || 'Untitled'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                            {formatRelativeTime(chat.updated_at)}
                        </p>
                    </CursorTooltip>
                )}
            </div>

            {/* Pin/Archived icons + Actions menu - hidden when editing */}
            {!isEditing && (
                <div className="flex items-center gap-1 shrink-0">
                    {chat.pinned && (
                        <IconPinFilled size={14} className="text-primary" />
                    )}
                    {isArchived && (
                        <IconArchive size={14} className="text-muted-foreground/60" />
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent/50 rounded-md transition-all active:scale-95"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <IconDots size={14} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            {/* Pin/Unpin - only for non-archived */}
                            {!isArchived && (
                                <DropdownMenuItem onClick={onTogglePin}>
                                    {chat.pinned ? (
                                        <>
                                            <IconPin size={14} className="mr-2" />
                                            Unpin
                                        </>
                                    ) : (
                                        <>
                                            <IconPinFilled size={14} className="mr-2" />
                                            Pin to top
                                        </>
                                    )}
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={onStartRename}>
                                <IconPencil size={14} className="mr-2" />
                                Rename
                            </DropdownMenuItem>
                            {isArchived ? (
                                <DropdownMenuItem onClick={onRestore}>
                                    <IconArchiveOff size={14} className="mr-2" />
                                    Restore
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem onClick={onArchive}>
                                    <IconArchive size={14} className="mr-2" />
                                    Archive
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={onDelete}
                            >
                                <IconTrash size={14} className="mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
        </div>
    )
}

// ============================================================================
// Section Header - Collapsible section header
// ============================================================================
interface SectionHeaderProps {
    title: string
    count: number
    isOpen: boolean
    onToggle: () => void
    icon?: React.ReactNode
}

function SectionHeader({ title, count, isOpen, onToggle, icon }: SectionHeaderProps) {
    return (
        <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={onToggle}
        >
            {isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            {icon}
            <span>{title}</span>
            <span className="ml-auto text-[10px] bg-muted/50 px-1.5 py-0.5 rounded-full">
                {count}
            </span>
        </button>
    )
}

// ============================================================================
// Main Sidebar Component
// ============================================================================
export function Sidebar() {
    const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom)
    const provider = useAtomValue(currentProviderAtom)
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const [, setSidebarOpen] = useAtom(sidebarOpenAtom)
    const setSelectedArtifact = useSetAtom(selectedArtifactAtom)
    const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom)
    const [searchQuery, setSearchQuery] = useState('')
    const [editingChatId, setEditingChatId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    
    // Section collapse state
    const [showPinned, setShowPinned] = useState(true)
    const [showRecent, setShowRecent] = useState(true)
    const [showArchived, setShowArchived] = useState(false)

    // Get API key status from main process
    const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery()
    const isConnected = provider === 'openai' ? keyStatus?.hasOpenAI : keyStatus?.hasAnthropic

    // Fetch session
    const { data: session } = trpc.auth.getSession.useQuery()
    const user = session?.user

    // Fetch chats (includes pinned, ordered correctly)
    const { data: chats, isLoading, refetch } = trpc.chats.list.useQuery({})
    
    // Fetch archived chats
    const { data: archivedChats, refetch: refetchArchived } = trpc.chats.listArchived.useQuery()

    // Separate pinned and unpinned chats
    const { pinnedChats, recentChats } = useMemo(() => {
        const pinned: Chat[] = []
        const recent: Chat[] = []
        
        for (const chat of (chats || [])) {
            if (chat.pinned) {
                pinned.push(chat)
            } else {
                recent.push(chat)
            }
        }
        
        return { pinnedChats: pinned, recentChats: recent }
    }, [chats])

    // Filter chats based on search query
    const filterChats = useCallback((chatList: Chat[]) => 
        chatList.filter(chat =>
            (chat.title || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase())
        ),
        [searchQuery]
    )

    const filteredPinned = useMemo(() => filterChats(pinnedChats), [filterChats, pinnedChats])
    const filteredRecent = useMemo(() => filterChats(recentChats), [filterChats, recentChats])
    const filteredArchived = useMemo(() => filterChats(archivedChats || []), [filterChats, archivedChats])

    const utils = trpc.useUtils()

    const createChat = trpc.chats.create.useMutation({
        onSuccess: (chat: Chat) => {
            utils.chats.get.invalidate({ id: chat.id })
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
            refetchArchived()
            // Show undo toast
            toast.success('Chat deleted', {
                action: {
                    label: 'Undo',
                    onClick: () => {
                        // We can't truly undo a delete, but we can show a message
                        toast.info('Chat permanently deleted')
                    }
                }
            })
        }
    })

    const archiveChat = trpc.chats.archive.useMutation({
        onSuccess: (_data, variables) => {
            refetch()
            refetchArchived()
            if (selectedChatId === variables.id) {
                setSelectedChatId(null)
            }
            // Show undo toast
            toast.success('Chat archived', {
                action: {
                    label: 'Undo',
                    onClick: () => restoreChat.mutate({ id: variables.id })
                }
            })
        }
    })

    const restoreChat = trpc.chats.restore.useMutation({
        onSuccess: () => {
            refetch()
            refetchArchived()
            toast.success('Chat restored')
        }
    })

    const togglePin = trpc.chats.togglePin.useMutation({
        onSuccess: (data) => {
            refetch()
            toast.success(data.pinned ? 'Chat pinned' : 'Chat unpinned')
        }
    })

    const updateChat = trpc.chats.update.useMutation({
        onSuccess: () => {
            setEditingChatId(null)
            setEditingTitle('')
            refetch()
        }
    })

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
    }

    const handleRestoreChat = (chatId: string) => {
        restoreChat.mutate({ id: chatId })
    }

    const handleTogglePin = (chatId: string) => {
        togglePin.mutate({ id: chatId })
    }

    const handleStartRename = (chatId: string, currentTitle: string) => {
        setEditingChatId(chatId)
        setEditingTitle(currentTitle || 'Untitled')
    }

    const handleSaveRename = (title: string) => {
        if (editingChatId && title.trim()) {
            updateChat.mutate({ id: editingChatId, title: title.trim() })
        } else {
            setEditingChatId(null)
            setEditingTitle('')
        }
    }

    const handleCancelRename = () => {
        setEditingChatId(null)
        setEditingTitle('')
    }

    const renderChatList = (chatList: Chat[], isArchived = false) => {
        if (chatList.length === 0) {
            return (
                <div className="text-xs text-muted-foreground text-center py-4 px-4">
                    {searchQuery ? 'No results found' : isArchived ? 'No archived chats' : 'No conversations'}
                </div>
            )
        }

        return chatList.map((chat) => (
            <ChatItem
                key={chat.id}
                chat={chat}
                isSelected={selectedChatId === chat.id}
                isEditing={editingChatId === chat.id}
                editingTitle={editingTitle}
                onSelect={() => handleChatSelect(chat.id)}
                onStartRename={() => handleStartRename(chat.id, chat.title || '')}
                onSaveRename={handleSaveRename}
                onCancelRename={handleCancelRename}
                onSetEditingTitle={setEditingTitle}
                onArchive={() => handleArchiveChat(chat.id)}
                onDelete={() => handleDeleteChat(chat.id)}
                onTogglePin={() => handleTogglePin(chat.id)}
                onRestore={() => handleRestoreChat(chat.id)}
                isArchived={isArchived}
            />
        ))
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header / New Chat */}
            <div className={cn(
                "flex items-center gap-2 px-3",
                isMacOS() ? "h-11 pt-1 pl-20" : "h-10 pt-0",
                "drag-region"
            )}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            className="flex-1 justify-start gap-2 h-8 rounded-xl no-drag"
                            onClick={handleNewChat}
                            disabled={createChat.isPending}
                        >
                            <IconPlus size={16} />
                            <span className="truncate">New Chat</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="flex items-center gap-2 font-semibold">
                        New Conversation
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'} N
                        </kbd>
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl shrink-0 no-drag"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <IconLayoutSidebarLeftCollapse size={18} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="flex items-center gap-2 font-semibold">
                        Collapse Sidebar
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'} \
                        </kbd>
                    </TooltipContent>
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

            {/* Chat list with fade scroll effect */}
            <FadeScrollArea className="flex-1 px-2">
                <div className="pb-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : (
                        <>
                            {/* Pinned Section */}
                            {filteredPinned.length > 0 && (
                                <div className="mb-2">
                                    <SectionHeader
                                        title="Pinned"
                                        count={filteredPinned.length}
                                        isOpen={showPinned}
                                        onToggle={() => setShowPinned(!showPinned)}
                                        icon={<IconPinFilled size={12} />}
                                    />
                                    {showPinned && (
                                        <div className="space-y-1">
                                            {renderChatList(filteredPinned)}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Recent Section */}
                            <div className="mb-2">
                                <SectionHeader
                                    title="Recent"
                                    count={filteredRecent.length}
                                    isOpen={showRecent}
                                    onToggle={() => setShowRecent(!showRecent)}
                                    icon={<IconMessage size={12} />}
                                />
                                {showRecent && (
                                    <div className="space-y-1">
                                        {filteredRecent.length === 0 && filteredPinned.length === 0 ? (
                                            <div className="text-sm text-muted-foreground text-center py-8 px-4">
                                                <IconMessage size={32} className="mx-auto mb-2 opacity-30" />
                                                <p>{searchQuery ? 'No results found' : 'No conversations yet'}</p>
                                            </div>
                                        ) : (
                                            renderChatList(filteredRecent)
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Archived Section */}
                            {(archivedChats?.length ?? 0) > 0 && (
                                <div className="mb-2 border-t border-border/50 pt-2 mt-4">
                                    <SectionHeader
                                        title="Archived"
                                        count={filteredArchived.length}
                                        isOpen={showArchived}
                                        onToggle={() => setShowArchived(!showArchived)}
                                        icon={<IconArchive size={12} />}
                                    />
                                    {showArchived && (
                                        <div className="space-y-1">
                                            {renderChatList(filteredArchived, true)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </FadeScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-border space-y-3">
                {/* AI Provider Status */}
                <button
                    type="button"
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
                            <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="justify-between">
                                <span className="flex items-center">
                                    <IconSettings size={14} className="mr-2" />
                                    Settings
                                </span>
                                <kbd className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                                    {navigator.platform.toLowerCase().includes('mac') ? '⌘,' : 'Ctrl+,'}
                                </kbd>
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
