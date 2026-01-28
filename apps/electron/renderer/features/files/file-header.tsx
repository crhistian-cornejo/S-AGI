/**
 * FileHeader - Header component for persistent files
 * Shows file name, save status, version count, and actions
 */
import * as React from "react";
import { useAtomValue } from "jotai";
import {
    IconCheck,
    IconCloud,
    IconDeviceFloppy,
    IconHistory,
    IconDotsVertical,
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconArchive,
    IconTrash,
    IconDownload,
    IconCopy,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ExcelIcon, DocIcon, PdfIcon } from "@/features/agent/icons";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    fileSavingAtom,
    fileSnapshotCacheAtom,
    type UserFile,
} from "@/lib/atoms/user-files";
import { formatTimeAgo } from "@/utils/time-format";

interface FileHeaderProps {
    file: UserFile | null;
    onRename?: (newName: string) => void;
    onTogglePin?: () => void;
    onToggleArchive?: () => void;
    onDelete?: () => void;
    onOpenHistory?: () => void;
    onExport?: () => void;
    onDuplicate?: () => void;
    onSave?: () => void; // Manual save handler
    storageKind?: "cloud" | "local";
    storageLabel?: string;
    storageTooltip?: string;
    className?: string;
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
    onSave,
    storageKind = "cloud",
    storageLabel,
    storageTooltip,
    className,
}: FileHeaderProps) {
    const savingState = useAtomValue(fileSavingAtom);
    const snapshotCache = useAtomValue(fileSnapshotCacheAtom);
    const [isEditing, setIsEditing] = React.useState(false);
    const [editName, setEditName] = React.useState("");
    const inputRef = React.useRef<HTMLInputElement>(null);

    const isSaving = file ? savingState[file.id] || false : false;
    const snapshot = file ? snapshotCache[file.id] : null;
    const hasUnsavedChanges = snapshot?.isDirty || false;
    const lastSavedTime = file?.updated_at
        ? formatTimeAgo(file.updated_at)
        : null;

    // Focus input when editing starts
    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleStartEdit = () => {
        if (file) {
            setEditName(file.name);
            setIsEditing(true);
        }
    };

    const handleSaveEdit = () => {
        if (editName.trim() && onRename && editName !== file?.name) {
            onRename(editName.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSaveEdit();
        } else if (e.key === "Escape") {
            setIsEditing(false);
        }
    };

    const storageInfo = React.useMemo(() => {
        if (!storageKind) return null;
        if (storageKind === "local") {
            return {
                icon: IconDeviceFloppy,
                label: storageLabel || "Local",
                tooltip: storageTooltip || "Guardado en este dispositivo",
            };
        }
        return {
            icon: IconCloud,
            label: storageLabel || "Nube (S-AGI)",
            tooltip: storageTooltip || "Guardado en la nube",
        };
    }, [storageKind, storageLabel, storageTooltip]);

    if (!file) {
        return (
            <div
                className={cn(
                    "h-10 flex items-center px-4 border-b border-border/50 bg-background/50",
                    className,
                )}
            >
                <span className="text-sm text-muted-foreground">No file selected</span>
            </div>
        );
    }

    const getFileTypeIcon = () => {
        switch (file.type) {
            case "excel":
                return "📊";
            case "doc":
                return "📄";
            case "note":
                return "📝";
            default:
                return "📁";
        }
    };

    return (
        <div
            className={cn(
                "h-10 flex items-center justify-between px-3 border-b border-border/50 bg-background/50",
                className,
            )}
        >
            {/* Left: File name and type */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
                {file.type === "excel" ? (
                    <ExcelIcon size={16} />
                ) : file.type === "doc" ? (
                    <DocIcon size={16} />
                ) : file.type === "note" ? (
                    <PdfIcon size={16} />
                ) : (
                    <span className="text-base flex-shrink-0">
                        {file.icon || getFileTypeIcon()}
                    </span>
                )}

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
                        <IconPencil
                            size={12}
                            className="opacity-0 group-hover:opacity-50 transition-opacity duration-150 flex-shrink-0"
                        />
                    </button>
                )}

                {file.is_pinned && (
                    <IconPin size={12} className="text-primary flex-shrink-0" />
                )}
            </div>

            {/* Center: Save status with time */}
            <div className="flex items-center gap-3 px-3">
                {/* Manual Save Button */}
                {onSave && hasUnsavedChanges && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 gap-1.5"
                                onClick={onSave}
                                disabled={isSaving}
                            >
                                <IconDeviceFloppy size={14} />
                                <span className="text-xs">Guardar</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            Guardar cambios manualmente (Ctrl+S)
                        </TooltipContent>
                    </Tooltip>
                )}

                {isSaving ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <IconCloud size={14} className="animate-pulse text-primary" />
                                <span className="text-xs font-medium">Guardando...</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <div>Guardando cambios en la nube</div>
                            {lastSavedTime && (
                                <div className="text-xs mt-1">
                                    Último guardado: {lastSavedTime}
                                </div>
                            )}
                        </TooltipContent>
                    </Tooltip>
                ) : hasUnsavedChanges ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
                                <IconDeviceFloppy size={14} />
                                <span className="text-xs font-medium">Sin guardar</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <div>Hay cambios sin guardar</div>
                            {lastSavedTime && (
                                <div className="text-xs mt-1">
                                    Último guardado: {lastSavedTime}
                                </div>
                            )}
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-500">
                                <IconCheck size={14} />
                                <span className="text-xs font-medium">Guardado</span>
                                {lastSavedTime && (
                                    <span className="text-xs text-muted-foreground/60">
                                        {lastSavedTime}
                                    </span>
                                )}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <div>Todos los cambios guardados</div>
                            {file.updated_at && (
                                <div className="text-xs mt-1">
                                    {new Date(file.updated_at).toLocaleString("es-ES", {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </div>
                            )}
                        </TooltipContent>
                    </Tooltip>
                )}

                {storageInfo && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 text-muted-foreground/60">
                                <storageInfo.icon size={14} />
                                <span className="text-xs">{storageInfo.label}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>{storageInfo.tooltip}</TooltipContent>
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
                            <IconHistory size={14} />
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
                            <IconDotsVertical size={16} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={handleStartEdit}>
                            <IconPencil size={16} className="mr-2" />
                            Renombrar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onTogglePin}>
                            {file.is_pinned ? (
                                <>
                                    <IconPinnedOff size={16} className="mr-2" />
                                    Desfijar
                                </>
                            ) : (
                                <>
                                    <IconPin size={16} className="mr-2" />
                                    Fijar
                                </>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onOpenHistory}>
                            <IconHistory size={16} className="mr-2" />
                            Historial de versiones
                        </DropdownMenuItem>
                        {onDuplicate && (
                            <DropdownMenuItem onClick={onDuplicate}>
                                <IconCopy size={16} className="mr-2" />
                                Duplicar
                            </DropdownMenuItem>
                        )}
                        {onExport && (
                            <DropdownMenuItem onClick={onExport}>
                                <IconDownload size={16} className="mr-2" />
                                Exportar
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onToggleArchive}>
                            <IconArchive size={16} className="mr-2" />
                            {file.is_archived ? "Desarchivar" : "Archivar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onDelete}
                            className="text-destructive focus:text-destructive"
                        >
                            <IconTrash size={16} className="mr-2" />
                            Eliminar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
