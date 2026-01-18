import { useAtom, useAtomValue } from 'jotai'
import {
    IconMinus,
    IconSquare,
    IconX,
    IconLayoutSidebarRightCollapse,
    IconMessageChatbot,
    IconTable,
    IconFileText
} from '@tabler/icons-react'
import {
    artifactPanelOpenAtom,
    selectedArtifactAtom,
    activeTabAtom
} from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, isMacOS, isElectron } from '@/lib/utils'

export interface TitleBarProps {
    className?: string
}

export function TitleBar({ className }: TitleBarProps) {
    const [artifactPanelOpen, setArtifactPanelOpen] = useAtom(artifactPanelOpenAtom)
    const [activeTab, setActiveTab] = useAtom(activeTabAtom)
    const selectedArtifact = useAtomValue(selectedArtifactAtom)
    const isDesktop = isElectron()
    const showTrafficLights = isMacOS() && isDesktop

    const handleMinimize = () => window.desktopApi?.minimize()
    const handleMaximize = () => window.desktopApi?.maximize()
    const handleClose = () => window.desktopApi?.close()

    return (
        <div
            className={cn(
                'h-10 flex items-center bg-transparent drag-region shrink-0 px-2',
                showTrafficLights && 'pl-20', // Space for traffic lights
                className
            )}
        >
            {/* Left content - only on non-macOS */}
            {!showTrafficLights && (
                <div className="flex items-center gap-2 no-drag ml-2">
                    <Logo size={20} />
                    <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:block">S-AGI</span>
                </div>
            )}

            {isDesktop && <div className="flex-1 h-full" />}

            <div className={cn('flex no-drag', isDesktop ? 'justify-center' : 'justify-start ml-2')}>
                <div
                    className={cn(
                        'flex items-center bg-background/40 backdrop-blur-md border border-border/50 rounded-lg p-0.5 h-8',
                        isDesktop ? 'mx-4' : ''
                    )}
                >
                    <button
                        type="button"
                        onClick={() => setActiveTab('chat')}
                        className={cn(
                            "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
                            activeTab === 'chat'
                                ? "bg-accent text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                        )}
                    >
                        <IconMessageChatbot size={14} />
                        Chat
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('excel')}
                        className={cn(
                            "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
                            activeTab === 'excel'
                                ? "bg-accent text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                        )}
                    >
                        <IconTable size={14} />
                        Excel
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('doc')}
                        className={cn(
                            "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
                            activeTab === 'doc'
                                ? "bg-accent text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                        )}
                    >
                        <IconFileText size={14} />
                        Docs
                    </button>
                </div>
            </div>

            {isDesktop && <div className="flex-1 h-full" />}

            {/* Right content - Logo and text on macOS, controls on others */}
            <div className="flex items-center no-drag pr-1">
                {/* Logo and text - only on macOS */}
                {showTrafficLights && (
                    <div className="flex items-center gap-2 mr-4">
                        <Logo size={20} />
                        <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:block">S-AGI</span>
                    </div>
                )}

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
