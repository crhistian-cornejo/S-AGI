"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { IconAlertCircle } from "@tabler/icons-react"

interface FontWarningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  missingFonts: string[]
}

export function FontWarningDialog({
  open,
  onOpenChange,
  missingFonts,
}: FontWarningDialogProps) {
  if (missingFonts.length === 0) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <IconAlertCircle className="h-5 w-5 text-amber-500" />
            <AlertDialogTitle className="text-base">
              Fuentes no disponibles
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm pt-2">
            El archivo contiene {missingFonts.length === 1 ? "una fuente" : `${missingFonts.length} fuentes`} que no está{" "}
            {missingFonts.length === 1 ? "disponible" : "disponibles"} en tu sistema:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            {missingFonts.map((font) => (
              <li key={font} className="font-medium">
                {font}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground mt-3">
            Se reemplazarán automáticamente con <span className="font-semibold">Arial</span>.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>
            Entendido
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
