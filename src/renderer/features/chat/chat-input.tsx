import { useRef, useEffect, useState, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { AnimatedLogo } from './animated-logo'
import { TextShimmer } from '@/components/ui/text-shimmer'
import {
    IconArrowUp,
    IconPlayerStop,
    IconAt,
    IconPaperclip,
    IconBrain,
    IconFileUpload,
    IconFile,
    IconX,
    IconLoader2,
    IconListCheck,
    IconSparkles,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { ImageAttachmentItem } from '@/components/image-attachment-item'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    chatModeAtom,
    isPlanModeAtom,
    currentProviderAtom,
    selectedModelAtom,
    reasoningEffortAtom,
    streamingToolCallsAtom,
    streamingWebSearchesAtom,
    streamingReasoningAtom,
    isReasoningAtom,
    allModelsGroupedAtom,
    type ReasoningEffort,
} from '@/lib/atoms'

import { useFileUpload } from '@/lib/use-file-upload'
import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { ModelIcon } from '@/components/icons/model-icons'
import { AI_MODELS } from '@shared/ai-types'

interface ChatInputProps {
    value: string
    onChange: (value: string) => void
    onSend: (images?: Array<{ base64Data: string; mediaType: string; filename: string }>, documents?: File[]) => void
    onStop?: () => void
    isLoading: boolean
    streamingText?: string
}

export function ChatInput({ value, onChange, onSend, onStop, isLoading, streamingText }: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const docInputRef = useRef<HTMLInputElement>(null)
    const [, setMode] = useAtom(chatModeAtom)
    const [isPlanMode, setIsPlanMode] = useAtom(isPlanModeAtom)
    const [_provider, setProvider] = useAtom(currentProviderAtom)
    const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom)
    const allModelsGrouped = useAtomValue(allModelsGroupedAtom)
    const [reasoningEffort, setReasoningEffort] = useAtom(reasoningEffortAtom)
    const streamingToolCalls = useAtomValue(streamingToolCallsAtom)
    const streamingWebSearches = useAtomValue(streamingWebSearchesAtom)
    const streamingReasoning = useAtomValue(streamingReasoningAtom)
    const isReasoning = useAtomValue(isReasoningAtom)
    
    // Get current model info for display
    const currentModelInfo = AI_MODELS[selectedModel]

    // Sync isPlanMode with mode
    useEffect(() => {
        setMode(isPlanMode ? 'plan' : 'agent')
    }, [isPlanMode, setMode])

    useEffect(() => {
        const allowedEfforts = new Set(['low', 'medium', 'high'])
        if (!allowedEfforts.has(reasoningEffort)) {
            setReasoningEffort('low')
        }
    }, [reasoningEffort, setReasoningEffort])
    
    // Use the new file upload hook
    const {
        images,
        files,
        handleAddAttachments,
        removeImage,
        removeFile,
        clearAll,
        isUploading,
        compressionStats,
        maxFiles,
    } = useFileUpload()
    
    // Drag and drop state
    const [isDragOver, setIsDragOver] = useState(false)

    // Auto-resize textarea when value changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: value is intentionally in deps to trigger resize
    useEffect(() => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.style.height = 'auto'
            textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`
        }
    }, [value])

    // Focus textarea on mount
    useEffect(() => {
        textareaRef.current?.focus()
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Shift+Tab to toggle Plan/Agent mode
        if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault()
            setIsPlanMode(prev => !prev)
            return
        }
        
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!isLoading && canSend) {
                handleSend()
            }
        }
    }

    const canSend = (value.trim().length > 0 || images.length > 0 || files.length > 0) && !isLoading && !isUploading

    const handleModelChange = (modelId: string) => {
        setSelectedModel(modelId)
        // Get the provider from the model definition
        const modelDef = AI_MODELS[modelId]
        if (modelDef) {
            setProvider(modelDef.provider)
        }
    }

    const handleSend = useCallback(() => {
        if (!canSend) return
        
        // Prepare images for sending
        const imageData = images
            .filter(img => img.base64Data && img.mediaType)
            .map(img => ({
                base64Data: img.base64Data!,
                mediaType: img.mediaType!,
                filename: img.filename,
            }))
        
        // Get raw File objects for documents
        const documentFiles = files
            .filter(f => f.base64Data)
            .map(f => new File([Uint8Array.from(atob(f.base64Data!), c => c.charCodeAt(0))], f.filename, { type: f.type }))
        
        onSend(imageData.length > 0 ? imageData : undefined, documentFiles.length > 0 ? documentFiles : undefined)
        clearAll()
    }, [canSend, images, files, onSend, clearAll])

    // Paste handler for images
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return

        const imageFiles: File[] = []
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile()
                if (file) {
                    imageFiles.push(file)
                }
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault()
            handleAddAttachments(imageFiles)
        }
    }, [handleAddAttachments])

    // Drag and drop handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)

        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
        if (files.length > 0) {
            handleAddAttachments(files)
        }
        
        // Focus textarea after drop
        textareaRef.current?.focus()
    }, [handleAddAttachments])

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (files && files.length > 0) {
            handleAddAttachments(Array.from(files))
        }
        // Reset input to allow selecting same file again
        e.target.value = ''
    }, [handleAddAttachments])

    const openFileDialog = () => {
        fileInputRef.current?.click()
    }

    const openDocDialog = () => {
        docInputRef.current?.click()
    }

    const handleDocSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files
        if (selectedFiles && selectedFiles.length > 0) {
            handleAddAttachments(Array.from(selectedFiles))
        }
        // Reset input to allow selecting same file again
        e.target.value = ''
    }, [handleAddAttachments])

    const formatToolName = (name?: string) => {
        if (!name) return 'tool'
        return name.replace(/_/g, ' ')
    }

    const truncate = (value: string, max = 44) => {
        if (value.length <= max) return value
        return `${value.slice(0, max)}…`
    }

    const activeSearch = streamingWebSearches.find(ws => ws.status === 'searching')
    const latestSearchDone = [...streamingWebSearches].reverse().find(ws => ws.status === 'done')
    const activeTool = streamingToolCalls.find(tc => tc.status === 'executing' || tc.status === 'streaming')

    const statusLabel = (() => {
        if (!isLoading) return ''
        if (activeSearch?.query) {
            return truncate(`Searching: ${activeSearch.query}`)
        }
        if (activeSearch) {
            return 'Searching the web'
        }
        if (activeTool) {
            return truncate(`Running ${formatToolName(activeTool.name)}`)
        }
        if (isReasoning || streamingReasoning) {
            return 'Thinking'
        }
        if (streamingText && streamingText.length > 0) {
            return 'Responding'
        }
        if (latestSearchDone?.action === 'open_page') {
            return 'Opening page'
        }
        if (latestSearchDone?.action === 'find_in_page') {
            return 'Scanning page'
        }
        if (latestSearchDone) {
            return 'Web search complete'
        }
        return 'Responding'
    })()

    // Build allImages array for gallery navigation
    const allImagesData = images
        .filter(img => img.url && !img.isLoading)
        .map(img => ({
            id: img.id,
            filename: img.filename,
            url: img.url,
        }))

    return (
        /* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: drag events for file drop zone */
        // biome-ignore lint/a11y/useSemanticElements: drag events for file drop zone
        <div 
            role="region"
            aria-label="Chat input with file drop zone"
            className="relative flex flex-col gap-2 w-full max-w-3xl mx-auto px-4 pb-4"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
                className="hidden"
            />
            
            {/* Hidden document input for vector store uploads */}
            <input
                ref={docInputRef}
                type="file"
                multiple
                onChange={handleDocSelect}
                className="hidden"
            />

            {/* Status Indicator - Unified Animated Tab */}
            <div className={cn(
                "absolute -top-[30px] left-8 z-30 transition-all duration-700 ease-in-out",
                isLoading ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
            )}>
                <div className="flex items-center gap-3 px-4 py-1.5 rounded-t-2xl bg-background/90 backdrop-blur-3xl border border-border border-b-transparent shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.5)] min-w-[140px]">
                    <AnimatedLogo className="w-3.5 h-3.5" />
                    <TextShimmer 
                        as="span" 
                        className="text-[10px] font-black tracking-[0.25em] uppercase italic"
                        duration={1.5}
                        spread={1.5}
                    >
                        {statusLabel}...
                    </TextShimmer>
                </div>
            </div>

            {/* Main Input Container */}
            <div className={cn(
                "relative flex flex-col bg-background/50 backdrop-blur-xl rounded-[24px] border border-border shadow-2xl transition-all duration-300 group px-2 pt-2 pb-2",
                "focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/5",
                isDragOver && "border-primary/50 ring-4 ring-primary/10",
                isLoading && "pb-3"
            )}>
                {/* Inline Image Previews */}
                {images.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                        {images.map((img, idx) => (
                            <ImageAttachmentItem
                                key={img.id}
                                id={img.id}
                                filename={img.filename}
                                url={img.url}
                                isLoading={img.isLoading}
                                onRemove={() => removeImage(img.id)}
                                allImages={allImagesData}
                                imageIndex={idx}
                                originalSize={img.originalSize}
                                compressedSize={img.compressedSize}
                                compressionRatio={img.compressionRatio}
                                status={img.status}
                            />
                        ))}
                        
                        {/* Compression summary (shows after compression completes) */}
                        {compressionStats && compressionStats.totalOriginal > compressionStats.totalCompressed && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20 text-[10px] text-green-600 dark:text-green-400 ml-auto">
                                <span className="font-medium">
                                    Saved {((1 - compressionStats.totalCompressed / compressionStats.totalOriginal) * 100).toFixed(0)}%
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Inline Document Previews */}
                {files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                        {files.map((file) => (
                            <div
                                key={file.id}
                                className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent/50 border border-border/50 hover:border-border transition-colors"
                            >
                                <IconFile size={14} className="text-muted-foreground shrink-0" />
                                <span className="text-xs font-medium truncate max-w-[120px]">
                                    {file.filename}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {(file.size ? (file.size / 1024).toFixed(0) : 0)} KB
                                </span>
                                {file.isLoading ? (
                                    <IconLoader2 size={12} className="animate-spin text-muted-foreground" />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => removeFile(file.id)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-destructive/20 rounded"
                                    >
                                        <IconX size={12} className="text-muted-foreground hover:text-destructive" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Drop overlay */}
                {isDragOver && (
                    <div className="absolute inset-0 bg-primary/5 rounded-[24px] flex items-center justify-center z-10 pointer-events-none">
                        <p className="text-sm font-medium text-primary">Drop images here</p>
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="@ for context"
                    className="w-full bg-transparent resize-none outline-none text-[15px] leading-relaxed min-h-[60px] max-h-[400px] pt-2 pb-2 px-3 placeholder:text-muted-foreground/40 transition-all font-normal"
                    rows={1}
                    disabled={isLoading}
                />

                {/* Bottom Bar Controls */}
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-0.5">
                        {/* Agent/Plan Mode Toggle */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setIsPlanMode(false)}
                                        className={cn(
                                            "h-7 px-2.5 rounded-l-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                                            !isPlanMode 
                                                ? "bg-foreground text-background" 
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                        )}
                                    >
                                        <IconSparkles size={14} />
                                        Agent
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsPlanMode(true)}
                                        className={cn(
                                            "h-7 px-2.5 rounded-r-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                                            isPlanMode 
                                                ? "bg-[hsl(var(--plan-mode))] text-[hsl(var(--plan-mode-foreground))]" 
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                        )}
                                    >
                                        <IconListCheck size={14} />
                                        Plan
                                    </button>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Toggle mode <span className="text-muted-foreground ml-1">⇧Tab</span></p>
                            </TooltipContent>
                        </Tooltip>

                        <div className="w-px h-3.5 bg-border/40 mx-1" />

                        {/* Model Selector with Icons */}
                        <Select value={selectedModel} onValueChange={handleModelChange}>
                            <SelectTrigger className="h-8 w-auto px-2.5 bg-transparent border-none shadow-none hover:bg-accent/50 gap-1.5 rounded-xl text-xs font-semibold">
                                <ModelIcon provider={currentModelInfo?.provider || 'openai'} size={14} className="text-muted-foreground" />
                                <SelectValue>{currentModelInfo?.name || selectedModel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent className="rounded-xl shadow-xl border-border/50 min-w-[200px]">
                                <div className="text-[10px] font-bold uppercase text-muted-foreground/50 px-3 py-2 flex items-center gap-1.5">
                                    <ModelIcon provider="openai" size={12} />
                                    OpenAI GPT-5
                                </div>
                                {allModelsGrouped.openai.map((model) => (
                                    <SelectItem key={model.id} value={model.id} className="rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <span>{model.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="w-px h-3.5 bg-border/40 mx-1" />

                        {/* Reasoning Effort Selector */}
                        <Select value={reasoningEffort} onValueChange={(v: ReasoningEffort) => setReasoningEffort(v)}>
                            <SelectTrigger className="h-8 w-auto px-2.5 bg-transparent border-none shadow-none hover:bg-accent/50 gap-1.5 rounded-xl text-xs font-semibold">
                                <IconBrain size={14} className="transition-colors text-violet-500" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl shadow-xl border-border/50 min-w-[140px]">
                                <div className="text-[10px] font-bold uppercase text-muted-foreground/50 px-3 py-2">
                                    Reasoning Depth
                                </div>
                                <SelectItem value="low" className="rounded-lg">Low</SelectItem>
                                <SelectItem value="medium" className="rounded-lg">Medium</SelectItem>
                                <SelectItem value="high" className="rounded-lg">High</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1">
                        <TooltipProvider delayDuration={0}>
                            <div className="flex items-center gap-0.5 mr-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button 
                                            type="button"
                                            variant="ghost" 
                                            size="icon" 
                                            className={cn(
                                                "h-8 w-8 text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 rounded-xl",
                                                images.length > 0 && "bg-accent/50 text-foreground"
                                            )}
                                            onClick={openFileDialog}
                                            disabled={images.length >= maxFiles || isLoading}
                                        >
                                            <IconPaperclip size={18} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{images.length >= maxFiles ? `${maxFiles} images max` : 'Attach images'}</p>
                                    </TooltipContent>
                                </Tooltip>

                                {/* Document upload button for file search */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button 
                                            type="button"
                                            variant="ghost" 
                                            size="icon" 
                                            className={cn(
                                                "h-8 w-8 text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 rounded-xl relative",
                                                files.length > 0 && "bg-accent/50 text-foreground"
                                            )}
                                            onClick={openDocDialog}
                                            disabled={isLoading || isUploading}
                                        >
                                            <IconFileUpload size={18} />
                                            {files.length > 0 && (
                                                <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
                                                    {files.length > 9 ? '9+' : files.length}
                                                </span>
                                            )}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{isUploading ? 'Processing...' : 'Attach documents (PDF, Word, etc.)'}</p>
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 rounded-xl">
                                            <IconAt size={18} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Mention context</p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </TooltipProvider>

                        {isLoading ? (
                            <Button
                                type="button"
                                size="icon"
                                className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all shrink-0"
                                onClick={onStop}
                            >
                                <IconPlayerStop size={14} fill="currentColor" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 rounded-full transition-all shrink-0",
                                    canSend
                                        ? isPlanMode
                                            ? "bg-[hsl(var(--plan-mode))] text-[hsl(var(--plan-mode-foreground))] hover:bg-[hsl(var(--plan-mode))]/90 shadow-lg shadow-[hsl(var(--plan-mode))]/20"
                                            : "bg-foreground text-background hover:bg-foreground/90 shadow-lg shadow-foreground/10"
                                        : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                                )}
                                onClick={handleSend}
                                disabled={!canSend}
                            >
                                <IconArrowUp size={18} strokeWidth={2.5} />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
