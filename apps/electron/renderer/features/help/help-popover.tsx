import { useState } from 'react'
import { useSetAtom } from 'jotai'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { shortcutsDialogOpenAtom } from '@/lib/atoms'
import { IconKeyboard, IconHelpCircle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

interface HelpPopoverProps {
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function HelpPopover({ children, open: controlledOpen, onOpenChange }: HelpPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const setShortcutsOpen = useSetAtom(shortcutsDialogOpenAtom)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const trigger = children ?? (
    <Button variant="ghost" size="icon" className="h-7 w-7">
      <IconHelpCircle size={14} />
    </Button>
  )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-40">
        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            setShortcutsOpen(true)
          }}
          className="gap-2"
        >
          <IconKeyboard size={14} className="text-muted-foreground shrink-0" />
          <span className="flex-1">Shortcuts</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
