import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ZaiIcon } from '@/components/icons/model-icons'
// NOTE: Gemini disabled - import { ZaiIcon, GeminiIcon } from '@/components/icons/model-icons'
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
    IconChevronRight,
    IconPhoto,
    IconCode,
    IconTable,
    IconFileText
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    selectedChatIdAtom,
    currentProviderAtom,
    settingsModalOpenAtom,
    sidebarOpenAtom,
    selectedArtifactAtom,
    artifactPanelOpenAtom,
    undoStackAtom,
    activeTabAtom,
    type UndoItem
} from '@/lib/atoms'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CursorTooltip } from '@/components/ui/cursor-tooltip'
import { Input } from '@/components/ui/input'
import { Logo } from '@/components/ui/logo'
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
import { Separator } from '@/components/ui/separator'
import { cn, formatRelativeTime, isMacOS, isWindows } from '@/lib/utils'


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
        <div className={cn("relative flex-1 overflow-hidden w-full", className)}>
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
                className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent w-full"
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
    created_at: string
    archived: boolean
    pinned?: boolean
    meta?: { 
        spreadsheets: number; 
        documents: number; 
        hasCode: boolean; 
        hasImages: boolean;
        messageCount: number;
    }
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
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus()
        }
    }, [isEditing])
    // Parse dates with timezone awareness
    const createdDate = new Date(chat.created_at)
    const now = new Date()
    
    // Calculate days difference using local dates (not UTC)
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const createdLocal = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate())
    const daysSinceCreated = Math.floor((todayLocal.getTime() - createdLocal.getTime()) / (1000 * 60 * 60 * 24))

    // Format date for display (uses local timezone)
    const formatDate = (date: Date) => {
        return date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
    }

    const tooltipContent = (
        <div className="space-y-3 min-w-[200px]">
            {/* Title and Message Count Indicator */}
            <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-foreground text-sm leading-tight line-clamp-2">
                    {chat.title || 'Untitled'}
                </p>
                {chat.meta?.messageCount !== undefined && chat.meta.messageCount > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5" title={`${chat.meta.messageCount} user prompts`}>
                        <div className="flex items-end gap-[2px] h-3.5">
                            {[0, 1, 2, 3, 4].map((i) => {
                                // Notion-style bars: vertical version of the horizontal ToC lines
                                const heights = [4, 9, 6, 12, 8];
                                const messageCount = chat.meta?.messageCount ?? 0;
                                let active = false;
                                if (messageCount > 0 && i === 0) active = true;
                                if (messageCount > 2 && i === 1) active = true;
                                if (messageCount > 8 && i === 2) active = true;
                                if (messageCount > 20 && i === 3) active = true;
                                if (messageCount > 45 && i === 4) active = true;
                                
                                return (
                                    <div 
                                        key={i} 
                                        className={cn(
                                            "w-[3px] rounded-full transition-all duration-500",
                                            active ? "bg-primary" : "bg-muted-foreground/15"
                                        )}
                                        style={{ height: `${heights[i]}px` }}
                                    />
                                );
                            })}
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground/50 tabular-nums">
                            {chat.meta.messageCount}
                        </span>
                    </div>
                )}
            </div>

            {/* Status Badges */}
            <div className="flex flex-wrap gap-1.5">
                {chat.pinned && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-medium flex items-center gap-1">
                        <IconPinFilled size={10} />
                        Pinned
                    </span>
                )}
                {isArchived && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-500 font-medium flex items-center gap-1">
                        <IconArchive size={10} />
                        Archived
                    </span>
                )}
                {isSelected && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 font-medium">
                        Currently Open
                    </span>
                )}
            </div>

            {/* Contains: code, artifacts, images — estilo neutro, sin mucho color */}
            {chat.meta && (chat.meta.hasCode || chat.meta.spreadsheets > 0 || chat.meta.documents > 0 || chat.meta.hasImages) && (
                <div className="flex flex-wrap gap-1.5">
                    {chat.meta.hasCode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/40 inline-flex items-center gap-1">
                            <IconCode size={10} />
                            Code
                        </span>
                    )}
                    {chat.meta.spreadsheets > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/40 inline-flex items-center gap-1">
                            <IconTable size={10} />
                            {chat.meta.spreadsheets === 1 ? 'Spreadsheet' : `${chat.meta.spreadsheets} spreadsheets`}
                        </span>
                    )}
                    {chat.meta.documents > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/40 inline-flex items-center gap-1">
                            <IconFileText size={10} />
                            {chat.meta.documents === 1 ? 'Document' : `${chat.meta.documents} documents`}
                        </span>
                    )}
                    {chat.meta.hasImages && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/40 inline-flex items-center gap-1">
                            <IconPhoto size={10} />
                            Images
                        </span>
                    )}
                </div>
            )}

            {/* Timestamps */}
            <div className="pt-2 border-t border-border/40 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-foreground/80 font-medium">
                        {formatDate(createdDate)}
                    </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Last updated</span>
                    <span className="text-foreground/80 font-medium">
                        {formatRelativeTime(chat.updated_at)}
                    </span>
                </div>
                {daysSinceCreated > 0 && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Age</span>
                        <span className="text-foreground/80 font-medium">
                            {daysSinceCreated === 1 ? '1 day' : `${daysSinceCreated} days`}
                        </span>
                    </div>
                )}
            </div>

            {/* Chat ID (subtle) */}
            <div className="pt-2 border-t border-border/40">
                <p className="text-[10px] font-mono text-muted-foreground/50 select-all">
                    {chat.id.slice(0, 8)}...{chat.id.slice(-4)}
                </p>
            </div>
        </div>
    )

    const titleContent = (
        <CursorTooltip
            content={tooltipContent}
            containerClassName="w-full"
        >
            <p className="truncate font-medium text-sm leading-snug">
                {chat.title || 'Untitled'}
            </p>
        </CursorTooltip>
    )

    const actionMenu = (
        <div className="flex items-center gap-0.5">
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "p-1 rounded-md transition-colors",
                            chat.pinned 
                                ? "text-primary opacity-100" 
                                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 opacity-0 group-hover:opacity-100"
                        )}
                        onClick={(e) => {
                            e.stopPropagation()
                            onTogglePin()
                        }}
                    >
                        {chat.pinned ? <IconPinFilled size={14} /> : <IconPin size={14} />}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top">{chat.pinned ? 'Unpin' : 'Pin'}</TooltipContent>
            </Tooltip>

            {!isArchived && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                                e.stopPropagation()
                                onArchive()
                            }}
                        >
                            <IconArchive size={14} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Archive</TooltipContent>
                </Tooltip>
            )}

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 rounded-md transition-colors active:scale-95 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <IconDots size={14} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
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
    )

    if (isEditing) {
        return (
            <div
                className={cn(
                    'group relative flex flex-col gap-1.5 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-left',
                    isSelected
                        ? 'bg-accent/80 ring-1 ring-primary/20 shadow-sm'
                        : 'text-foreground/80 hover:bg-accent/50'
                )}
            >
                {/* First row: editing indicator */}
                <div className="flex items-center gap-1.5">
                    <IconMessage size={12} className={cn("shrink-0", isSelected ? "text-primary" : "text-muted-foreground/40")} />
                    <span className="text-[10px] text-muted-foreground font-medium truncate leading-snug flex-1 min-w-0">
                        Editing...
                    </span>
                </div>

                {/* Second row: title input */}
                <div className="w-full min-w-0">
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
                        className="w-full bg-background border border-border rounded px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Chat title"
                        name="chat-title"
                        autoComplete="off"
                        ref={inputRef}
                    />
                </div>
            </div>
        )
    }

    return (
        <button
            type="button"
            className={cn(
                'group relative flex flex-col gap-1.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer select-none w-full text-left',
                isSelected
                    ? 'bg-accent/80 text-accent-foreground ring-1 ring-primary/20 shadow-sm'
                    : 'text-foreground/80 hover:bg-accent/50 hover:shadow-sm'
            )}
            onClick={onSelect}
        >
            {/* First row: timestamp (always visible), actions (on hover) */}
            <div className="flex items-center gap-1.5 w-full">
                <IconMessage
                    size={12}
                    className={cn(
                        "shrink-0 transition-colors",
                        isSelected ? "text-primary" : "text-muted-foreground/40"
                    )}
                />
                <span className="text-[10px] text-muted-foreground font-medium truncate leading-snug flex-1 min-w-0">
                    {formatRelativeTime(chat.updated_at)}
                </span>
                {/* Action buttons - aligned to right */}
                <div className={cn(
                    "flex items-center gap-0.5 shrink-0 transition-opacity ml-auto",
                    "opacity-0 group-hover:opacity-100",
                    // Always visible if pinned
                    chat.pinned && "opacity-100"
                )}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    "p-1 rounded-md transition-colors flex items-center justify-center",
                                    chat.pinned
                                        ? "text-primary opacity-100"
                                        : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
                                )}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onTogglePin()
                                }}
                            >
                                {chat.pinned ? <IconPinFilled size={14} /> : <IconPin size={14} />}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end">{chat.pinned ? 'Unpin' : 'Pin'}</TooltipContent>
                    </Tooltip>

                    {!isArchived && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 rounded-md transition-colors flex items-center justify-center"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onArchive()
                                    }}
                                >
                                    <IconArchive size={14} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="end">Archive</TooltipContent>
                        </Tooltip>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 rounded-md transition-colors active:scale-95 flex items-center justify-center"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <IconDots size={14} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
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
            </div>

            {/* Second row: title with full width */}
            <div className="w-full min-w-0">
                <CursorTooltip
                    content={tooltipContent}
                    containerClassName="w-full"
                >
                    <p className="truncate font-medium text-sm leading-snug">
                        {chat.title || 'Untitled'}
                    </p>
                </CursorTooltip>
            </div>
        </button>
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
    const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)
    const setSelectedArtifact = useSetAtom(selectedArtifactAtom)
    const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom)
    const setActiveTab = useSetAtom(activeTabAtom)
    const [searchQuery, setSearchQuery] = useState('')
    const showWindowsLogo = isWindows() && sidebarOpen
    const [editingChatId, setEditingChatId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    
    // Section collapse state
    const [showRecent, setShowRecent] = useState(true)
    const [showArchived, setShowArchived] = useState(false)

    // Get API key status from main process
    const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery()

    
    // Determine connection status based on provider
    // NOTE: gemini-advanced disabled
    const isConnected = provider === 'chatgpt-plus' 
        ? keyStatus?.hasChatGPTPlus 
        : provider === 'openai' 
            ? keyStatus?.hasOpenAI 
            : provider === 'zai'
                ? keyStatus?.hasZai
                : keyStatus?.hasAnthropic

    // Fetch session
    const { data: session } = trpc.auth.getSession.useQuery()
    const user = session?.user

    // Fetch chats (includes pinned, ordered correctly)
    const { data: chats, isLoading, refetch } = trpc.chats.list.useQuery(undefined, {
        staleTime: 60_000,
        gcTime: 1000 * 60 * 30
    })
    
    // Fetch archived chats
    const { data: archivedChats, refetch: refetchArchived } = trpc.chats.listArchived.useQuery(undefined, {
        staleTime: 60_000,
        gcTime: 1000 * 60 * 30
    })

    // Sort chats: pinned first, then by updated_at
    const sortedChats = useMemo(() => {
        return [...(chats || [])].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1
            if (!a.pinned && b.pinned) return 1
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })
    }, [chats])

    // Filter chats based on search query
    const filterChats = useCallback((chatList: Chat[]) => 
        chatList.filter(chat =>
            (chat.title || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase())
        ),
        [searchQuery]
    )

    const filteredChats = useMemo(() => filterChats(sortedChats), [filterChats, sortedChats])
    const filteredArchived = useMemo(() => filterChats(archivedChats || []), [filterChats, archivedChats])

    const utils = trpc.useUtils()

    const [undoStack, setUndoStack] = useAtom(undoStackAtom)

    const removeUndoItem = useCallback((item: UndoItem) => {
        setUndoStack((prev) => {
            const index = prev.findIndex((entry) => entry.timeoutId === item.timeoutId)
            if (index !== -1) {
                clearTimeout(prev[index].timeoutId)
                return [...prev.slice(0, index), ...prev.slice(index + 1)]
            }
            return prev
        })
    }, [setUndoStack])

    const restoreChat = trpc.chats.restore.useMutation({
        onSuccess: () => {
            refetch()
            refetchArchived()
            toast.success('Chat restored')
        }
    })

    const restoreDeletedChat = trpc.chats.restoreDeleted.useMutation({
        onSuccess: () => {
            refetch()
            refetchArchived()
            toast.success('Chat restored')
        }
    })

    const restoreChatFromUndo = useCallback((item: UndoItem) => {
        removeUndoItem(item)
        if (item.action === 'archive') {
            restoreChat.mutate({ id: item.chatId })
        } else {
            restoreDeletedChat.mutate({ id: item.chatId })
        }
    }, [removeUndoItem, restoreChat, restoreDeletedChat])

    const createChat = trpc.chats.create.useMutation({
        onSuccess: (chat: Chat) => {
            utils.chats.get.invalidate({ id: chat.id })
            utils.chats.list.invalidate()
            setSelectedChatId(chat.id)
            setSelectedArtifact(null)
            setArtifactPanelOpen(false)
            setActiveTab('chat')
            refetch()
        },
        onError: (error) => {
            console.error('[Sidebar] Failed to create chat:', error)
        }
    })

    const deleteChat = trpc.chats.delete.useMutation({
        onSuccess: (_data, variables) => {
            refetch()
            refetchArchived()

            const undoItem: UndoItem = {
                action: 'delete',
                chatId: variables.id,
                timeoutId: setTimeout(() => {
                    removeUndoItem(undoItem)
                }, 10000)
            }

            setUndoStack((prev) => [...prev, undoItem])

            // Show undo toast
            toast.success('Chat deleted', {
                action: {
                    label: 'Undo',
                    onClick: () => restoreChatFromUndo(undoItem)
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

            const undoItem: UndoItem = {
                action: 'archive',
                chatId: variables.id,
                timeoutId: setTimeout(() => {
                    removeUndoItem(undoItem)
                }, 10000)
            }

            setUndoStack((prev) => [...prev, undoItem])

            // Show undo toast
            toast.success('Chat archived', {
                action: {
                    label: 'Undo',
                    onClick: () => restoreChatFromUndo(undoItem)
                }
            })
        }
    })

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'z' && undoStack.length > 0) {
                event.preventDefault()
                const lastItem = undoStack[undoStack.length - 1]
                if (!lastItem) return

                restoreChatFromUndo(lastItem)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [undoStack, restoreChatFromUndo])

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
        setActiveTab('chat')
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
                "flex items-center gap-2 px-4",
                showWindowsLogo ? "justify-between" : "justify-end",
                isMacOS() ? "h-11 pt-1 pl-20" : "h-10 pt-0",
                "drag-region"
            )}>
                {showWindowsLogo && (
                    <div className="flex items-center gap-2 no-drag">
                        <Logo size={20} />
                        <span className="text-sm font-semibold text-foreground tracking-tight">S-AGI</span>
                    </div>
                )}
                <div className="flex items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl shrink-0 no-drag"
                                onClick={() => setActiveTab('gallery')}
                            >
                                <IconPhoto size={18} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Gallery</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl shrink-0 no-drag"
                                onClick={handleNewChat}
                                disabled={createChat.isPending}
                            >
                                <IconPlus size={18} />
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
                                aria-label="Collapse sidebar"
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
            </div>

            {/* Search Bar */}
            <div className="px-4 pb-2 w-full">
                <div className="relative group w-full">
                    <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors shrink-0" />
                    <Input
                        placeholder="Search conversations…"
                        className="pl-9 pr-14 h-9 bg-accent/30 border-none rounded-xl text-xs placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/20 transition-[box-shadow,background-color] w-full"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search conversations"
                        name="chat-search"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted/80 px-1.5 font-mono text-[10px] font-medium text-muted-foreground shrink-0">
                        {isMacOS() ? '⌘' : 'Ctrl'} K
                    </kbd>
                </div>
            </div>

            <Separator className="my-1 opacity-40" />

            {/* Chat list with fade scroll effect */}
            <FadeScrollArea className="flex-1 pl-4 pr-2">
                <div className="pb-4 pr-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : (
                        <>
                            {/* History Section (includes Pinned and Recent) */}
            <div className="mb-2">
                                <SectionHeader
                                    title="History"
                                    count={filteredChats.length}
                                    isOpen={showRecent}
                                    onToggle={() => setShowRecent(!showRecent)}
                                    icon={<IconMessage size={12} />}
                                />
                                {showRecent && (
                    <div className="space-y-1.5">
                                        {filteredChats.length === 0 ? (
                                            <div className="text-sm text-muted-foreground text-center py-8 px-4">
                                                <IconMessage size={32} className="mx-auto mb-2 opacity-30" />
                                                <p>{searchQuery ? 'No results found' : 'No conversations yet'}</p>
                                            </div>
                                        ) : (
                                            renderChatList(filteredChats)
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
                        <div className="space-y-1.5">
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
            <div className="px-4 py-3 border-t border-border space-y-3">
                {/* AI Provider Status */}
                <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                        'hover:bg-accent/50 text-left'
                    )}
                >
                    {provider === 'chatgpt-plus' ? (
                        <IconBrandOpenai size={18} className="shrink-0 text-emerald-600" />
                    ) : provider === 'openai' ? (
                        <IconBrandOpenai size={18} className="shrink-0" />
                    ) : provider === 'zai' ? (
                        <ZaiIcon className="shrink-0 text-amber-500" size={18} />
                    ) : (
                        // NOTE: gemini-advanced disabled
                        <IconBrain size={18} className="shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1.5">
                            <p className="font-medium truncate">
                                {provider === 'chatgpt-plus' 
                                    ? 'ChatGPT Plus' 
                                    : provider === 'openai' 
                                        ? 'OpenAI' 
                                        : provider === 'zai'
                                            ? 'Z.AI'
                                            // NOTE: gemini-advanced disabled
                                            : 'Anthropic'}
                            </p>

                        </div>
                        <p className="text-[10px] text-muted-foreground leading-none">
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
                                className="h-9 w-full justify-start gap-2 px-2 hover:bg-accent/50 relative"
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
                            <DropdownMenuLabel className="flex items-center justify-between">
                                <span>My Account</span>
                                {isConnected && (
                                    <div className="flex items-center gap-1.5 bg-accent/50 px-2 py-0.5 rounded-full">
                                        {provider === 'chatgpt-plus' ? (
                                            <IconBrandOpenai size={10} className="text-emerald-600" />
                                        ) : provider === 'openai' ? (
                                            <IconBrandOpenai size={10} />
                                        ) : provider === 'zai' ? (
                                            <ZaiIcon size={10} className="text-amber-500" />
                                        ) : null}
                                        {/* NOTE: gemini-advanced disabled */}
                                        <span className="text-[9px] font-bold tracking-tight uppercase">
                                            {provider === 'chatgpt-plus' ? 'Plus' : provider}
                                        </span>
                                    </div>
                                )}
                            </DropdownMenuLabel>
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
