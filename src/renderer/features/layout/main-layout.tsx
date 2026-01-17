import { useState, lazy, Suspense } from 'react'
import {
    IconPlus,
    IconLayoutSidebarLeftExpand,
    IconHistory,
    IconTable,
    IconSparkles
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    sidebarOpenAtom,
    artifactPanelOpenAtom,
    selectedArtifactAtom,
    selectedChatIdAtom,
    activeTabAtom,
    shortcutsDialogOpenAtom
} from '@/lib/atoms'
import { Sidebar } from '@/features/sidebar/sidebar'
import { ChatView } from '@/features/chat/chat-view'
import { DocViewer } from '@/features/docs/doc-viewer'
import { TitleBar } from './title-bar'
import { cn } from '@/lib/utils'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { ShortcutsDialog } from '@/features/help/shortcuts-dialog'
import { useHotkeys } from 'react-hotkeys-hook'

// Lazy load less frequently used components
const ArtifactPanel = lazy(() => import('@/features/artifacts/artifact-panel').then(m => ({ default: m.ArtifactPanel })))
const UniverSpreadsheet = lazy(() => import('@/features/univer/univer-spreadsheet').then(m => ({ default: m.UniverSpreadsheet })))
const HistoryDialogContent = lazy(() => import('@/features/chat/history-dialog').then(m => ({ default: m.HistoryDialogContent })))

// Loading fallback for lazy components
function PanelLoadingFallback() {
    return (
        <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    )
}

export function MainLayout() {
    const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)
    const [artifactPanelOpen] = useAtom(artifactPanelOpenAtom)
    const selectedArtifact = useAtomValue(selectedArtifactAtom)
    const setSelectedChatId = useSetAtom(selectedChatIdAtom)
    const [activeTab, setActiveTab] = useAtom(activeTabAtom)
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
                {activeTab === 'chat' && (
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
                                            <Suspense fallback={null}>
                                                <HistoryDialogContent onSelect={() => setHistoryOpen(false)} />
                                            </Suspense>
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
                                <Suspense fallback={<PanelLoadingFallback />}>
                                    <ArtifactPanel />
                                </Suspense>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'excel' && (
                    <div className="flex-1 flex flex-col animate-in fade-in zoom-in-95 duration-500">
                        {selectedArtifact && selectedArtifact.type === 'spreadsheet' ? (
                            <Suspense fallback={<PanelLoadingFallback />}>
                                <UniverSpreadsheet
                                    artifactId={selectedArtifact.id}
                                    data={selectedArtifact.univer_data}
                                />
                            </Suspense>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8">
                                <div className="max-w-md text-center space-y-4">
                                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                                        <IconTable size={32} className="text-emerald-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-semibold">No Spreadsheet Selected</h2>
                                        <p className="text-muted-foreground mt-1">
                                            Create a spreadsheet in the chat or select one from your conversation history.
                                        </p>
                                    </div>
                                    <Button 
                                        variant="outline"
                                        onClick={() => setActiveTab('chat')}
                                    >
                                        <IconSparkles size={16} className="mr-2" />
                                        Go to Chat
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'doc' && (
                    <div className="flex-1 flex flex-col animate-in fade-in zoom-in-95 duration-500">
                        <DocViewer />
                    </div>
                )}
            </div>
        </div>
    )
}
