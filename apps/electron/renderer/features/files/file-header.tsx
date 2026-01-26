/**
 * FileHeader - Header component for persistent files
 * Shows file name, save status, version count, and actions
 */
import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Check, Cloud, CloudOff, History, MoreHorizontal, Pencil, Pin, PinOff, Archive, Trash2, Download, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fileSavingAtom, type UserFile } from '@/lib/atoms/user-files'

interface FileHeaderProps {
    file: UserFile | null
    onRename?: (newName: string) => void
    onTogglePin?: () => void
    onToggleArchive?: () => void
    onDelete?: () => void
    onOpenHistory?: () => void
    onExport?: () => void
    onDuplicate?: () => void
    className?: string
}

export function FileHeader({
    file,
    onRename,
    onTogglePin,
    onToggleArchive,
    onDelete,
    onOpenHistory,
    onExport,
    onDuplicate,
    className
}: FileHeaderProps) {
    const savingState = useAtomValue(fileSavingAtom)
    const [isEditing, setIsEditing] = React.useState(false)
    const [editName, setEditName] = React.useState('')
    const inputRef = React.useRef<HTMLInputElement>(null)

    const isSaving = file ? savingState[file.id] || false : false

    // Focus input when editing starts
    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleStartEdit = () => {
        if (file) {
            setEditName(file.name)
            setIsEditing(true)
        }
    }

    const handleSaveEdit = () => {
        if (editName.trim() && onRename && editName !== file?.name) {
            onRename(editName.trim())
        }
        setIsEditing(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveEdit()
        } else if (e.key === 'Escape') {
            setIsEditing(false)
        }
    }

    if (!file) {
        return (
            <div className={cn('h-10 flex items-center px-4 border-b border-border/50 bg-background/50', className)}>
                <span className="text-sm text-muted-foreground">No file selected</span>
            </div>
        )
    }

    const getFileTypeIcon = () => {
        switch (file.type) {
            case 'excel':
                return '📊'
            case 'doc':
                return '📄'
            case 'note':
                return '📝'
            default:
                return '📁'
        }
    }

    return (
        <div className={cn('h-10 flex items-center justify-between px-3 border-b border-border/50 bg-background/50', className)}>
            {/* Left: File name and type */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-base flex-shrink-0">{file.icon || getFileTypeIcon()}</span>

                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleSaveEdit}
                        onKeyDown={handleKeyDown}
                        className="flex-1 min-w-0 bg-transparent border-b border-primary text-sm font-medium outline-none"
                    />
                ) : (
                    <button
                        onClick={handleStartEdit}
                        className="flex-1 min-w-0 text-left group flex items-center gap-1"
                    >
                        <span className="text-sm font-medium truncate">{file.name}</span>
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
                    </button>
                )}

                {file.is_pinned && (
                    <Pin className="w-3 h-3 text-primary flex-shrink-0" />
                )}
            </div>

            {/* Center: Save status */}
            <div className="flex items-center gap-2 px-3">
                {isSaving ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <Cloud className="w-3.5 h-3.5 animate-pulse" />
                                <span className="text-xs">Guardando...</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>Guardando cambios</TooltipContent>
                    </Tooltip>
                ) : (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 text-muted-foreground/60">
                                <Check className="w-3.5 h-3.5" />
                                <span className="text-xs">Guardado</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>Todos los cambios guardados</TooltipContent>
                    </Tooltip>
                )}
            </div>

            {/* Right: Version count and actions */}
            <div className="flex items-center gap-1">
                {/* Version history button */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1"
                            onClick={onOpenHistory}
                        >
                            <History className="w-3.5 h-3.5" />
                            <span className="text-xs">v{file.version_count}</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        Historial de versiones ({file.version_count} versiones)
                    </TooltipContent>
                </Tooltip>

                {/* Actions dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={handleStartEdit}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Renombrar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onTogglePin}>
                            {file.is_pinned ? (
                                <>
                                    <PinOff className="w-4 h-4 mr-2" />
                                    Desfijar
                                </>
                            ) : (
                                <>
                                    <Pin className="w-4 h-4 mr-2" />
                                    Fijar
                                </>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onOpenHistory}>
                            <History className="w-4 h-4 mr-2" />
                            Historial de versiones
                        </DropdownMenuItem>
                        {onDuplicate && (
                            <DropdownMenuItem onClick={onDuplicate}>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicar
                            </DropdownMenuItem>
                        )}
                        {onExport && (
                            <DropdownMenuItem onClick={onExport}>
                                <Download className="w-4 h-4 mr-2" />
                                Exportar
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onToggleArchive}>
                            <Archive className="w-4 h-4 mr-2" />
                            {file.is_archived ? 'Desarchivar' : 'Archivar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onDelete}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
