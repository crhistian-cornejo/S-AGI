import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconMessage,
    IconSearch,
    IconDots,
    IconPencil,
    IconArchive,
    IconArchiveOff,
    IconTrash,
    IconPin,
    IconPinFilled,
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    commandKOpenAtom,
    selectedChatIdAtom,
    activeTabAtom,
    undoStackAtom,
    type UndoItem,
} from '@/lib/atoms'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, formatRelativeTime, isMacOS } from '@/lib/utils'
import { RenameChatDialog } from './rename-dialog'
import { toast } from 'sonner'

const EASING = [0.32, 0.72, 0, 1] as const

interface Chat {
    id: string
    title: string | null
    updated_at: string
    archived: boolean
    pinned?: boolean
}

interface ChatRowProps {
    chat: Chat
    index: number
    highlightedIndex: number
    onSelect: () => void
    onHighlight: () => void
    onRename: (e: React.MouseEvent) => void
    onArchive: (e: React.MouseEvent) => void
    onDelete: (e: React.MouseEvent) => void
    onTogglePin: (e: React.MouseEvent) => void
    onRestore: (e: React.MouseEvent) => void
    isArchived: boolean
    /** Notify when the row "..." menu opens/closes (used to avoid closing the palette on Escape when menu is open) */
    onMenuOpenChange?: (open: boolean) => void
}

function ChatRow({
    chat,
    index,
    highlightedIndex,
    onSelect,
    onHighlight,
    onRename,
    onArchive,
    onDelete,
    onTogglePin,
    onRestore,
    isArchived,
    onMenuOpenChange,
}: ChatRowProps) {
    const isHi = highlightedIndex === index
    return (
        <div
            data-index={index}
            className={cn(
                'group flex items-center gap-3 px-3 py-3 rounded-xl w-full text-left',
                isHi ? 'bg-accent/80' : 'hover:bg-accent/40'
            )}
        >
            <button
                type="button"
                onClick={onSelect}
                onMouseEnter={onHighlight}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect()
                    }
                }}
                className="flex flex-1 items-center gap-3 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
            >
                {chat.pinned && (
                    <IconPinFilled size={14} className="shrink-0 text-primary" />
                )}
                {chat.archived && (
                    <IconArchive size={14} className="shrink-0 text-muted-foreground/60" />
                )}
                <div
                    className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        isHi ? 'bg-background text-primary' : 'bg-accent/50 text-muted-foreground'
                    )}
                >
                    <IconMessage size={15} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-foreground/95 leading-snug">{chat.title || 'Untitled'}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{formatRelativeTime(chat.updated_at)}</p>
                </div>
            </button>
            <DropdownMenu onOpenChange={onMenuOpenChange} modal={false}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        onMouseEnter={onHighlight}
                        className={cn(
                            'p-1.5 hover:bg-accent/50 rounded-lg transition-all active:scale-95',
                            isHi ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        )}
                    >
                        <IconDots size={14} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                    <DropdownMenuContent
                        align="end"
                        className="w-44 !z-[1001]"
                        sideOffset={5}
                    >
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
                        <DropdownMenuItem onClick={onRename}>
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
                        <DropdownMenuItem variant="destructive" onClick={onDelete}>
                            <IconTrash size={14} className="mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenuPortal>
            </DropdownMenu>
        </div>
    )
}

export function CommandKDialog() {
    const [isOpen, setIsOpen] = useAtom(commandKOpenAtom)
    const [searchQuery, setSearchQuery] = useState('')
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const dialogRef = useRef<HTMLDivElement>(null)
    const isMenuOpenRef = useRef(false)
    const selectedChatId = useAtomValue(selectedChatIdAtom)
    const setSelectedChatId = useSetAtom(selectedChatIdAtom)
    const setActiveTab = useSetAtom(activeTabAtom)
    const setUndoStack = useSetAtom(undoStackAtom)

    const removeUndoItem = useCallback(
        (item: UndoItem) => {
            setUndoStack((prev) => {
                const idx = prev.findIndex((e) => e.timeoutId === item.timeoutId)
                if (idx !== -1) {
                    clearTimeout(prev[idx].timeoutId)
                    return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
                }
                return prev
            })
        },
        [setUndoStack]
    )

    const [renameOpen, setRenameOpen] = useState(false)
    const [chatToRename, setChatToRename] = useState<{ id: string; title: string } | null>(null)

    const { data: chats, isLoading, refetch } = trpc.chats.list.useQuery(
        { includeArchived: true },
        { enabled: isOpen }
    )

    const restoreChat = trpc.chats.restore.useMutation({
        onSuccess: () => {
            refetch()
            toast.success('Chat restored')
        },
    })

    const restoreDeletedChat = trpc.chats.restoreDeleted.useMutation({
        onSuccess: () => {
            refetch()
            toast.success('Chat restored')
        },
    })

    const restoreChatFromUndo = useCallback(
        (item: UndoItem) => {
            removeUndoItem(item)
            if (item.action === 'archive') restoreChat.mutate({ id: item.chatId })
            else restoreDeletedChat.mutate({ id: item.chatId })
        },
        [removeUndoItem, restoreChat, restoreDeletedChat]
    )

    const deleteChat = trpc.chats.delete.useMutation({
        onSuccess: (_data, variables) => {
            refetch()
            const undoItem: UndoItem = {
                action: 'delete',
                chatId: variables.id,
                timeoutId: setTimeout(() => removeUndoItem(undoItem), 10000),
            }
            setUndoStack((prev) => [...prev, undoItem])
            toast.success('Chat deleted', { action: { label: 'Undo', onClick: () => restoreChatFromUndo(undoItem) } })
        },
    })

    const archiveChat = trpc.chats.archive.useMutation({
        onSuccess: (_data, variables) => {
            refetch()
            if (selectedChatId === variables.id) setSelectedChatId(null)
            const undoItem: UndoItem = {
                action: 'archive',
                chatId: variables.id,
                timeoutId: setTimeout(() => removeUndoItem(undoItem), 10000),
            }
            setUndoStack((prev) => [...prev, undoItem])
            toast.success('Chat archived', { action: { label: 'Undo', onClick: () => restoreChatFromUndo(undoItem) } })
        },
    })

    const togglePin = trpc.chats.togglePin.useMutation({
        onSuccess: (data) => {
            refetch()
            toast.success(data.pinned ? 'Pinned' : 'Unpinned')
        },
    })

    const filterBySearch = useCallback(
        (list: Chat[]) =>
            list.filter((c) =>
                (c.title || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase())
            ),
        [searchQuery]
    )

    const { pinnedChats, recentChats, archivedChats } = useMemo(() => {
        const pinned: Chat[] = []
        const recent: Chat[] = []
        const archived: Chat[] = []
        for (const c of chats ?? []) {
            if (c.archived) archived.push(c as Chat)
            else if (c.pinned) pinned.push(c as Chat)
            else recent.push(c as Chat)
        }
        return {
            pinnedChats: filterBySearch(pinned),
            recentChats: filterBySearch(recent),
            archivedChats: filterBySearch(archived),
        }
    }, [chats, filterBySearch])

    const flatChats = useMemo(
        () => [...pinnedChats, ...recentChats, ...archivedChats],
        [pinnedChats, recentChats, archivedChats]
    )

    const selectChat = useCallback(
        (chat: Chat) => {
            setSelectedChatId(chat.id)
            setActiveTab('chat')
            setIsOpen(false)
        },
        [setSelectedChatId, setActiveTab, setIsOpen]
    )

    // Focus input and reset when opening
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('')
            setHighlightedIndex(0)
            requestAnimationFrame(() => inputRef.current?.focus())
        }
    }, [isOpen])

    // Reset menu-open ref when palette closes
    useEffect(() => {
        if (!isOpen) isMenuOpenRef.current = false
    }, [isOpen])

    // Clamp highlighted index when results change
    useEffect(() => {
        const n = flatChats.length
        if (n === 0) setHighlightedIndex(0)
        else setHighlightedIndex((i) => (i >= n ? n - 1 : i < 0 ? 0 : i))
    }, [flatChats.length])

    // Scroll highlighted into view
    useEffect(() => {
        const list = listRef.current
        if (!list) return
        const el = list.querySelector(`[data-index="${highlightedIndex}"]`)
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, [highlightedIndex])

    // Escape to close (but not when a row "..." menu is open — let Radix close that first)
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isMenuOpenRef.current) return
                e.preventDefault()
                setIsOpen(false)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isOpen, setIsOpen])

    // Arrow keys and Enter
    const onKeyDown = (e: React.KeyboardEvent) => {
        const n = flatChats.length
        if (n === 0) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIndex((i) => (i + 1) % n)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIndex((i) => (i - 1 + n) % n)
        } else if (e.key === 'Enter') {
            e.preventDefault()
            const c = flatChats[highlightedIndex]
            if (c) selectChat(c)
        }
    }

    const handleRename = (e: React.MouseEvent, c: Chat) => {
        e.stopPropagation()
        setChatToRename({ id: c.id, title: c.title || 'Untitled' })
        setRenameOpen(true)
    }

    const handleArchive = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        archiveChat.mutate({ id })
    }

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        deleteChat.mutate({ id })
        if (id === selectedChatId) setSelectedChatId(null)
    }

    const handleTogglePin = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        togglePin.mutate({ id })
    }

    const handleRestore = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        restoreChat.mutate({ id })
    }

    if (typeof document === 'undefined') return null

    return createPortal(
        <>
        <AnimatePresence mode="wait">
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASING }}
                        className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                        aria-hidden
                    />
                    <div className="fixed inset-0 z-[71] flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
                        <motion.div
                            ref={dialogRef}
                            initial={{ opacity: 0, scale: 0.96, y: -8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: -8 }}
                            transition={{ duration: 0.22, ease: EASING }}
                            className="w-full max-w-2xl pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-background/95 backdrop-blur-xl rounded-2xl border border-border/60 shadow-2xl overflow-hidden">
                                {/* Search */}
                                <div className="p-3 border-b border-border/50">
                                    <div className="relative">
                                        <IconSearch
                                            size={18}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                        />
                                        <Input
                                            ref={inputRef}
                                            placeholder="Search conversations…"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                                                    e.preventDefault()
                                                    return
                                                }
                                                onKeyDown(e)
                                            }}
                                            className="pl-10 pr-11 h-12 bg-transparent border-0 text-base placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-xl"
                                            aria-label="Search conversations"
                                            autoComplete="off"
                                        />
                                        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-6 select-none items-center gap-0.5 rounded-md border border-border/60 bg-muted/60 px-2 font-mono text-[11px] font-medium text-muted-foreground">
                                            {isMacOS() ? '⌘' : 'Ctrl'} K
                                        </kbd>
                                    </div>
                                </div>

                                {/* List: Pinned · Recent · Archived */}
                                <ScrollArea className="h-[min(400px,60vh)]">
                                    <div ref={listRef} className="p-2 pb-4">
                                        {isLoading ? (
                                            <div className="flex justify-center py-10">
                                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            </div>
                                        ) : flatChats.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                                <IconMessage size={28} className="mb-2 opacity-50" />
                                                <p className="text-sm">
                                                    {searchQuery ? 'No results' : 'No conversations yet'}
                                                </p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Pinned */}
                                                {pinnedChats.length > 0 && (
                                                    <div className="mb-1">
                                                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                                            <IconPinFilled size={12} />
                                                            Pinned
                                                        </div>
                                                        {pinnedChats.map((chat, i) => {
                                                            const idx = i
                                                            return (
                                                                <ChatRow
                                                                    key={chat.id}
                                                                    chat={chat}
                                                                    index={idx}
                                                                    highlightedIndex={highlightedIndex}
                                                                    onSelect={() => selectChat(chat)}
                                                                    onHighlight={() => setHighlightedIndex(idx)}
                                                                    onRename={(e) => handleRename(e, chat)}
                                                                    onArchive={(e) => handleArchive(e, chat.id)}
                                                                    onDelete={(e) => handleDelete(e, chat.id)}
                                                                    onTogglePin={(e) => handleTogglePin(e, chat.id)}
                                                                    onRestore={(e) => handleRestore(e, chat.id)}
                                                                    isArchived={false}
                                                                    onMenuOpenChange={(open) => { isMenuOpenRef.current = open }}
                                                                />
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                                {/* Recent */}
                                                {recentChats.length > 0 && (
                                                    <div className="mb-1">
                                                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                                            <IconMessage size={12} />
                                                            Recent
                                                        </div>
                                                        {recentChats.map((chat, i) => {
                                                            const idx = pinnedChats.length + i
                                                            return (
                                                                <ChatRow
                                                                    key={chat.id}
                                                                    chat={chat}
                                                                    index={idx}
                                                                    highlightedIndex={highlightedIndex}
                                                                    onSelect={() => selectChat(chat)}
                                                                    onHighlight={() => setHighlightedIndex(idx)}
                                                                    onRename={(e) => handleRename(e, chat)}
                                                                    onArchive={(e) => handleArchive(e, chat.id)}
                                                                    onDelete={(e) => handleDelete(e, chat.id)}
                                                                    onTogglePin={(e) => handleTogglePin(e, chat.id)}
                                                                    onRestore={(e) => handleRestore(e, chat.id)}
                                                                    isArchived={false}
                                                                    onMenuOpenChange={(open) => { isMenuOpenRef.current = open }}
                                                                />
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                                {/* Archived */}
                                                {archivedChats.length > 0 && (
                                                    <div className="border-t border-border/40 pt-2 mt-1">
                                                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                                            <IconArchive size={12} />
                                                            Archived
                                                        </div>
                                                        {archivedChats.map((chat, i) => {
                                                            const idx = pinnedChats.length + recentChats.length + i
                                                            return (
                                                                <ChatRow
                                                                    key={chat.id}
                                                                    chat={chat}
                                                                    index={idx}
                                                                    highlightedIndex={highlightedIndex}
                                                                    onSelect={() => selectChat(chat)}
                                                                    onHighlight={() => setHighlightedIndex(idx)}
                                                                    onRename={(e) => handleRename(e, chat)}
                                                                    onArchive={(e) => handleArchive(e, chat.id)}
                                                                    onDelete={(e) => handleDelete(e, chat.id)}
                                                                    onTogglePin={(e) => handleTogglePin(e, chat.id)}
                                                                    onRestore={(e) => handleRestore(e, chat.id)}
                                                                    isArchived={true}
                                                                    onMenuOpenChange={(open) => { isMenuOpenRef.current = open }}
                                                                />
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </ScrollArea>

                                {/* Footer hint */}
                                <div className="px-4 py-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>↑↓ Navigate · ↵ Open</span>
                                    <span>Esc to close</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
        {chatToRename && (
            <RenameChatDialog
                open={renameOpen}
                onOpenChange={setRenameOpen}
                chatId={chatToRename.id}
                currentTitle={chatToRename.title}
                onSuccess={() => refetch()}
            />
        )}
        </>,
        document.body
    )
}
