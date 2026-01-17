import { useState, useMemo } from 'react'
import { useAtom } from 'jotai'
import {
    IconMessage,
    IconSearch,
    IconDots,
    IconPencil,
    IconArchive,
    IconTrash
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import { selectedChatIdAtom } from '@/lib/atoms'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, formatRelativeTime } from '@/lib/utils'
import { RenameChatDialog } from './rename-dialog'

interface Chat {
    id: string
    title: string | null
    updated_at: string
    archived: boolean
}

interface HistoryDialogContentProps {
    onSelect?: () => void
}

export function HistoryDialogContent({ onSelect }: HistoryDialogContentProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom)

    // Rename state
    const [renameDialogOpen, setRenameDialogOpen] = useState(false)
    const [chatToRename, setChatToRename] = useState<{ id: string, title: string } | null>(null)

    // Fetch chats
    const { data: chats, isLoading, refetch } = trpc.chats.list.useQuery({})

    const deleteChat = trpc.chats.delete.useMutation({
        onSuccess: () => refetch()
    })

    const archiveChat = trpc.chats.archive.useMutation({
        onSuccess: () => refetch()
    })

    // Filter chats based on search query - memoized to avoid recalculation on every render
    const filteredChats = useMemo(() =>
        chats?.filter(chat =>
            (chat.title || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase())
        ),
        [chats, searchQuery]
    )

    const handleSelectChat = (chatId: string) => {
        setSelectedChatId(chatId)
        onSelect?.()
    }

    const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
        e.stopPropagation()
        deleteChat.mutate({ id: chatId })
        if (selectedChatId === chatId) {
            setSelectedChatId(null)
        }
    }

    const handleArchiveChat = (e: React.MouseEvent, chatId: string) => {
        e.stopPropagation()
        archiveChat.mutate({ id: chatId })
    }

    const handleRenameClick = (e: React.MouseEvent, chat: Chat) => {
        e.stopPropagation()
        setChatToRename({ id: chat.id, title: chat.title || 'Untitled' })
        setRenameDialogOpen(true)
    }

    return (
        <>
            <DialogContent className="w-[90vw] h-[80vh] max-w-[900px] flex flex-col p-0 gap-0 overflow-hidden bg-background border border-border shadow-2xl rounded-[20px]">
                <DialogHeader className="p-6 border-b border-border/50 shrink-0">
                    <DialogTitle className="text-lg font-semibold text-foreground">History</DialogTitle>
                    <DialogDescription className="sr-only">
                        Search and manage your chat history.
                    </DialogDescription>
                    <div className="relative mt-4">
                        <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search conversations..."
                            className="pl-9 h-10 bg-accent/20 border-transparent focus:border-primary/20 rounded-xl text-base"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            </div>
                        ) : !filteredChats?.length ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-50">
                                <IconMessage size={32} className="mb-2" />
                                <p className="text-sm">{searchQuery ? 'No results found' : 'No conversations yet'}</p>
                            </div>
                        ) : (
                            filteredChats.map((chat: Chat) => (
                                <div
                                    key={chat.id}
                                    className={cn(
                                        'group flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all cursor-pointer border border-transparent',
                                        selectedChatId === chat.id
                                            ? 'bg-accent/80 border-border/50 shadow-sm'
                                            : 'hover:bg-accent/40 hover:border-border/30'
                                    )}
                                    onClick={() => handleSelectChat(chat.id)}
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
                                        selectedChatId === chat.id ? "bg-background text-primary" : "bg-accent/50 text-muted-foreground"
                                    )}>
                                        <IconMessage size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate font-medium text-foreground/90">
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
                                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-background rounded-md transition-opacity"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <IconDots size={14} />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40">
                                            <DropdownMenuItem onClick={(e) => handleRenameClick(e, chat)}>
                                                <IconPencil size={14} className="mr-2" />
                                                Rename
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => handleArchiveChat(e, chat.id)}>
                                                <IconArchive size={14} className="mr-2" />
                                                Archive
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                variant="destructive"
                                                onClick={(e) => handleDeleteChat(e, chat.id)}
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
            </DialogContent>

            {/* Rename Dialog */}
            {chatToRename && (
                <RenameChatDialog
                    open={renameDialogOpen}
                    onOpenChange={setRenameDialogOpen}
                    chatId={chatToRename.id}
                    currentTitle={chatToRename.title}
                    onSuccess={() => refetch()}
                />
            )}
        </>
    )
}
