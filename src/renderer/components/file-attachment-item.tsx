import { 
    IconFile, 
    IconX, 
    IconFileTypePdf, 
    IconFileTypeDoc, 
    IconFileTypeTxt, 
    IconFileCode, // For generic code/json
    IconPhoto,    // For images
    IconTable,    // For spreadsheets (xls, csv)
    IconFileZip,  // For archives
} from '@tabler/icons-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface FileAttachmentItemProps {
    id: string
    filename: string
    size?: number
    isLoading?: boolean
    onRemove: (id: string) => void
    className?: string
}

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(0)) + ' ' + sizes[i]
}

const getFileIconConfig = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    
    switch (ext) {
        case 'pdf':
            return { Icon: IconFileTypePdf, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' }
        case 'doc':
        case 'docx':
            return { Icon: IconFileTypeDoc, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' }
        case 'xls':
        case 'xlsx':
        case 'csv':
            return { Icon: IconTable, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' }
        case 'txt':
        case 'md':
        case 'markdown':
            return { Icon: IconFileTypeTxt, color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' }
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'webp':
        case 'svg':
            return { Icon: IconPhoto, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' }
        case 'zip':
        case 'rar':
        case '7z':
        case 'tar':
        case 'gz':
            return { Icon: IconFileZip, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' }
        case 'js':
        case 'jsx':
        case 'ts':
        case 'tsx':
        case 'html':
        case 'css':
        case 'json':
        case 'py':
        case 'go':
        case 'java':
        case 'c':
        case 'cpp':
            return { Icon: IconFileCode, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' }
        default:
            return { Icon: IconFile, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' }
    }
}

export function FileAttachmentItem({
    id,
    filename,
    size,
    isLoading,
    onRemove,
    className
}: FileAttachmentItemProps) {
    const { Icon, color, bg, border } = getFileIconConfig(filename)

    return (
        <div className={cn(
            "relative flex items-center gap-3 px-3 py-2 rounded-xl border bg-background/50 backdrop-blur-sm group transition-all animate-in fade-in zoom-in duration-200",
            border, // Use the specific border color lightly
            className
        )}>
            <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg transition-colors", bg, color)}>
                <Icon size={18} stroke={1.5} />
            </div>
            <div className="flex flex-col min-w-0 pr-6">
                <span className="text-xs font-medium truncate max-w-[140px] text-foreground/90">
                    {filename}
                </span>
                {size && (
                    <span className="text-[10px] text-muted-foreground/70">
                        {formatFileSize(size)}
                    </span>
                )}
                {isLoading && (
                    <div className="w-full h-0.5 bg-border rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-primary animate-progress origin-left" />
                    </div>
                )}
            </div>
            
            <Button
                variant="ghost"
                size="icon"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity p-0 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                onClick={() => onRemove(id)}
            >
                <IconX size={10} />
            </Button>
        </div>
    )
}
