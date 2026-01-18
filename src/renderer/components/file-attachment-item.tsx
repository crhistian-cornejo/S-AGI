import { IconFile, IconX } from '@tabler/icons-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface FileAttachmentItemProps {
    id: string
    filename: string
    isLoading?: boolean
    onRemove: (id: string) => void
    className?: string
}

export function FileAttachmentItem({
    id,
    filename,
    isLoading,
    onRemove,
    className
}: FileAttachmentItemProps) {
    return (
        <div className={cn(
            "relative flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background/50 backdrop-blur-sm group transition-all animate-in fade-in zoom-in duration-200",
            className
        )}>
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary">
                <IconFile size={14} />
            </div>
            <div className="flex flex-col min-w-0 pr-4">
                <span className="text-[11px] font-medium truncate max-w-[120px]">
                    {filename}
                </span>
                {isLoading && (
                    <div className="w-full h-0.5 bg-border rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-primary animate-progress origin-left" />
                    </div>
                )}
            </div>
            
            <Button
                variant="ghost"
                size="icon"
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity p-0"
                onClick={() => onRemove(id)}
            >
                <IconX size={10} />
            </Button>
        </div>
    )
}
