import { IconMessageCircle, IconTable, IconFileText, IconFileTypePdf } from '@tabler/icons-react'
import { useAtom } from 'jotai'
import { activeTabAtom, type AppTab } from '@/lib/atoms'
import { cn } from '@/lib/utils'

interface TabItem {
  id: AppTab
  label: string
  icon: React.ReactNode
}

const tabs: TabItem[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <IconMessageCircle size={18} />
  },
  {
    id: 'excel',
    label: 'Excel',
    icon: <IconTable size={18} />
  },
  {
    id: 'doc',
    label: 'Doc',
    icon: <IconFileText size={18} />
  },
  {
    id: 'pdf',
    label: 'PDF',
    icon: <IconFileTypePdf size={18} />
  }
]

export function TabNavigation() {
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)

  return (
    <div className="flex border-b border-border bg-background">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative',
            'hover:text-foreground/80',
            activeTab === tab.id
              ? 'text-foreground'
              : 'text-muted-foreground'
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      ))}
    </div>
  )
}
