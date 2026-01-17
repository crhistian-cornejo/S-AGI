import { useAtom } from 'jotai'
import { IconMinus, IconSquare, IconX, IconMenu2 } from '@tabler/icons-react'
import { sidebarOpenAtom } from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { cn, isMacOS, isElectron } from '@/lib/utils'

export function TitleBar() {
    const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)
    const showTrafficLights = isMacOS() && isElectron()

    const handleMinimize = () => window.desktopApi?.minimize()
    const handleMaximize = () => window.desktopApi?.maximize()
    const handleClose = () => window.desktopApi?.close()

    return (
        <div
            className={cn(
                'h-10 flex items-center justify-between border-b border-border bg-sidebar drag-region shrink-0',
                showTrafficLights && 'pl-20' // Space for macOS traffic lights
            )}
        >
            {/* Left section */}
            <div className="flex items-center gap-2 px-2 no-drag">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                    <IconMenu2 size={18} />
                </Button>
                <Logo size={22} />
                <span className="text-sm font-semibold text-foreground/80">S-AGI</span>
            </div>

            {/* Center - drag area */}
            <div className="flex-1" />

            {/* Right section - Window controls (Windows/Linux only) */}
            {isElectron() && !isMacOS() && (
                <div className="flex items-center no-drag">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-12 rounded-none hover:bg-accent"
                        onClick={handleMinimize}
                    >
                        <IconMinus size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-12 rounded-none hover:bg-accent"
                        onClick={handleMaximize}
                    >
                        <IconSquare size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-12 rounded-none hover:bg-destructive hover:text-destructive-foreground"
                        onClick={handleClose}
                    >
                        <IconX size={16} />
                    </Button>
                </div>
            )}
        </div>
    )
}
