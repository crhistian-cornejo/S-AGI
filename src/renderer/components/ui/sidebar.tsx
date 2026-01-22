import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type SidebarVariant = 'sidebar' | 'floating' | 'inset'
type SidebarSide = 'left' | 'right'
type SidebarCollapsible = 'offcanvas' | 'icon' | 'none'

interface SidebarContextValue {
    open: boolean
    setOpen: (open: boolean) => void
    toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function useSidebar() {
    const ctx = React.useContext(SidebarContext)
    if (!ctx) {
        throw new Error('useSidebar must be used within SidebarProvider')
    }
    return ctx
}

interface SidebarProviderProps extends React.HTMLAttributes<HTMLDivElement> {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export function SidebarProvider({
    defaultOpen = true,
    open: openProp,
    onOpenChange,
    className,
    style,
    children,
    ...props
}: SidebarProviderProps) {
    const [openState, setOpenState] = React.useState(defaultOpen)
    const open = openProp ?? openState

    const setOpen = React.useCallback((value: boolean) => {
        if (openProp === undefined) {
            setOpenState(value)
        }
        onOpenChange?.(value)
    }, [openProp, onOpenChange])

    const toggleSidebar = React.useCallback(() => {
        setOpen(!open)
    }, [open, setOpen])

    return (
        <SidebarContext.Provider value={{ open, setOpen, toggleSidebar }}>
            <div
                className={cn('relative flex h-full w-full', className)}
                style={style}
                {...props}
            >
                {children}
            </div>
        </SidebarContext.Provider>
    )
}

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    side?: SidebarSide
    variant?: SidebarVariant
    collapsible?: SidebarCollapsible
}

export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
    ({
        side = 'left',
        variant = 'sidebar',
        collapsible = 'offcanvas',
        className,
        style,
        ...props
    }, ref) => {
        const { open } = useSidebar()
        const isFloating = variant === 'floating'
        const isInset = variant === 'inset'
        const isOffcanvas = collapsible === 'offcanvas'

        const sideClass = side === 'left' ? 'left-0' : 'right-0'
        const floatingSide = side === 'left' ? 'left-3' : 'right-3'
        const closedTranslate = side === 'left' ? '-translate-x-full' : 'translate-x-full'

        const containerBase = cn(
            'z-40 flex h-full w-[var(--sidebar-width)] flex-col transition-transform duration-300 ease-in-out',
            'bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]',
            isOffcanvas && !open ? closedTranslate : 'translate-x-0',
            !open && isOffcanvas ? 'pointer-events-none' : 'pointer-events-auto',
            isFloating
                ? cn('fixed top-3 bottom-3', floatingSide, 'rounded-2xl border border-[hsl(var(--sidebar-border))] shadow-xl')
                : isInset
                    ? cn('absolute inset-y-3', floatingSide, 'rounded-2xl border border-[hsl(var(--sidebar-border))]')
                    : cn('relative', sideClass, 'border-r border-[hsl(var(--sidebar-border))]')
        )

        return (
            <div
                ref={ref}
                className={cn(containerBase, className)}
                style={style}
                data-state={open ? 'expanded' : 'collapsed'}
                {...props}
            />
        )
    }
)
Sidebar.displayName = 'Sidebar'

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('sticky top-0 z-10 border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))]', className)}
            {...props}
        />
    )
)
SidebarHeader.displayName = 'SidebarHeader'

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('sticky bottom-0 z-10 border-t border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))]', className)}
            {...props}
        />
    )
)
SidebarFooter.displayName = 'SidebarFooter'

export const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('flex-1 overflow-y-auto', className)}
            {...props}
        />
    )
)
SidebarContent.displayName = 'SidebarContent'

export const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('flex-1 min-w-0', className)}
            {...props}
        />
    )
)
SidebarInset.displayName = 'SidebarInset'

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ className, onClick, children, ...props }, ref) => {
        const { toggleSidebar } = useSidebar()
        return (
            <button
                ref={ref}
                type="button"
                className={cn(className)}
                onClick={(event) => {
                    onClick?.(event)
                    toggleSidebar()
                }}
                {...props}
            >
                {children}
            </button>
        )
    }
)
SidebarTrigger.displayName = 'SidebarTrigger'

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("relative flex w-full min-w-0 flex-col p-2", className)} {...props} />
    )
)
SidebarGroup.displayName = "SidebarGroup"

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }>(
    ({ className, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "div"
        return (
            <Comp
                ref={ref}
                className={cn(
                    "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
                    className
                )}
                {...props}
            />
        )
    }
)
SidebarGroupLabel.displayName = "SidebarGroupLabel"

export const SidebarGroupAction = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
    ({ className, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                ref={ref}
                className={cn(
                    "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
                    "after:absolute after:-inset-2 after:md:hidden",
                    "group-data-[collapsible=icon]:hidden",
                    className
                )}
                {...props}
            />
        )
    }
)
SidebarGroupAction.displayName = "SidebarGroupAction"

export const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("w-full text-sm", className)} {...props} />
    )
)
SidebarGroupContent.displayName = "SidebarGroupContent"

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
    ({ className, ...props }, ref) => (
        <ul ref={ref} className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />
    )
)
SidebarMenu.displayName = "SidebarMenu"

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
    ({ className, ...props }, ref) => (
        <li ref={ref} className={cn("group/menu-item relative", className)} {...props} />
    )
)
SidebarMenuItem.displayName = "SidebarMenuItem"

export const SidebarMenuButton = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
        asChild?: boolean
        isActive?: boolean
        tooltip?: string | React.ComponentProps<typeof TooltipContent>
    }
>(
    ({ className, asChild = false, isActive = false, tooltip, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        const { open } = useSidebar()
        const isMobile = false // Assume false for desktop app for now, or get from context if available

        const button = (
            <Comp
                ref={ref}
                data-sidebar="menu-button"
                data-size="default"
                data-active={isActive}
                className={cn(
                    "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
                    className
                )}
                {...props}
            />
        )

        if (!tooltip) {
            return button
        }

        if (typeof tooltip === "string") {
            tooltip = {
                children: tooltip,
            }
        }

        return (
            <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent
                    side="right"
                    align="center"
                    hidden={open || isMobile}
                    {...tooltip}
                />
            </Tooltip>
        )
    }
)
SidebarMenuButton.displayName = "SidebarMenuButton"
