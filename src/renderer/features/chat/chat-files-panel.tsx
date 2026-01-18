/**
 * Document files panel for OpenAI File Search
 * Shows uploaded documents for a chat's vector store
 */
import { useAtomValue } from 'jotai'
import { selectedChatIdAtom } from '@/lib/atoms'
import { useDocumentUpload, type VectorStoreFile, type UploadedDocument } from '@/lib/use-document-upload'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    IconFile,
    IconFileTypePdf,
    IconFileTypeDoc,
    IconFileTypeTxt,
    IconFileTypeJs,
    IconFileTypeCss,
    IconFileTypeHtml,
    IconFileCode,
    IconFileTypeTs,
    IconX,
    IconLoader2,
    IconCheck,
    IconAlertTriangle,
} from '@tabler/icons-react'

interface ChatFilesPanelProps {
    className?: string
}

function getFileIcon(filename: string) {
    const ext = filename.split('.').pop()?.toLowerCase()
    
    switch (ext) {
        case 'pdf':
            return <IconFileTypePdf size={16} className="text-red-500" />
        case 'doc':
        case 'docx':
            return <IconFileTypeDoc size={16} className="text-blue-500" />
        case 'txt':
        case 'md':
            return <IconFileTypeTxt size={16} className="text-muted-foreground" />
        case 'js':
        case 'jsx':
            return <IconFileTypeJs size={16} className="text-yellow-500" />
        case 'ts':
        case 'tsx':
            return <IconFileTypeTs size={16} className="text-blue-400" />
        case 'css':
            return <IconFileTypeCss size={16} className="text-purple-500" />
        case 'html':
            return <IconFileTypeHtml size={16} className="text-orange-500" />
        case 'py':
        case 'java':
        case 'go':
        case 'rb':
        case 'php':
        case 'c':
        case 'cpp':
        case 'cs':
            return <IconFileCode size={16} className="text-green-500" />
        default:
            return <IconFile size={16} className="text-muted-foreground" />
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileStatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'completed':
            return <IconCheck size={12} className="text-green-500" />
        case 'processing':
        case 'in_progress':
            return <IconLoader2 size={12} className="text-blue-500 animate-spin" />
        case 'failed':
            return <IconAlertTriangle size={12} className="text-red-500" />
        default:
            return null
    }
}

interface FileItemProps {
    file: VectorStoreFile | UploadedDocument
    onDelete?: () => void
    isDeleting?: boolean
}

function FileItem({ file, onDelete, isDeleting }: FileItemProps) {
    const isUploading = 'status' in file && (file.status === 'uploading' || file.status === 'processing')
    const hasError = 'error' in file && file.error
    
    return (
        <div className={cn(
            "group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/50 transition-colors",
            hasError && "bg-destructive/10"
        )}>
            {getFileIcon(file.filename)}
            
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{file.filename}</span>
                    <FileStatusIcon status={'status' in file ? file.status : 'completed'} />
                </div>
                {file.bytes && (
                    <span className="text-[10px] text-muted-foreground">
                        {formatFileSize(file.bytes)}
                    </span>
                )}
                {hasError && (
                    <span className="text-[10px] text-destructive truncate block">
                        {(file as UploadedDocument).error}
                    </span>
                )}
            </div>
            
            {onDelete && !isUploading && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={onDelete}
                    disabled={isDeleting}
                >
                    {isDeleting ? (
                        <IconLoader2 size={12} className="animate-spin" />
                    ) : (
                        <IconX size={12} />
                    )}
                </Button>
            )}
        </div>
    )
}

export function ChatFilesPanel({ className }: ChatFilesPanelProps) {
    const chatId = useAtomValue(selectedChatIdAtom)
    
    const {
        files,
        uploadingDocuments,
        deleteDocument,
        isDeleting,
    } = useDocumentUpload({ chatId })
    
    // Combine server files with uploading documents
    const allFiles = [
        ...uploadingDocuments,
        ...files.filter(f => !uploadingDocuments.some(u => u.id === f.id))
    ]
    
    if (allFiles.length === 0) {
        return null
    }
    
    return (
        <TooltipProvider delayDuration={0}>
            <div className={cn("flex flex-col gap-1", className)}>
                <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-wider">
                        Knowledge Base
                    </span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-[9px] text-muted-foreground/40">
                                {files.length} file{files.length !== 1 ? 's' : ''}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            <p className="text-xs">
                                Files uploaded to this chat's vector store for AI search
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </div>
                
                <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
                    {allFiles.map((file) => (
                        <FileItem
                            key={file.id}
                            file={file}
                            onDelete={() => deleteDocument(file.id)}
                            isDeleting={isDeleting}
                        />
                    ))}
                </div>
            </div>
        </TooltipProvider>
    )
}

/**
 * Compact file count badge for the chat input
 */
interface DocumentBadgeProps {
    count: number
    onClick?: () => void
}

export function DocumentBadge({ count, onClick }: DocumentBadgeProps) {
    if (count === 0) return null
    
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors"
        >
            <IconFile size={10} />
            {count}
        </button>
    )
}
