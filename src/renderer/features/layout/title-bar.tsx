import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    artifactPanelOpenAtom,
    selectedArtifactAtom,
    activeTabAtom,
    settingsModalOpenAtom,
    currentProviderAtom,
    sidebarOpenAtom
} from '@/lib/atoms'
import { trpc } from '@/lib/trpc'
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
import {
    IconMinus,
    IconSquare,
    IconX,
    IconLayoutSidebarRightCollapse,
    IconMessageChatbot,
    IconTable,
    IconFileText,
    IconSettings,
    IconLogout,
    IconChevronDown
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { ZaiIcon, OpenAIIcon } from '@/components/icons/model-icons'
// NOTE: Gemini disabled - import { ZaiIcon, GeminiIcon } from '@/components/icons/model-icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, isMacOS, isElectron } from '@/lib/utils'

export interface TitleBarProps {
    className?: string
    noTrafficLightSpace?: boolean
}

export function TitleBar({ className, noTrafficLightSpace }: TitleBarProps) {
    const [artifactPanelOpen, setArtifactPanelOpen] = useAtom(artifactPanelOpenAtom)
    const [activeTab, setActiveTab] = useAtom(activeTabAtom)
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const selectedArtifact = useAtomValue(selectedArtifactAtom)
    const isDesktop = isElectron()
    const showTrafficLights = isMacOS() && isDesktop

    const utils = trpc.useUtils()
    const { data: session } = trpc.auth.getSession.useQuery()
    const user = session?.user
    const userDisplayName = user?.user_metadata?.full_name || user?.email || 'Not logged in'

    const signOut = trpc.auth.signOut.useMutation({
        onSuccess: () => {
            window.desktopApi?.setSession(null)
            utils.auth.getSession.invalidate()
        }
    })

    const handleMinimize = () => window.desktopApi?.minimize()
    const handleMaximize = () => window.desktopApi?.maximize()
    const handleClose = () => window.desktopApi?.close()

    // Get current provider and connection status
    const provider = useAtomValue(currentProviderAtom)
    const sidebarOpen = useAtomValue(sidebarOpenAtom)
    const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery()

    const isConnected = provider === 'chatgpt-plus' 
        ? keyStatus?.hasChatGPTPlus 
        // NOTE: gemini-advanced disabled
        : provider === 'openai' 
            ? keyStatus?.hasOpenAI 
            : provider === 'zai'
                ? keyStatus?.hasZai
                : false

    const providerIcon = (() => {
        if (!isConnected) return { icon: OpenAIIcon, className: "text-muted-foreground" }
        switch (provider) {
            case 'chatgpt-plus': return { icon: OpenAIIcon, className: "text-emerald-600" }
            case 'openai': return { icon: OpenAIIcon, className: "" }
            case 'zai': return { icon: ZaiIcon, className: "text-amber-500" }
            default: return { icon: OpenAIIcon, className: "text-muted-foreground" }
        }
    })()

    return (
        <div
            className={cn(
                'h-10 flex items-center bg-transparent drag-region shrink-0 px-2 transition-all duration-300',
                showTrafficLights && !noTrafficLightSpace && 'pl-20',
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
                    <div className="flex items-center gap-2 mr-2">
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

                {/* MacOS Profile Trigger - Pegado al borde derecho */}
                {showTrafficLights && !sidebarOpen && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                className="h-8 flex items-center gap-1.5 p-1 hover:bg-accent rounded-lg transition-colors no-drag ml-1 relative"
                            >
                                <div className="relative">
                                    <Avatar className="h-6 w-6 border border-border/50">
                                        <AvatarImage src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture} />
                                        <AvatarFallback className="bg-primary/10 text-[10px]">
                                            {user?.email?.charAt(0).toUpperCase() || <OpenAIIcon size={12} className="text-muted-foreground" />}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute -bottom-0.5 -right-0.5 bg-background border border-border rounded-full h-2 w-2 flex items-center justify-center shadow-sm ring-1 ring-background shrink-0 overflow-hidden">
                                        {/* NOTE: gemini-advanced disabled */}
                                        <providerIcon.icon size={5} className={providerIcon.className} />
                                    </div>
                                </div>
                                <IconChevronDown size={12} className="text-muted-foreground opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 mt-1">
                            <DropdownMenuLabel className="flex items-center justify-between">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-semibold truncate">
                                        {userDisplayName}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground truncate font-normal">
                                        {user?.email}
                                    </span>
                                </div>
                                {isConnected && (
                                    <div className="flex items-center gap-1.5 bg-accent/50 px-2 py-0.5 rounded-full shrink-0 ml-2">
                                        {/* NOTE: gemini-advanced disabled */}
                                        <providerIcon.icon size={10} className={providerIcon.className} />
                                        <span className="text-[9px] font-bold tracking-tight uppercase">
                                            {provider === 'chatgpt-plus' ? 'Plus' : provider}
                                        </span>
                                    </div>
                                )}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                                onClick={() => setSettingsOpen(true)} 
                                className="justify-between cursor-pointer"
                            >
                                <span className="flex items-center">
                                    <IconSettings size={14} className="mr-2" />
                                    Settings
                                </span>
                                <kbd className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                                    {navigator.platform.toLowerCase().includes('mac') ? '⌘,' : 'Ctrl+,'}
                                </kbd>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => signOut.mutate()}
                                className="cursor-pointer"
                            >
                                <IconLogout size={14} className="mr-2" />
                                Sign out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
    )
}
