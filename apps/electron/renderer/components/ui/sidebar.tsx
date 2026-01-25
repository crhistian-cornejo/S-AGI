import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { IconLayoutSidebar } from '@tabler/icons-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

type SidebarContext = {
    state: 'expanded' | 'collapsed'
    open: boolean
    setOpen: (open: boolean) => void
    toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContext | null>(null)

function useSidebar() {
    const context = React.useContext(SidebarContext)
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider.')
    }
    return context
}

/**
 * SidebarProvider - Container for the sidebar layout
 * 
 * For Electron apps with custom titlebar, use className="h-[calc(100vh-56px)]" 
 * or wrap in a container that accounts for the titlebar height.
 */
const SidebarProvider = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> & {
        defaultOpen?: boolean
        open?: boolean
        onOpenChange?: (open: boolean) => void
    }
>(
    (
        {
            defaultOpen = true,
            open: openProp,
            onOpenChange: setOpenProp,
            className,
            style,
            children,
            ...props
        },
        ref
    ) => {
        const [_open, _setOpen] = React.useState(defaultOpen)
        const open = openProp ?? _open
        
        const setOpen = React.useCallback(
            (value: boolean | ((value: boolean) => boolean)) => {
                const openState = typeof value === 'function' ? value(open) : value
                if (setOpenProp) {
                    setOpenProp(openState)
                } else {
                    _setOpen(openState)
                }
            },
            [setOpenProp, open]
        )

        const toggleSidebar = React.useCallback(() => {
            setOpen((prev) => !prev)
        }, [setOpen])

        // Keyboard shortcut
        React.useEffect(() => {
            const handleKeyDown = (event: KeyboardEvent) => {
                if (
                    event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
                    (event.metaKey || event.ctrlKey)
                ) {
                    event.preventDefault()
                    toggleSidebar()
                }
            }
            window.addEventListener('keydown', handleKeyDown)
            return () => window.removeEventListener('keydown', handleKeyDown)
        }, [toggleSidebar])

        const state = open ? 'expanded' : 'collapsed'

        const contextValue = React.useMemo<SidebarContext>(
            () => ({ state, open, setOpen, toggleSidebar }),
            [state, open, setOpen, toggleSidebar]
        )

        return (
            <SidebarContext.Provider value={contextValue}>
                <TooltipProvider delayDuration={0}>
                    <div
                        ref={ref}
                        style={
                            {
                                '--sidebar-width': SIDEBAR_WIDTH,
                                '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
                                ...style
                            } as React.CSSProperties
                        }
                        className={cn(
                            'group/sidebar-wrapper relative flex h-full w-full overflow-hidden',
                            'has-[[data-variant=inset]]:bg-sidebar',
                            className
                        )}
                        data-state={state}
                        {...props}
                    >
                        {children}
                    </div>
                </TooltipProvider>
            </SidebarContext.Provider>
        )
    }
)
SidebarProvider.displayName = 'SidebarProvider'

/**
 * Sidebar component with inset variant support
 * 
 * variant="inset" creates a visually embedded sidebar with rounded corners
 * that works within a contained layout (not full viewport).
 */
const Sidebar = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> & {
        side?: 'left' | 'right'
        variant?: 'sidebar' | 'floating' | 'inset'
        collapsible?: 'offcanvas' | 'icon' | 'none'
    }
>(
    (
        {
            side = 'left',
            variant = 'sidebar',
            collapsible = 'offcanvas',
            className,
            children,
            ...props
        },
        ref
    ) => {
        const { state } = useSidebar()
        const isCollapsed = state === 'collapsed'
        const isInset = variant === 'inset'
        const isFloating = variant === 'floating'

        // For non-collapsible sidebar
        if (collapsible === 'none') {
            return (
                <div
                    ref={ref}
                    className={cn(
                        'flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground shrink-0',
                        isInset && 'm-2 rounded-lg border border-sidebar-border shadow-sm',
                        className
                    )}
                    data-variant={variant}
                    {...props}
                >
                    {children}
                </div>
            )
        }

        // For icon collapsible mode, show a narrow strip with icons
        const isIconMode = collapsible === 'icon'

        return (
            <div
                ref={ref}
                className={cn(
                    'group peer flex h-full shrink-0 text-sidebar-foreground transition-[width] duration-200 ease-linear',
                    // Width handling - icon mode stays narrow, offcanvas collapses to 0
                    isCollapsed
                        ? isIconMode
                            ? 'w-[--sidebar-width-icon]'  // Keep narrow width for icons (52px default)
                            : 'w-0'
                        : 'w-[--sidebar-width]',
                    // Padding for inset/floating - left and bottom only (no top gap)
                    (isInset || isFloating) && !isCollapsed && 'pl-2 pb-2',
                    (isInset || isFloating) && isCollapsed && !isIconMode && 'p-0',
                    className
                )}
                data-state={state}
                data-collapsible={isCollapsed ? collapsible : ''}
                data-variant={variant}
                data-side={side}
                {...props}
            >
                <div
                    data-sidebar="sidebar"
                    className={cn(
                        'flex h-full w-full flex-col bg-sidebar overflow-hidden transition-all duration-200',
                        // Inset/floating styling - rounded on all corners except top-left touching titlebar
                        (isInset || isFloating) && 'rounded-lg border border-sidebar-border shadow-sm',
                        // Standard sidebar border
                        !isInset && !isFloating && side === 'left' && 'border-r border-sidebar-border',
                        !isInset && !isFloating && side === 'right' && 'border-l border-sidebar-border',
                        // Collapsed state - only hide for offcanvas, not icon mode
                        isCollapsed && !isIconMode && 'opacity-0'
                    )}
                >
                    {children}
                </div>
            </div>
        )
    }
)
Sidebar.displayName = 'Sidebar'

const SidebarTrigger = React.forwardRef<
    React.ComponentRef<typeof Button>,
    React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
    const { toggleSidebar } = useSidebar()

    return (
        <Button
            ref={ref}
            data-sidebar="trigger"
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', className)}
            onClick={(event) => {
                onClick?.(event)
                toggleSidebar()
            }}
            {...props}
        >
            <IconLayoutSidebar className="h-4 w-4" />
            <span className="sr-only">Toggle Sidebar</span>
        </Button>
    )
})
SidebarTrigger.displayName = 'SidebarTrigger'

const SidebarRail = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'>
>(({ className, ...props }, ref) => {
    const { toggleSidebar } = useSidebar()

    return (
        <button
            ref={ref}
            data-sidebar="rail"
            aria-label="Toggle Sidebar"
            tabIndex={-1}
            onClick={toggleSidebar}
            title="Toggle Sidebar"
            className={cn(
                'absolute right-0 top-0 bottom-0 z-20 w-1 cursor-ew-resize',
                'hover:bg-sidebar-border transition-colors',
                'group-data-[state=collapsed]:hidden',
                className
            )}
            {...props}
        />
    )
})
SidebarRail.displayName = 'SidebarRail'

/**
 * SidebarInset - Main content area next to the sidebar
 * 
 * For inset variant, this gets rounded corners and shadow to match.
 */
const SidebarInset = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'main'>
>(({ className, ...props }, ref) => {
    return (
        <main
            ref={ref}
            className={cn(
                'relative flex min-w-0 flex-1 flex-col bg-background overflow-hidden',
                // Inset variant styling - margin on right and bottom only (no top gap)
                'peer-data-[variant=inset]:mr-2 peer-data-[variant=inset]:mb-2 peer-data-[variant=inset]:shadow-sm peer-data-[variant=inset]:border peer-data-[variant=inset]:border-border peer-data-[variant=inset]:rounded-lg',
                // When sidebar is collapsed, add left margin
                'peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2',
                className
            )}
            {...props}
        />
    )
})
SidebarInset.displayName = 'SidebarInset'

const SidebarInput = React.forwardRef<
    React.ComponentRef<typeof Input>,
    React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
    return (
        <Input
            ref={ref}
            data-sidebar="input"
            className={cn(
                'h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                className
            )}
            {...props}
        />
    )
})
SidebarInput.displayName = 'SidebarInput'

const SidebarHeader = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            data-sidebar="header"
            className={cn('flex flex-col gap-2 p-2 shrink-0', className)}
            {...props}
        />
    )
})
SidebarHeader.displayName = 'SidebarHeader'

const SidebarFooter = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            data-sidebar="footer"
            className={cn('flex flex-col gap-2 p-2 shrink-0', className)}
            {...props}
        />
    )
})
SidebarFooter.displayName = 'SidebarFooter'

const SidebarSeparator = React.forwardRef<
    React.ComponentRef<typeof Separator>,
    React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => {
    return (
        <Separator
            ref={ref}
            data-sidebar="separator"
            className={cn('mx-2 w-auto bg-sidebar-border', className)}
            {...props}
        />
    )
})
SidebarSeparator.displayName = 'SidebarSeparator'

const SidebarContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            data-sidebar="content"
            className={cn(
                'flex min-h-0 flex-1 flex-col gap-2 overflow-auto',
                className
            )}
            {...props}
        />
    )
})
SidebarContent.displayName = 'SidebarContent'

const SidebarGroup = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            data-sidebar="group"
            className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
            {...props}
        />
    )
})
SidebarGroup.displayName = 'SidebarGroup'

const SidebarGroupLabel = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div'

    return (
        <Comp
            ref={ref}
            data-sidebar="group-label"
            className={cn(
                'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
                className
            )}
            {...props}
        />
    )
})
SidebarGroupLabel.displayName = 'SidebarGroupLabel'

const SidebarGroupAction = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    return (
        <Comp
            ref={ref}
            data-sidebar="group-action"
            className={cn(
                'absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
                'after:absolute after:-inset-2 after:md:hidden',
                className
            )}
            {...props}
        />
    )
})
SidebarGroupAction.displayName = 'SidebarGroupAction'

const SidebarGroupContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-sidebar="group-content"
        className={cn('w-full text-sm', className)}
        {...props}
    />
))
SidebarGroupContent.displayName = 'SidebarGroupContent'

const SidebarMenu = React.forwardRef<
    HTMLUListElement,
    React.ComponentProps<'ul'>
>(({ className, ...props }, ref) => (
    <ul
        ref={ref}
        data-sidebar="menu"
        className={cn('flex w-full min-w-0 flex-col gap-1', className)}
        {...props}
    />
))
SidebarMenu.displayName = 'SidebarMenu'

const SidebarMenuItem = React.forwardRef<
    HTMLLIElement,
    React.ComponentProps<'li'>
>(({ className, ...props }, ref) => (
    <li
        ref={ref}
        data-sidebar="menu-item"
        className={cn('group/menu-item relative', className)}
        {...props}
    />
))
SidebarMenuItem.displayName = 'SidebarMenuItem'

const sidebarMenuButtonVariants = cva(
    'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
    {
        variants: {
            variant: {
                default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                outline:
                    'bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]'
            },
            size: {
                default: 'h-8 text-sm',
                sm: 'h-7 text-xs',
                lg: 'h-12 text-sm'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
)

const SidebarMenuButton = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'> & {
        asChild?: boolean
        isActive?: boolean
        tooltip?: string | React.ComponentProps<typeof TooltipContent>
    } & VariantProps<typeof sidebarMenuButtonVariants>
>(
    (
        {
            asChild = false,
            isActive = false,
            variant = 'default',
            size = 'default',
            tooltip,
            className,
            ...props
        },
        ref
    ) => {
        const Comp = asChild ? Slot : 'button'
        const { state } = useSidebar()

        const button = (
            <Comp
                ref={ref}
                data-sidebar="menu-button"
                data-size={size}
                data-active={isActive}
                className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
                {...props}
            />
        )

        if (!tooltip) {
            return button
        }

        if (typeof tooltip === 'string') {
            tooltip = { children: tooltip }
        }

        return (
            <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent
                    side="right"
                    align="center"
                    hidden={state !== 'collapsed'}
                    {...tooltip}
                />
            </Tooltip>
        )
    }
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

const SidebarMenuAction = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'> & {
        asChild?: boolean
        showOnHover?: boolean
    }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    return (
        <Comp
            ref={ref}
            data-sidebar="menu-action"
            className={cn(
                'absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
                'after:absolute after:-inset-2 after:md:hidden',
                showOnHover &&
                    'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0',
                className
            )}
            {...props}
        />
    )
})
SidebarMenuAction.displayName = 'SidebarMenuAction'

const SidebarMenuBadge = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-sidebar="menu-badge"
        className={cn(
            'pointer-events-none absolute right-1 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground',
            className
        )}
        {...props}
    />
))
SidebarMenuBadge.displayName = 'SidebarMenuBadge'

const SidebarMenuSkeleton = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> & { showIcon?: boolean }
>(({ className, showIcon = false, ...props }, ref) => {
    const width = React.useMemo(() => `${Math.floor(Math.random() * 40) + 50}%`, [])

    return (
        <div
            ref={ref}
            data-sidebar="menu-skeleton"
            className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
            {...props}
        >
            {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
            <Skeleton
                className="h-4 max-w-[--skeleton-width] flex-1"
                data-sidebar="menu-skeleton-text"
                style={{ '--skeleton-width': width } as React.CSSProperties}
            />
        </div>
    )
})
SidebarMenuSkeleton.displayName = 'SidebarMenuSkeleton'

const SidebarMenuSub = React.forwardRef<
    HTMLUListElement,
    React.ComponentProps<'ul'>
>(({ className, ...props }, ref) => (
    <ul
        ref={ref}
        data-sidebar="menu-sub"
        className={cn(
            'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
            className
        )}
        {...props}
    />
))
SidebarMenuSub.displayName = 'SidebarMenuSub'

const SidebarMenuSubItem = React.forwardRef<
    HTMLLIElement,
    React.ComponentProps<'li'>
>(({ ...props }, ref) => <li ref={ref} {...props} />)
SidebarMenuSubItem.displayName = 'SidebarMenuSubItem'

const SidebarMenuSubButton = React.forwardRef<
    HTMLAnchorElement,
    React.ComponentProps<'a'> & {
        asChild?: boolean
        size?: 'sm' | 'md'
        isActive?: boolean
    }
>(({ asChild = false, size = 'md', isActive, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'a'

    return (
        <Comp
            ref={ref}
            data-sidebar="menu-sub-button"
            data-size={size}
            data-active={isActive}
            className={cn(
                'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
                'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
                size === 'sm' && 'text-xs',
                size === 'md' && 'text-sm',
                className
            )}
            {...props}
        />
    )
})
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton'

export {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInput,
    SidebarInset,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSkeleton,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarProvider,
    SidebarRail,
    SidebarSeparator,
    SidebarTrigger,
    useSidebar
}
