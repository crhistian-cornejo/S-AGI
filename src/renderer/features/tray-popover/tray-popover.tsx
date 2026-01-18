import { useEffect, useState, useCallback, useRef } from 'react'
import './tray-popover.css'

// Local type definition (matches TrayRecentItem from env.d.ts)
interface RecentItem {
    id: string
    type: 'spreadsheet' | 'document' | 'chat'
    name: string
    updatedAt: string
    chatId?: string
}

// Icons as SVG components for better control
const SearchIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Search</title>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
)

const SpreadsheetIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Spreadsheet</title>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
)

const DocumentIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Document</title>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
    </svg>
)

const ChatIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Chat</title>
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
)

const SettingsIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Settings</title>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
)

const QuitIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Quit</title>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
)

const OpenIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Open</title>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
)

// Helper to safely access desktopApi
const getDesktopApi = () => window.desktopApi

export function TrayPopover() {
    const [searchQuery, setSearchQuery] = useState('')
    const [recentItems, setRecentItems] = useState<RecentItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Fetch recent items from main process
    const fetchRecentItems = useCallback(async () => {
        const api = getDesktopApi()
        if (!api?.tray) {
            setIsLoading(false)
            return
        }
        
        try {
            setIsLoading(true)
            const items = await api.tray.getRecentItems()
            setRecentItems(items || [])
        } catch (error) {
            console.error('Failed to fetch recent items:', error)
            setRecentItems([])
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchRecentItems()
        
        // Auto focus search input
        setTimeout(() => {
            searchInputRef.current?.focus()
        }, 100)
        
        const api = getDesktopApi()
        const cleanup = api?.tray?.onRefresh(() => fetchRecentItems())
        
        return () => {
            cleanup?.()
        }
    }, [fetchRecentItems])

    const handleAction = (action: string, data?: Record<string, unknown>) => {
        const api = getDesktopApi()
        api?.tray?.action({ action, ...data })
    }

    const handleOpenItem = (item: RecentItem) => {
        handleAction('open-item', { 
            itemId: item.id, 
            type: item.type,
            chatId: item.chatId 
        })
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            // Send quick AI message
            handleAction('new-chat', { message: searchQuery.trim() })
            setSearchQuery('')
        }
    }

    const filteredItems = recentItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)
        const diffDays = Math.floor(diffMs / 86400000)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins}m`
        if (diffHours < 24) return `${diffHours}h`
        if (diffDays < 7) return `${diffDays}d`
        return date.toLocaleDateString()
    }

    return (
        <div className="tray-popover">
            <div className="popover-arrow" />
            
            <div className="search-container">
                <div className="search-input-wrapper">
                    <div className="search-icon">
                        <SearchIcon />
                    </div>
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="search-input"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
            </div>

            <div className="actions-section">
                <button 
                    type="button"
                    className="action-button"
                    onClick={() => handleAction('new-chat')}
                >
                    <ChatIcon />
                    <span>New Chat</span>
                </button>
                <button 
                    type="button"
                    className="action-button"
                    onClick={() => handleAction('new-spreadsheet')}
                >
                    <SpreadsheetIcon />
                    <span>New Spreadsheet</span>
                </button>
                <button 
                    type="button"
                    className="action-button"
                    onClick={() => handleAction('new-document')}
                >
                    <DocumentIcon />
                    <span>New Document</span>
                </button>
            </div>

            <div className="separator" />

            <div className="recent-section-wrapper">
                <div className="recent-section">
                    <div className="section-label">
                        {searchQuery ? 'Search Results' : 'Recent Activity'}
                    </div>
                    <div className="recent-list">
                        {isLoading ? (
                            <div className="empty-state">Loading...</div>
                        ) : filteredItems.length === 0 ? (
                            <div className="empty-state">
                                {searchQuery ? 'No results found' : 'No recent items'}
                            </div>
                        ) : (
                            filteredItems.slice(0, 10).map((item) => (
                                <button
                                    type="button"
                                    key={item.id}
                                    className="recent-item"
                                    onClick={() => handleOpenItem(item)}
                                >
                                    <div className={`item-icon-container ${item.type}`}>
                                        {item.type === 'spreadsheet' ? <SpreadsheetIcon /> : 
                                         item.type === 'document' ? <DocumentIcon /> : <ChatIcon />}
                                    </div>
                                    <div className="item-info">
                                        <div className="item-title">{item.name}</div>
                                        <div className="item-time">{formatDate(item.updatedAt)}</div>
                                    </div>
                                    <div className="item-action-hint">
                                        <OpenIcon />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <footer className="popover-footer">
                <div className="footer-main-actions">
                    <button 
                        type="button"
                        className="footer-btn"
                        onClick={() => handleAction('open-main')}
                    >
                        <OpenIcon />
                        <span>Open S-AGI</span>
                    </button>
                    <button 
                        type="button"
                        className="footer-btn"
                        onClick={() => handleAction('settings')}
                    >
                        <SettingsIcon />
                        <span>Settings</span>
                    </button>
                </div>
                <button 
                    type="button"
                    className="footer-btn quit"
                    onClick={() => handleAction('quit')}
                    title="Quit S-AGI"
                >
                    <QuitIcon />
                    <span>Quit</span>
                </button>
            </footer>
        </div>
    )
}

