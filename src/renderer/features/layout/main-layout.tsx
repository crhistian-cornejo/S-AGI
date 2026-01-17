import { useState } from 'react'
import {
    IconPlus,
    IconLayoutSidebarLeftExpand,
    IconTable,
    IconHistory
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    sidebarOpenAtom,
    artifactPanelOpenAtom,
    selectedArtifactAtom,
    selectedChatIdAtom,
    appViewModeAtom,
    shortcutsDialogOpenAtom
} from '@/lib/atoms'
import { Sidebar } from '@/features/sidebar/sidebar'
import { ChatView } from '@/features/chat/chat-view'
import { ArtifactPanel } from '@/features/artifacts/artifact-panel'
import { TitleBar } from './title-bar'
import { cn } from '@/lib/utils'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { HistoryDialogContent } from '@/features/chat/history-dialog'
import { ShortcutsDialog } from '@/features/help/shortcuts-dialog'
import { useHotkeys } from 'react-hotkeys-hook'

export function MainLayout() {
    const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)
    const [artifactPanelOpen] = useAtom(artifactPanelOpenAtom)
    const selectedArtifact = useAtomValue(selectedArtifactAtom)
    const setSelectedChatId = useSetAtom(selectedChatIdAtom)
    const [appMode, setAppMode] = useAtom(appViewModeAtom)
    const [, setShortcutsOpen] = useAtom(shortcutsDialogOpenAtom)
    const utils = trpc.useUtils()
    const [historyOpen, setHistoryOpen] = useState(false)

    const createChat = trpc.chats.create.useMutation({
        onSuccess: (chat) => {
            // Select the new chat
            // Note: In a real app we might want to update the selectedChatId atom here
            // but the Sidebar component usually handles checking logic. 
            // Since Sidebar is hidden here, we might need to set it explicitly if Sidebar doesn't
            setSelectedChatId(chat.id)
            utils.chats.list.invalidate()
        }
    })

    const handleNewChat = () => {
        createChat.mutate({ title: 'New Chat' })
    }

    // Global Shortcuts
    useHotkeys('shift+?', () => setShortcutsOpen((prev) => !prev), { preventDefault: true })
    useHotkeys('meta+\\', () => setSidebarOpen((prev) => !prev), { preventDefault: true })
    useHotkeys('meta+n, ctrl+n', (e) => {
        e.preventDefault()
        handleNewChat()
    }, { enableOnFormTags: true, preventDefault: true })

    return (
        <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
            <TitleBar />
            <ShortcutsDialog />

            <div className="flex flex-1 overflow-hidden relative">
                {appMode === 'chat' ? (
                    <>
                        {/* Sidebar */}
                        <div
                            className={cn(
                                'h-full border-r border-border bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0',
                                sidebarOpen ? 'w-72' : 'w-0 border-r-0'
                            )}
                        >
                            <div className="w-72 h-full">
                                <Sidebar />
                            </div>
                        </div>

                        {/* Chat area */}
                        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                            {!sidebarOpen && (
                                <div className="absolute top-4 left-4 z-40 flex flex-col gap-2 animate-in fade-in slide-in-from-left-4 duration-500">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-10 w-10 rounded-2xl bg-background/60 backdrop-blur-xl border-border shadow-2xl hover:bg-accent hover:scale-110 transition-all active:scale-95"
                                                onClick={handleNewChat}
                                                disabled={createChat.isPending}
                                            >
                                                <IconPlus size={20} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="font-bold">New Chat</TooltipContent>
                                    </Tooltip>

                                    <div className="flex flex-col gap-1.5 p-1 rounded-2xl bg-background/40 backdrop-blur-md border border-border/50 shadow-xl">
                                        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                                            <DialogTrigger asChild>
                                                <div className="inline-flex"> {/* Wrapper for TooltipTrigger */}
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-9 w-9 rounded-xl hover:bg-accent/50 transition-all"
                                                            >
                                                                <IconHistory size={18} className="text-muted-foreground" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right">History</TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            </DialogTrigger>
                                            <HistoryDialogContent onSelect={() => setHistoryOpen(false)} />
                                        </Dialog>

                                        <div className="h-px bg-border/50 mx-2 my-0.5" />

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 rounded-xl hover:bg-accent/50 transition-all text-primary"
                                                    onClick={() => setSidebarOpen(true)}
                                                >
                                                    <IconLayoutSidebarLeftExpand size={18} />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">Open Sidebar</TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>
                            )}
                            <ChatView />
                        </div>

                        {/* Artifact panel */}
                        <div
                            className={cn(
                                'h-full border-l border-border bg-background transition-all duration-300 ease-in-out overflow-hidden shrink-0',
                                (selectedArtifact && artifactPanelOpen) ? 'w-[600px]' : 'w-0 border-l-0'
                            )}
                        >
                            <div className="w-[600px] h-full">
                                <ArtifactPanel />
                            </div>
                        </div>
                    </>
                ) : (
                    /* Native Mode - Global Spreadsheet View */
                    <div className="flex-1 flex flex-col animate-in fade-in zoom-in-95 duration-500">
                        {selectedArtifact?.type === 'spreadsheet' ? (
                            <UniverSpreadsheet
                                artifactId={selectedArtifact.id}
                                data={selectedArtifact.univer_data}
                            />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
                                <div className="w-16 h-16 rounded-3xl bg-accent flex items-center justify-center shadow-lg">
                                    <IconTable size={32} className="text-primary" />
                                </div>
                                <div className="max-w-xs">
                                    <h3 className="text-lg font-bold">No Active Spreadsheet</h3>
                                    <p className="text-sm text-muted-foreground mt-2 text-balance">
                                        Go back to Chat Mode and ask S-AGI to create a spreadsheet for you to see it here.
                                    </p>
                                    <Button
                                        variant="default"
                                        className="mt-6 rounded-xl"
                                        onClick={() => setAppMode('chat')}
                                    >
                                        Back to Chat
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
