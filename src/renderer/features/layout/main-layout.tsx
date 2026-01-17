import { useAtomValue } from 'jotai'
import {
    sidebarOpenAtom,
    artifactPanelOpenAtom,
    selectedArtifactAtom
} from '@/lib/atoms'
import { Sidebar } from '@/features/sidebar/sidebar'
import { ChatView } from '@/features/chat/chat-view'
import { ArtifactPanel } from '@/features/artifacts/artifact-panel'
import { TitleBar } from './title-bar'
import { cn } from '@/lib/utils'

export function MainLayout() {
    const sidebarOpen = useAtomValue(sidebarOpenAtom)
    const artifactPanelOpen = useAtomValue(artifactPanelOpenAtom)
    const selectedArtifact = useAtomValue(selectedArtifactAtom)

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden">
            {/* Title bar for macOS / custom Windows */}
            <TitleBar />

            {/* Main content area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar - collapsible */}
                <div
                    className={cn(
                        'h-full border-r border-border bg-sidebar transition-all duration-200 ease-in-out',
                        sidebarOpen ? 'w-72' : 'w-0'
                    )}
                >
                    {sidebarOpen && <Sidebar />}
                </div>

                {/* Chat area - takes remaining space */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    <ChatView />
                </div>

                {/* Artifact panel - collapsible on right */}
                {selectedArtifact && artifactPanelOpen && (
                    <div className="w-[500px] h-full border-l border-border bg-background">
                        <ArtifactPanel />
                    </div>
                )}
            </div>
        </div>
    )
}
