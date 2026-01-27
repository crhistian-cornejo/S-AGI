/**
 * File Version Diff Component
 *
 * Muestra las diferencias entre dos versiones de un archivo Excel/Doc
 */

import * as React from "react";
import {
  diffWorkbooks,
  generateChangeSummary,
  type WorkbookDiff,
  type CellChange,
} from "@/utils/univer-diff";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface FileVersionDiffProps {
  versionA: any;
  versionB: any;
  fileType: "excel" | "doc";
  className?: string;
}

export function FileVersionDiff({
  versionA,
  versionB,
  fileType,
  className,
}: FileVersionDiffProps) {
  const [expandedSheets, setExpandedSheets] = React.useState<Set<string>>(
    new Set(),
  );
  const [expandedCells, setExpandedCells] = React.useState<Set<string>>(
    new Set(),
  );

  // Calculate diff
  const diff = React.useMemo(() => {
    if (!versionA?.univer_data || !versionB?.univer_data) {
      return null;
    }

    if (fileType === "excel") {
      return diffWorkbooks(versionA.univer_data, versionB.univer_data);
    }

    // For docs, we'd need a different diff function
    return null;
  }, [versionA, versionB, fileType]);

  if (!diff || diff.totalChanges === 0) {
    return (
      <div className={cn("p-4 text-center text-muted-foreground", className)}>
        No hay cambios entre estas versiones
      </div>
    );
  }

  const toggleSheet = (sheetId: string) => {
    setExpandedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(sheetId)) {
        next.delete(sheetId);
      } else {
        next.add(sheetId);
      }
      return next;
    });
  };

  const toggleCell = (cellKey: string) => {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellKey)) {
        next.delete(cellKey);
      } else {
        next.add(cellKey);
      }
      return next;
    });
  };

  const getCellKey = (change: CellChange) =>
    `${change.sheetId}-${change.row}-${change.col}`;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary */}
      <div className="p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Resumen de Cambios</h3>
        <p className="text-sm text-muted-foreground">
          {generateChangeSummary(diff)}
        </p>
        <div className="mt-2 flex gap-4 text-xs">
          <span className="text-green-600">
            +{diff.addedSheets.length} hoja(s) agregada(s)
          </span>
          <span className="text-red-600">
            -{diff.deletedSheets.length} hoja(s) eliminada(s)
          </span>
          <span className="text-blue-600">
            ~{diff.modifiedSheets.length} hoja(s) modificada(s)
          </span>
        </div>
      </div>

      {/* Added Sheets */}
      {diff.addedSheets.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-green-600">Hojas Agregadas</h4>
          {diff.addedSheets.map((sheetId) => {
            const sheet = versionB.univer_data?.sheets?.[sheetId];
            return (
              <div
                key={sheetId}
                className="p-3 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800"
              >
                <span className="font-medium">{sheet?.name || sheetId}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Deleted Sheets */}
      {diff.deletedSheets.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-red-600">Hojas Eliminadas</h4>
          {diff.deletedSheets.map((sheetId) => {
            const sheet = versionA.univer_data?.sheets?.[sheetId];
            return (
              <div
                key={sheetId}
                className="p-3 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800"
              >
                <span className="font-medium">{sheet?.name || sheetId}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Modified Sheets */}
      {diff.modifiedSheets.map((sheet) => {
        const isExpanded = expandedSheets.has(sheet.sheetId);
        const cellCount = sheet.cellChanges.length;

        return (
          <div
            key={sheet.sheetId}
            className="border rounded-lg overflow-hidden"
          >
            <button
              onClick={() => toggleSheet(sheet.sheetId)}
              className="w-full p-3 bg-muted hover:bg-muted/80 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <IconChevronUp size={16} />
                ) : (
                  <IconChevronDown size={16} />
                )}
                <span className="font-medium">{sheet.sheetName}</span>
                <span className="text-xs text-muted-foreground">
                  ({cellCount} cambio{cellCount !== 1 ? "s" : ""})
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                {sheet.cellChanges.map((change) => {
                  const cellKey = getCellKey(change);
                  const isCellExpanded = expandedCells.has(cellKey);

                  return (
                    <div
                      key={cellKey}
                      className={cn(
                        "p-2 rounded border text-sm",
                        change.type === "added" &&
                          "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
                        change.type === "deleted" &&
                          "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
                        change.type === "modified" &&
                          "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">
                            {getCellAddress(change.row, change.col)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {change.type === "added" && "Agregada"}
                            {change.type === "deleted" && "Eliminada"}
                            {change.type === "modified" && "Modificada"}
                          </span>
                        </div>
                        {(change.oldValue !== undefined ||
                          change.newValue !== undefined) && (
                          <button
                            onClick={() => toggleCell(cellKey)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isCellExpanded ? "Ocultar" : "Ver detalles"}
                          </button>
                        )}
                      </div>

                      {isCellExpanded && (
                        <div className="mt-2 space-y-1 text-xs">
                          {change.oldValue !== undefined && (
                            <div>
                              <span className="text-red-600">Antes:</span>{" "}
                              <span className="font-mono">
                                {formatValue(change.oldValue)}
                              </span>
                            </div>
                          )}
                          {change.newValue !== undefined && (
                            <div>
                              <span className="text-green-600">Después:</span>{" "}
                              <span className="font-mono">
                                {formatValue(change.newValue)}
                              </span>
                            </div>
                          )}
                          {change.oldFormula && (
                            <div>
                              <span className="text-muted-foreground">
                                Fórmula anterior:
                              </span>{" "}
                              <span className="font-mono">
                                {change.oldFormula}
                              </span>
                            </div>
                          )}
                          {change.newFormula && (
                            <div>
                              <span className="text-muted-foreground">
                                Fórmula nueva:
                              </span>{" "}
                              <span className="font-mono">
                                {change.newFormula}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getCellAddress(row: number, col: number): string {
  // Convert column number to letter (0 = A, 1 = B, etc.)
  let colStr = "";
  let colNum = col;
  while (colNum >= 0) {
    colStr = String.fromCharCode(65 + (colNum % 26)) + colStr;
    colNum = Math.floor(colNum / 26) - 1;
  }
  return `${colStr}${row + 1}`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(vacío)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
