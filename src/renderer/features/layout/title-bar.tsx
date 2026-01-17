import { useAtom, useAtomValue } from 'jotai'
import {
    IconMinus,
    IconSquare,
    IconX,
    IconLayoutSidebarRightCollapse,
    IconMessageChatbot,
    IconTable
} from '@tabler/icons-react'
import {
    sidebarOpenAtom,
    artifactPanelOpenAtom,
    selectedArtifactAtom,
    appViewModeAtom
} from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from 'next-themes'
import { cn, isMacOS, isElectron } from '@/lib/utils'

export function TitleBar() {
    const [artifactPanelOpen, setArtifactPanelOpen] = useAtom(artifactPanelOpenAtom)
    const [appMode, setAppMode] = useAtom(appViewModeAtom)
    const selectedArtifact = useAtomValue(selectedArtifactAtom)
    const showTrafficLights = isMacOS() && isElectron()

    const handleMinimize = () => window.desktopApi?.minimize()
    const handleMaximize = () => window.desktopApi?.maximize()
    const handleClose = () => window.desktopApi?.close()

    return (
        <div
            className={cn(
                'h-10 flex items-center border-b border-border bg-sidebar drag-region shrink-0 px-2',
                showTrafficLights && 'pl-20' // Space for macOS traffic lights
            )}
        >
            <div className="flex items-center gap-2 no-drag ml-2">
                <Logo size={20} />
                <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:block">S-AGI</span>
            </div>

            <div className="flex-1 h-full" />

            <div className="flex justify-center no-drag">
                <div className="flex items-center bg-background/40 backdrop-blur-md border border-border/50 rounded-lg p-0.5 h-8 mx-4">
                    <button
                        onClick={() => setAppMode('chat')}
                        className={cn(
                            "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
                            appMode === 'chat'
                                ? "bg-accent text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                        )}
                    >
                        <IconMessageChatbot size={14} />
                        Chat
                    </button>
                    <button
                        onClick={() => setAppMode('native')}
                        className={cn(
                            "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
                            appMode === 'native'
                                ? "bg-accent text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                        )}
                    >
                        <IconTable size={14} />
                        Native
                    </button>
                </div>
            </div>

            <div className="flex-1 h-full" />

            {/* Right section */}
            <div className="flex items-center no-drag pr-1">
                {selectedArtifact && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 mr-1"
                                onClick={() => setArtifactPanelOpen(!artifactPanelOpen)}
                            >
                                <IconLayoutSidebarRightCollapse
                                    size={18}
                                    className={cn("transition-transform", !artifactPanelOpen && "rotate-180")}
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Toggle Artifacts</TooltipContent>
                    </Tooltip>
                )}


                {isElectron() && !isMacOS() && (
                    <div className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-11 rounded-none hover:bg-accent"
                            onClick={handleMinimize}
                        >
                            <IconMinus size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-11 rounded-none hover:bg-accent"
                            onClick={handleMaximize}
                        >
                            <IconSquare size={14} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-11 rounded-none hover:bg-destructive hover:text-destructive-foreground"
                            onClick={handleClose}
                        >
                            <IconX size={16} />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
