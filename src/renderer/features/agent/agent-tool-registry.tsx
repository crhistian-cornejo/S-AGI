import {
  SearchIcon,
  EyeIcon,
  IconEditFile,
  PlanningIcon,
  WriteFileIcon,
  CustomTerminalIcon,
  GlobeIcon,
  SparklesIcon,
  BrainIcon,
  CodeIcon,
  FileSearchIcon,
  TableIcon,
  ImageIcon,
} from "./icons"
import { IconFolderSearch, IconListCheck } from "@tabler/icons-react"

export type ToolVariant = "simple" | "collapsible"

export interface ToolMeta {
  icon: React.ComponentType<{ className?: string }>
  title: (part: ToolPart) => string
  subtitle?: (part: ToolPart) => string
  variant: ToolVariant
}

// Tool part interface matching AI SDK streaming format
export interface ToolPart {
  type: string
  state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
  input?: Record<string, unknown>
  output?: Record<string, unknown> & { success?: boolean }
}

/**
 * Get tool status based on part state and chat streaming status
 * Critical: if chat stopped streaming, pending tools should show as complete
 */
export function getToolStatus(part: ToolPart, chatStatus?: string) {
  const basePending =
    part.state !== "output-available" && part.state !== "output-error"
  const isError =
    part.state === "output-error" ||
    (part.state === "output-available" && part.output?.success === false)
  const isSuccess = part.state === "output-available" && !isError
  // Critical: if chat stopped streaming, pending tools should show as complete
  const isPending = basePending && chatStatus === "streaming"

  return { isPending, isError, isSuccess }
}

// Utility to calculate diff stats
function calculateDiffStats(oldString: string, newString: string) {
  const oldLines = oldString.split("\n")
  const newLines = newString.split("\n")
  const maxLines = Math.max(oldLines.length, newLines.length)
  let addedLines = 0
  let removedLines = 0

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    if (oldLine !== undefined && newLine !== undefined) {
      if (oldLine !== newLine) {
        removedLines++
        addedLines++
      }
    } else if (oldLine !== undefined) {
      removedLines++
    } else if (newLine !== undefined) {
      addedLines++
    }
  }
  return { addedLines, removedLines }
}

export const AgentToolRegistry: Record<string, ToolMeta> = {
  "tool-Task": {
    icon: SparklesIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Running Task" : "Task completed"
    },
    subtitle: (part) => {
      const description = (part.input?.description as string) || ""
      return description.length > 50
        ? description.slice(0, 47) + "..."
        : description
    },
    variant: "simple",
  },

  "tool-Grep": {
    icon: SearchIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) return "Grepping"
      const numFiles = (part.output?.numFiles as number) || 0
      return numFiles > 0 ? `Grepped ${numFiles} files` : "No matches"
    },
    subtitle: (part) => {
      const pattern = (part.input?.pattern as string) || ""
      const path = (part.input?.path as string) || ""

      if (path) {
        const combined = `${pattern} in ${path}`
        return combined.length > 40 ? combined.slice(0, 37) + "..." : combined
      }

      return pattern.length > 40 ? pattern.slice(0, 37) + "..." : pattern
    },
    variant: "simple",
  },

  "tool-Glob": {
    icon: IconFolderSearch,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) return "Exploring files"
      const numFiles = (part.output?.numFiles as number) || 0
      return numFiles > 0 ? `Found ${numFiles} files` : "No files found"
    },
    subtitle: (part) => {
      const pattern = (part.input?.pattern as string) || ""
      const targetDir = (part.input?.target_directory as string) || ""

      if (targetDir) {
        const combined = `${pattern} in ${targetDir}`
        return combined.length > 40 ? combined.slice(0, 37) + "..." : combined
      }

      return pattern.length > 40 ? pattern.slice(0, 37) + "..." : pattern
    },
    variant: "simple",
  },

  "tool-Read": {
    icon: EyeIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Reading" : "Read"
    },
    subtitle: (part) => {
      const filePath = (part.input?.file_path as string) || ""
      if (!filePath) return ""
      return filePath.split("/").pop() || ""
    },
    variant: "simple",
  },

  "tool-Edit": {
    icon: IconEditFile,
    title: (part) => {
      const filePath = (part.input?.file_path as string) || ""
      if (!filePath) return "Edit"
      return filePath.split("/").pop() || "Edit"
    },
    subtitle: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) return ""

      const oldString = (part.input?.old_string as string) || ""
      const newString = (part.input?.new_string as string) || ""

      if (!oldString && !newString) {
        return ""
      }

      if (oldString !== newString) {
        const { addedLines, removedLines } = calculateDiffStats(
          oldString,
          newString,
        )
        return `<span style="font-size: 11px; color: light-dark(#587C0B, #A3BE8C)">+${addedLines}</span> <span style="font-size: 11px; color: light-dark(#AD0807, #AE5A62)">-${removedLines}</span>`
      }

      return ""
    },
    variant: "simple",
  },

  "tool-planning": {
    icon: PlanningIcon,
    title: () => "Planning next steps",
    variant: "simple",
  },

  "tool-Write": {
    icon: WriteFileIcon,
    title: () => "Create",
    subtitle: (part) => {
      const filePath = (part.input?.file_path as string) || ""
      if (!filePath) return ""
      return filePath.split("/").pop() || ""
    },
    variant: "simple",
  },

  "tool-Bash": {
    icon: CustomTerminalIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Running command" : "Ran command"
    },
    subtitle: (part) => {
      const command = (part.input?.command as string) || ""
      const firstWord = command.split(/\s+/)[0] || ""
      return firstWord.length > 30 ? firstWord.slice(0, 27) + "..." : firstWord
    },
    variant: "simple",
  },

  "tool-WebFetch": {
    icon: GlobeIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Fetching" : "Fetched"
    },
    subtitle: (part) => {
      const url = (part.input?.url as string) || ""
      try {
        return new URL(url).hostname.replace("www.", "")
      } catch {
        return url.slice(0, 30)
      }
    },
    variant: "simple",
  },

  "tool-WebSearch": {
    icon: SearchIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Searching web" : "Searched web"
    },
    subtitle: (part) => {
      const query = (part.input?.query as string) || ""
      return query.length > 40 ? query.slice(0, 37) + "..." : query
    },
    variant: "simple",
  },

  // Spreadsheet tools specific to S-AGI
  "tool-create_spreadsheet": {
    icon: WriteFileIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Creating spreadsheet" : "Created spreadsheet"
    },
    subtitle: (part) => {
      const name = (part.input?.name as string) || ""
      return name.length > 40 ? name.slice(0, 37) + "..." : name
    },
    variant: "simple",
  },

  "tool-update_cells": {
    icon: IconEditFile,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Updating cells" : "Updated cells"
    },
    subtitle: (part) => {
      const updates = part.input?.updates as unknown[]
      if (!updates) return ""
      return `${updates.length} cells`
    },
    variant: "simple",
  },

  "tool-insert_formula": {
    icon: IconEditFile,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Inserting formula" : "Inserted formula"
    },
    subtitle: (part) => {
      const cell = (part.input?.cell as string) || ""
      return cell
    },
    variant: "simple",
  },

  // Planning tools
  "tool-TodoWrite": {
    icon: IconListCheck,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const action = (part.input?.action as string) || "update"
      if (isPending) {
        return action === "add" ? "Adding todo" : "Updating todos"
      }
      return action === "add" ? "Added todo" : "Updated todos"
    },
    subtitle: (part) => {
      const todos = (part.input?.todos as unknown[]) || []
      if (todos.length === 0) return ""
      return `${todos.length} ${todos.length === 1 ? "item" : "items"}`
    },
    variant: "simple",
  },

  "tool-PlanWrite": {
    icon: PlanningIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const action = (part.input?.action as string) || "create"
      const plan = part.input?.plan as { status?: string } | undefined
      const status = plan?.status
      if (isPending) {
        if (action === "create") return "Creating plan"
        if (action === "approve") return "Approving plan"
        if (action === "complete") return "Completing plan"
        return "Updating plan"
      }
      if (status === "awaiting_approval") return "Plan ready for review"
      if (status === "approved") return "Plan approved"
      if (status === "completed") return "Plan completed"
      return action === "create" ? "Created plan" : "Updated plan"
    },
    subtitle: (part) => {
      const plan = part.input?.plan as { title?: string; steps?: { status?: string }[] } | undefined
      if (!plan) return ""
      const steps = plan.steps || []
      const completed = steps.filter((s) => s.status === "completed").length
      if (plan.title) {
        return steps.length > 0
          ? `${plan.title} (${completed}/${steps.length})`
          : plan.title
      }
      return steps.length > 0
        ? `${completed}/${steps.length} steps`
        : ""
    },
    variant: "simple",
  },

  "tool-ExitPlanMode": {
    icon: PlanningIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) return "Finishing plan..."
      const hasPlan = !!(part.output as { plan?: string } | undefined)?.plan
      return hasPlan ? "Plan ready" : "Exited plan mode"
    },
    subtitle: () => "",
    variant: "simple",
  },

  // ========================================================================
  // OpenAI Native Tools (Responses API)
  // ========================================================================

  "tool-web_search": {
    icon: GlobeIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Searching the web" : "Web search complete"
    },
    subtitle: () => "Native OpenAI web search",
    variant: "simple",
  },

  "tool-code_interpreter": {
    icon: CodeIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Running code" : "Code executed"
    },
    subtitle: () => "Python code interpreter",
    variant: "simple",
  },

  "tool-file_search": {
    icon: FileSearchIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Searching Knowledge Base" : "Searched Knowledge Base"
    },
    subtitle: () => "Documents & PDFs",
    variant: "simple",
  },

  "tool-reasoning": {
    icon: BrainIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Thinking..." : "Reasoning complete"
    },
    subtitle: () => "",
    variant: "simple",
  },

  // ========================================================================
  // Additional Spreadsheet Tools
  // ========================================================================

  "tool-format_cells": {
    icon: TableIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Formatting cells" : "Formatted cells"
    },
    subtitle: (part) => {
      const range = (part.input?.range as string) || ""
      return range
    },
    variant: "simple",
  },

  "tool-merge_cells": {
    icon: TableIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Merging cells" : "Merged cells"
    },
    subtitle: (part) => {
      const range = (part.input?.range as string) || ""
      return range
    },
    variant: "simple",
  },

  "tool-add_row": {
    icon: TableIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Adding row" : "Added row"
    },
    subtitle: () => "",
    variant: "simple",
  },

  "tool-delete_row": {
    icon: TableIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Deleting row" : "Deleted row"
    },
    subtitle: () => "",
    variant: "simple",
  },

  "tool-get_spreadsheet_summary": {
    icon: EyeIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Reading spreadsheet" : "Read spreadsheet"
    },
    subtitle: () => "Getting summary",
    variant: "simple",
  },

  "tool-set_column_width": {
    icon: TableIcon,
    title: () => "Set column width",
    subtitle: () => "",
    variant: "simple",
  },

  "tool-set_row_height": {
    icon: TableIcon,
    title: () => "Set row height",
    subtitle: () => "",
    variant: "simple",
  },

  // Document tools
  "tool-create_document": {
    icon: WriteFileIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Creating document" : "Created document"
    },
    subtitle: (part) => {
      const title = (part.input?.title as string) || (part.input?.name as string) || ""
      return title.length > 40 ? title.slice(0, 37) + "..." : title
    },
    variant: "simple",
  },

  "tool-insert_text": {
    icon: IconEditFile,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Inserting text" : "Inserted text"
    },
    subtitle: () => "",
    variant: "simple",
  },

  "tool-replace_document_content": {
    icon: IconEditFile,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Replacing document" : "Replaced document"
    },
    subtitle: () => "",
    variant: "simple",
  },

  "tool-get_document_content": {
    icon: EyeIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Reading document" : "Read document"
    },
    subtitle: () => "",
    variant: "simple",
  },

  // ========================================================================
  // Image Generation Tools
  // ========================================================================

  "tool-generate_image": {
    icon: ImageIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) return "Generating image..."
      const hasError = part.state === "output-error" || part.output?.error
      return hasError ? "Image generation failed" : "Generated image"
    },
    subtitle: (part) => {
      const prompt = (part.input?.prompt as string) || ""
      return prompt.length > 50 ? prompt.slice(0, 47) + "..." : prompt
    },
    variant: "simple",
  },

  "tool-edit_image": {
    icon: ImageIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) return "Editing image..."
      const hasError = part.state === "output-error" || part.output?.error
      return hasError ? "Image edit failed" : "Edited image"
    },
    subtitle: (part) => {
      const prompt = (part.input?.prompt as string) || ""
      return prompt.length > 50 ? prompt.slice(0, 47) + "..." : prompt
    },
    variant: "simple",
  },
}
