/**
 * Document files panel for OpenAI File Search
 * Shows uploaded documents for a chat's vector store
 */
import { useState, useEffect } from 'react'
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
    IconInfoCircle,
    IconChevronDown,
    IconChevronRight,
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
    className?: string
}

function FileItem({ file, onDelete, isDeleting, className }: FileItemProps) {
    const isUploading = 'status' in file && (file.status === 'uploading' || file.status === 'processing')
    const hasError = 'error' in file && file.error
    
    return (
        <div className={cn(
            "group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/50 transition-colors",
            hasError && "bg-destructive/10",
            className
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
    
    const [isExpanded, setIsExpanded] = useState(false)
    const [isMinimized, setIsMinimized] = useState(false)
    const showStack = allFiles.length >= 3 && !isExpanded && !isMinimized

    useEffect(() => {
        if (allFiles.length < 3) setIsExpanded(false)
    }, [allFiles.length])

    if (allFiles.length === 0) {
        return null
    }
    
    return (
        <TooltipProvider delayDuration={0}>
            <div className={cn("flex flex-col gap-1", className)}>
                <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                        <button 
                            type="button"
                            onClick={() => setIsMinimized(!isMinimized)}
                            className="flex items-center gap-1.5 group cursor-pointer outline-none"
                        >
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
                                Knowledge Base
                            </h3>
                            {isMinimized ? (
                                <IconChevronRight size={10} className="text-muted-foreground/30 transition-transform" />
                            ) : (
                                <IconChevronDown size={10} className="text-muted-foreground/30 transition-transform" />
                            )}
                        </button>
                        <Tooltip>
                            <TooltipTrigger>
                                <IconInfoCircle size={10} className="text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p className="text-xs">Files uploaded to this chat's vector store for AI search</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    {allFiles.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setIsMinimized(!isMinimized)}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-600/10 border border-blue-600/20 hover:bg-blue-600/20 transition-all animate-in fade-in zoom-in duration-300 group/badge outline-none"
                        >
                            <IconFile size={8} className="text-blue-500 group-hover/badge:scale-110 transition-transform" />
                            <span className="text-[9px] font-black text-blue-500/80 group-hover/badge:text-blue-500 transition-colors uppercase tracking-wider">
                                {allFiles.length} {allFiles.length === 1 ? 'doc' : 'docs'}
                            </span>
                        </button>
                    )}
                </div>
                
                {!isMinimized && (
                    showStack ? (
                        <div className="grid grid-cols-3 gap-2 mt-2 mb-2">
                            {allFiles.slice(0, 3).map((file, idx) => (
                                <button 
                                    key={file.id || idx}
                                    type="button"
                                    onClick={() => setIsExpanded(true)}
                                    className={cn(
                                        "bg-zinc-800/30 border border-white/5 rounded-xl p-2 h-[64px]",
                                        "flex flex-col justify-center gap-1 transition-all duration-300 ease-out",
                                        "hover:bg-zinc-800/60 hover:scale-[1.04] hover:border-white/10 hover:shadow-2xl hover:shadow-black/40",
                                        "relative group text-left outline-none focus-visible:ring-2 focus-visible:ring-primary overflow-hidden"
                                    )}
                                >
                                    <FileItem file={file} className="p-0 border-0 bg-transparent shadow-none w-full scale-[0.9] origin-left" />
                                    
                                    {idx === 2 && allFiles.length > 3 && (
                                        <>
                                            {/* Floating Badge */}
                                            <div className="absolute top-1 right-1 z-10 bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-lg ring-1 ring-white/20">
                                                +{allFiles.length - 3}
                                            </div>
                                            
                                            {/* Glass Overlay on Hover */}
                                            <div className="absolute inset-0 bg-blue-600/10 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                                                <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.1em] drop-shadow-md">
                                                    Show all
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto animate-in fade-in duration-300 slide-in-from-top-2">
                            {allFiles.map((file) => (
                                <FileItem
                                    key={file.id}
                                    file={file}
                                    onDelete={file.id ? () => deleteDocument(file.id) : undefined}
                                    isDeleting={isDeleting}
                                />
                            ))}
                            {allFiles.length >= 3 && (
                                <button
                                    type="button"
                                    onClick={() => setIsExpanded(false)}
                                    className="mt-3 group flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-white/5 bg-zinc-800/20 hover:bg-zinc-800/40 hover:border-white/10 transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                                >
                                    <IconX size={12} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                                        Show less
                                    </span>
                                </button>
                            )}
                        </div>
                    )
                )}
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
