/**
 * Version Diff Viewer Component
 *
 * Shows detailed visual diff between two spreadsheet versions
 * with cell-level highlighting, style changes preview, and side-by-side comparison
 */

import * as React from "react";
import {
  diffWorkbooks,
  type WorkbookDiff,
  type CellChange,
  type StyleChanges,
  type CellStyle,
} from "@/utils/univer-diff";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  IconPlus,
  IconMinus,
  IconRefresh,
  IconTable,
  IconX,
  IconPalette,
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconTextSize,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignJustified,
  IconBorderAll,
  IconTypography,
} from "@tabler/icons-react";

interface VersionDiffViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oldVersion: {
    versionNumber: number;
    data: any;
    createdAt: string;
  } | null;
  newVersion: {
    versionNumber: number;
    data: any;
    createdAt: string;
  } | null;
}

export function VersionDiffViewer({
  open,
  onOpenChange,
  oldVersion,
  newVersion,
}: VersionDiffViewerProps) {
  const diff = React.useMemo(() => {
    if (!oldVersion?.data || !newVersion?.data) return null;
    return diffWorkbooks(oldVersion.data, newVersion.data);
  }, [oldVersion?.data, newVersion?.data]);

  const [selectedSheet, setSelectedSheet] = React.useState<string | null>(null);

  // Auto-select first modified sheet when diff changes
  React.useEffect(() => {
    if (diff && diff.modifiedSheets.length > 0 && !selectedSheet) {
      setSelectedSheet(diff.modifiedSheets[0].sheetId);
    }
  }, [diff, selectedSheet]);

  if (!diff || !oldVersion || !newVersion) {
    return null;
  }

  const selectedSheetData = diff.modifiedSheets.find(
    (s) => s.sheetId === selectedSheet
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg flex items-center gap-2">
              Comparar versiones
              <Badge variant="outline" className="ml-2">
                v{oldVersion.versionNumber} → v{newVersion.versionNumber}
              </Badge>
            </DialogTitle>
          </div>
          <DiffSummary diff={diff} />
        </DialogHeader>

        {/* Sheet tabs if there are multiple modified sheets */}
        {(diff.modifiedSheets.length > 1 ||
          diff.addedSheets.length > 0 ||
          diff.deletedSheets.length > 0) && (
          <div className="px-4 py-2 border-b flex-shrink-0 bg-muted/30">
            <Tabs
              value={selectedSheet || ""}
              onValueChange={setSelectedSheet}
            >
              <TabsList className="h-8">
                {diff.modifiedSheets.map((sheet) => (
                  <TabsTrigger
                    key={sheet.sheetId}
                    value={sheet.sheetId}
                    className="text-xs h-7 px-3"
                  >
                    <IconRefresh size={12} className="mr-1 text-blue-500" />
                    {sheet.sheetName}
                    <Badge
                      variant="secondary"
                      className="ml-1 text-[10px] px-1 h-4"
                    >
                      {sheet.cellChanges.length}
                    </Badge>
                  </TabsTrigger>
                ))}
                {diff.addedSheets.map((sheetId) => (
                  <TabsTrigger
                    key={sheetId}
                    value={sheetId}
                    className="text-xs h-7 px-3"
                    disabled
                  >
                    <IconPlus size={12} className="mr-1 text-green-500" />
                    Nueva hoja
                  </TabsTrigger>
                ))}
                {diff.deletedSheets.map((sheetId) => (
                  <TabsTrigger
                    key={sheetId}
                    value={sheetId}
                    className="text-xs h-7 px-3"
                    disabled
                  >
                    <IconMinus size={12} className="mr-1 text-red-500" />
                    Eliminada
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Cell changes table with scroll */}
        <div className="flex-1 overflow-auto p-4">
          {selectedSheetData ? (
            <CellChangesTable changes={selectedSheetData.cellChanges} />
          ) : diff.modifiedSheets.length === 0 ? (
            <div className="text-center py-12">
              {diff.addedSheets.length > 0 && (
                <p className="text-sm text-green-600">
                  {diff.addedSheets.length} hoja(s) nueva(s) agregada(s)
                </p>
              )}
              {diff.deletedSheets.length > 0 && (
                <p className="text-sm text-red-600">
                  {diff.deletedSheets.length} hoja(s) eliminada(s)
                </p>
              )}
              {diff.addedSheets.length === 0 &&
                diff.deletedSheets.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay cambios en celdas para mostrar
                  </p>
                )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Summary of all changes
function DiffSummary({ diff }: { diff: WorkbookDiff }) {
  const stats = React.useMemo(() => {
    let added = 0,
      modified = 0,
      deleted = 0,
      valueChanges = 0,
      styleChanges = 0,
      formulaChanges = 0;

    for (const sheet of diff.modifiedSheets) {
      for (const change of sheet.cellChanges) {
        if (change.type === "added") added++;
        else if (change.type === "modified") modified++;
        else if (change.type === "deleted") deleted++;

        // Count specific change types
        if (change.changeFlags.valueChanged) valueChanges++;
        if (change.changeFlags.styleChanged) styleChanges++;
        if (change.changeFlags.formulaChanged) formulaChanges++;
      }
    }
    return { added, modified, deleted, valueChanges, styleChanges, formulaChanges };
  }, [diff]);

  return (
    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
      {stats.added > 0 && (
        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <IconPlus size={14} />
          <span>{stats.added} agregadas</span>
        </span>
      )}
      {stats.modified > 0 && (
        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
          <IconRefresh size={14} />
          <span>{stats.modified} modificadas</span>
        </span>
      )}
      {stats.deleted > 0 && (
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <IconMinus size={14} />
          <span>{stats.deleted} eliminadas</span>
        </span>
      )}
      {stats.styleChanges > 0 && (
        <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
          <IconPalette size={14} />
          <span>{stats.styleChanges} con estilos</span>
        </span>
      )}
      {diff.addedSheets.length > 0 && (
        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <IconTable size={14} />
          <span>{diff.addedSheets.length} hojas nuevas</span>
        </span>
      )}
      {diff.deletedSheets.length > 0 && (
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <IconX size={14} />
          <span>{diff.deletedSheets.length} hojas eliminadas</span>
        </span>
      )}
    </div>
  );
}

// Table showing cell-level changes
function CellChangesTable({ changes }: { changes: CellChange[] }) {
  if (changes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No hay cambios en esta hoja
      </div>
    );
  }

  // Sort changes by row then column
  const sortedChanges = [...changes].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  // Convert column number to Excel-style letter (0 = A, 1 = B, etc.)
  const colToLetter = (col: number): string => {
    let result = "";
    let n = col;
    while (n >= 0) {
      result = String.fromCharCode((n % 26) + 65) + result;
      n = Math.floor(n / 26) - 1;
    }
    return result;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">
                Celda
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-28">
                Tipo
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">
                Cambios
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Anterior
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Nuevo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedChanges.map((change, idx) => {
              const cellRef = `${colToLetter(change.col)}${change.row + 1}`;
              return (
                <tr
                  key={idx}
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    change.type === "added" && "bg-green-500/5",
                    change.type === "deleted" && "bg-red-500/5",
                    change.type === "modified" && "bg-blue-500/5"
                  )}
                >
                  <td className="px-3 py-2.5 font-mono text-xs font-medium">
                    {cellRef}
                  </td>
                  <td className="px-3 py-2.5">
                    <ChangeTypeBadge
                      type={change.type}
                      changeFlags={change.changeFlags}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <ChangeIndicators changeFlags={change.changeFlags} />
                  </td>
                  <td className="px-3 py-2.5">
                    <CellPreview
                      value={change.oldValue}
                      formula={change.oldFormula}
                      style={change.oldStyle}
                      type="old"
                      changeType={change.type}
                      styleChanges={change.styleChanges}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <CellPreview
                      value={change.newValue}
                      formula={change.newFormula}
                      style={change.newStyle}
                      type="new"
                      changeType={change.type}
                      styleChanges={change.styleChanges}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

// Indicators for what changed (value/style/formula icons)
function ChangeIndicators({
  changeFlags,
}: {
  changeFlags: CellChange["changeFlags"];
}) {
  return (
    <div className="flex items-center gap-1">
      {changeFlags.valueChanged && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-5 h-5 rounded flex items-center justify-center bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <IconTypography size={12} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Valor cambiado
          </TooltipContent>
        </Tooltip>
      )}
      {changeFlags.formulaChanged && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-5 h-5 rounded flex items-center justify-center bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono text-[10px] font-bold">
              fx
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Fórmula cambiada
          </TooltipContent>
        </Tooltip>
      )}
      {changeFlags.styleChanged && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-5 h-5 rounded flex items-center justify-center bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <IconPalette size={12} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Estilo cambiado
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// Badge for change type with detail
function ChangeTypeBadge({
  type,
  changeFlags,
}: {
  type: "added" | "modified" | "deleted";
  changeFlags: CellChange["changeFlags"];
}) {
  const config = {
    added: {
      label: "Agregada",
      className:
        "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
      icon: IconPlus,
    },
    modified: {
      label: "Modificada",
      className:
        "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      icon: IconRefresh,
    },
    deleted: {
      label: "Eliminada",
      className:
        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
      icon: IconMinus,
    },
  };

  const { label, className, icon: Icon } = config[type];

  // More specific label for style-only changes
  let displayLabel = label;
  if (type === "modified") {
    const onlyStyle =
      changeFlags.styleChanged &&
      !changeFlags.valueChanged &&
      !changeFlags.formulaChanged;
    if (onlyStyle) {
      displayLabel = "Estilo";
    }
  }

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0 h-5", className)}
    >
      <Icon size={10} className="mr-1" />
      {displayLabel}
    </Badge>
  );
}

// Preview a cell with its styling
function CellPreview({
  value,
  formula,
  style,
  type,
  changeType,
  styleChanges,
}: {
  value: unknown;
  formula?: string;
  style?: CellStyle;
  type: "old" | "new";
  changeType: "added" | "modified" | "deleted";
  styleChanges?: StyleChanges;
}) {
  // Show empty for added old values or deleted new values
  if (
    (type === "old" && changeType === "added") ||
    (type === "new" && changeType === "deleted")
  ) {
    return <span className="text-muted-foreground/40 italic text-xs">—</span>;
  }

  // Format the value for display
  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  const displayValue = formatValue(value);

  // Build inline styles from cell style
  const inlineStyles: React.CSSProperties = {};
  if (style) {
    if (style.bg?.rgb) {
      inlineStyles.backgroundColor = `#${style.bg.rgb}`;
    }
    if (style.cl?.rgb) {
      inlineStyles.color = `#${style.cl.rgb}`;
    }
    if (style.bl === 1) {
      inlineStyles.fontWeight = "bold";
    }
    if (style.it === 1) {
      inlineStyles.fontStyle = "italic";
    }
    if (style.ul?.s) {
      inlineStyles.textDecoration =
        (inlineStyles.textDecoration || "") + " underline";
    }
    if (style.st?.s) {
      inlineStyles.textDecoration =
        (inlineStyles.textDecoration || "") + " line-through";
    }
    if (style.fs) {
      // Scale font size for preview (don't make it huge)
      inlineStyles.fontSize = `${Math.min(style.fs, 14)}px`;
    }
    if (style.ht !== undefined) {
      const alignMap: Record<number, React.CSSProperties["textAlign"]> = {
        0: "left",
        1: "center",
        2: "right",
        3: "justify",
      };
      inlineStyles.textAlign = alignMap[style.ht];
    }
  }

  return (
    <div className="space-y-1.5 max-w-[220px]">
      {/* Formula if present */}
      {formula && (
        <div className="text-xs text-purple-600 dark:text-purple-400 font-mono bg-purple-500/10 px-1.5 py-0.5 rounded truncate">
          {formula}
        </div>
      )}

      {/* Cell value with visual style preview */}
      <div
        className={cn(
          "text-xs rounded px-2 py-1 border truncate min-h-[24px] flex items-center",
          !displayValue && "text-muted-foreground/40 italic"
        )}
        style={inlineStyles}
        title={displayValue || "vacío"}
      >
        {displayValue || "vacío"}
      </div>

      {/* Style changes detail */}
      {styleChanges && <StyleChangesDetail changes={styleChanges} type={type} />}
    </div>
  );
}

// Display detailed style changes
function StyleChangesDetail({
  changes,
  type,
}: {
  changes: StyleChanges;
  type: "old" | "new";
}) {
  const items: React.ReactNode[] = [];

  // Background color
  if (changes.background) {
    const color = type === "old" ? changes.background.old : changes.background.new;
    items.push(
      <Tooltip key="bg">
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-4 rounded border border-border shadow-sm"
              style={{
                backgroundColor: color ? `#${color}` : "transparent",
              }}
            />
            {!color && (
              <span className="text-[10px] text-muted-foreground">sin fondo</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Fondo: {color ? `#${color}` : "ninguno"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Text color
  if (changes.textColor) {
    const color = type === "old" ? changes.textColor.old : changes.textColor.new;
    items.push(
      <Tooltip key="cl">
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-4 rounded border border-border flex items-center justify-center text-[10px] font-bold"
              style={{ color: color ? `#${color}` : undefined }}
            >
              A
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Color texto: {color ? `#${color}` : "predeterminado"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Bold
  if (changes.bold) {
    const isBold = type === "old" ? changes.bold.old : changes.bold.new;
    items.push(
      <Tooltip key="bold">
        <TooltipTrigger asChild>
          <div
            className={cn(
              "w-5 h-5 rounded flex items-center justify-center text-[10px]",
              isBold
                ? "bg-foreground/10 text-foreground"
                : "bg-muted text-muted-foreground line-through"
            )}
          >
            <IconBold size={12} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Negrita: {isBold ? "Sí" : "No"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Italic
  if (changes.italic) {
    const isItalic = type === "old" ? changes.italic.old : changes.italic.new;
    items.push(
      <Tooltip key="italic">
        <TooltipTrigger asChild>
          <div
            className={cn(
              "w-5 h-5 rounded flex items-center justify-center",
              isItalic
                ? "bg-foreground/10 text-foreground"
                : "bg-muted text-muted-foreground line-through"
            )}
          >
            <IconItalic size={12} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Cursiva: {isItalic ? "Sí" : "No"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Underline
  if (changes.underline) {
    const isUnderline = type === "old" ? changes.underline.old : changes.underline.new;
    items.push(
      <Tooltip key="ul">
        <TooltipTrigger asChild>
          <div
            className={cn(
              "w-5 h-5 rounded flex items-center justify-center",
              isUnderline
                ? "bg-foreground/10 text-foreground"
                : "bg-muted text-muted-foreground line-through"
            )}
          >
            <IconUnderline size={12} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Subrayado: {isUnderline ? "Sí" : "No"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Strikethrough
  if (changes.strikethrough) {
    const isStrike =
      type === "old" ? changes.strikethrough.old : changes.strikethrough.new;
    items.push(
      <Tooltip key="st">
        <TooltipTrigger asChild>
          <div
            className={cn(
              "w-5 h-5 rounded flex items-center justify-center",
              isStrike
                ? "bg-foreground/10 text-foreground"
                : "bg-muted text-muted-foreground line-through"
            )}
          >
            <IconStrikethrough size={12} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Tachado: {isStrike ? "Sí" : "No"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Font size
  if (changes.fontSize) {
    const size = type === "old" ? changes.fontSize.old : changes.fontSize.new;
    items.push(
      <Tooltip key="fs">
        <TooltipTrigger asChild>
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
            <IconTextSize size={10} />
            <span>{size ?? "—"}pt</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Tamaño fuente: {size ?? "predeterminado"}pt
        </TooltipContent>
      </Tooltip>
    );
  }

  // Horizontal alignment
  if (changes.horizontalAlign) {
    const align =
      type === "old" ? changes.horizontalAlign.old : changes.horizontalAlign.new;
    const AlignIcon =
      align === "centro"
        ? IconAlignCenter
        : align === "derecha"
          ? IconAlignRight
          : align === "justificado"
            ? IconAlignJustified
            : IconAlignLeft;
    items.push(
      <Tooltip key="ht">
        <TooltipTrigger asChild>
          <div className="w-5 h-5 rounded flex items-center justify-center bg-muted text-muted-foreground">
            <AlignIcon size={12} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Alineación: {align ?? "predeterminada"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Borders
  if (changes.borders) {
    items.push(
      <Tooltip key="bd">
        <TooltipTrigger asChild>
          <div className="w-5 h-5 rounded flex items-center justify-center bg-muted text-muted-foreground">
            <IconBorderAll size={12} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Bordes cambiados
        </TooltipContent>
      </Tooltip>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-dashed">
      {items}
    </div>
  );
}
