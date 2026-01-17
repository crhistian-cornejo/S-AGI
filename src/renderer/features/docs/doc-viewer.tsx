import { IconFileText } from '@tabler/icons-react'

export function DocViewer() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
      <div className="w-16 h-16 rounded-3xl bg-accent flex items-center justify-center shadow-lg">
        <IconFileText size={32} className="text-primary" />
      </div>
      <div className="max-w-xs">
        <h3 className="text-lg font-bold">Document Viewer</h3>
        <p className="text-sm text-muted-foreground mt-2 text-balance">
          Document viewing functionality will be available here.
        </p>
      </div>
    </div>
  )
}
