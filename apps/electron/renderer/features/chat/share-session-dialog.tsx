/**
 * Share Session Dialog
 * Dialog for sharing S-AGI chat sessions via local network or ngrok
 */

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { trpc } from '@/lib/trpc'
import { IconShare, IconCopy, IconCheck, IconCloud, IconUsers, IconX, IconQrcode, IconWifi } from '@tabler/icons-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import { useAtomValue } from 'jotai'
import { selectedChatIdAtom } from '@/lib/atoms'

interface ShareSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chatId: string
  chatTitle: string
  messages: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: Date | string
  }>
}

export function ShareSessionDialog({
  open,
  onOpenChange,
  chatId,
  chatTitle,
  messages
}: ShareSessionDialogProps) {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(false)
  const [useNgrok, setUseNgrok] = useState(false)
  const [ngrokAuthToken, setNgrokAuthToken] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  // tRPC mutations & queries
  const startSharing = trpc.session.startSharing.useMutation()
  const stopSharing = trpc.session.stopSharing.useMutation()
  const enableNgrok = trpc.session.enableNgrok.useMutation()
  const { data: status, refetch: refetchStatus } = trpc.session.getStatus.useQuery(undefined, {
    refetchInterval: open ? 3000 : false // Poll every 3s when dialog is open
  })

  const isSharing = status?.isSharing ?? false
  const shareUrl = status?.ngrokUrl || status?.localUrl || ''
  const clientCount = status?.clientCount ?? 0

  // Start sharing
  const handleStartSharing = async () => {
    setIsStarting(true)
    try {
      await startSharing.mutateAsync({
        sessionState: {
          chatId,
          chatTitle: chatTitle || 'S-AGI Session',
          messages: messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt 
              ? (typeof m.createdAt === 'string' ? m.createdAt : m.createdAt.toISOString())
              : new Date().toISOString()
          })),
          hostName: 'Host',
          theme: (theme === 'dark' ? 'dark' : 'light') as 'light' | 'dark'
        },
        useNgrok,
        ngrokAuthToken: useNgrok ? ngrokAuthToken : undefined
      })
      await refetchStatus()
    } catch (err) {
      console.error('Failed to start sharing:', err)
    } finally {
      setIsStarting(false)
    }
  }

  // Stop sharing
  const handleStopSharing = async () => {
    try {
      await stopSharing.mutateAsync()
      await refetchStatus()
    } catch (err) {
      console.error('Failed to stop sharing:', err)
    }
  }

  // Enable ngrok after already sharing
  const handleEnableNgrok = async () => {
    try {
      await enableNgrok.mutateAsync({ authToken: ngrokAuthToken || undefined })
      await refetchStatus()
    } catch (err) {
      console.error('Failed to enable ngrok:', err)
    }
  }

  // Copy URL
  const handleCopyUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Simple QR Code SVG generator (basic implementation)
  const qrCodeSvg = useMemo(() => {
    if (!shareUrl) return null
    // This is a simplified placeholder - in production, use a proper QR library
    return (
      <div className="w-32 h-32 bg-white rounded-lg flex items-center justify-center p-2">
        <div className="text-center text-xs text-gray-500">
          <IconQrcode size={48} className="mx-auto text-gray-400 mb-2" />
          <span className="text-[10px]">QR Code</span>
        </div>
      </div>
    )
  }, [shareUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconShare size={20} />
            Share Session
          </DialogTitle>
          <DialogDescription>
            Share this chat with others via a temporary link.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {!isSharing ? (
            // Not sharing - show start options
            <motion.div
              key="start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Local network info */}
              <div className="flex items-start gap-3 p-3 bg-secondary/50 rounded-lg">
                <IconWifi size={20} className="text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Local Network</p>
                  <p className="text-xs text-muted-foreground">
                    Anyone on your WiFi can access the session.
                  </p>
                </div>
              </div>

              {/* ngrok option */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <IconCloud size={20} className="text-muted-foreground" />
                  <div>
                    <Label htmlFor="use-ngrok" className="text-sm font-medium">
                      Public Access (ngrok)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Share with anyone on the internet
                    </p>
                  </div>
                </div>
                <Switch
                  id="use-ngrok"
                  checked={useNgrok}
                  onCheckedChange={setUseNgrok}
                />
              </div>

              {/* ngrok auth token input */}
              <AnimatePresence>
                {useNgrok && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <Input
                      placeholder="ngrok auth token (optional)"
                      value={ngrokAuthToken}
                      onChange={(e) => setNgrokAuthToken(e.target.value)}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Get a free token at ngrok.com
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Start button */}
              <Button
                onClick={handleStartSharing}
                disabled={isStarting}
                className="w-full"
              >
                {isStarting ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                ) : (
                  <>
                    <IconShare size={16} className="mr-2" />
                    Start Sharing
                  </>
                )}
              </Button>
            </motion.div>
          ) : (
            // Currently sharing - show link and controls
            <motion.div
              key="sharing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    Session is Live
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <IconUsers size={16} />
                  <span>{clientCount} connected</span>
                </div>
              </div>

              {/* QR Code and URL */}
              <div className="flex gap-4 p-4 bg-secondary/30 rounded-lg">
                {qrCodeSvg}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-2">Share this link:</p>
                  <div className="flex gap-2">
                    <Input
                      value={shareUrl}
                      readOnly
                      className="text-xs font-mono"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={handleCopyUrl}
                      className="shrink-0"
                    >
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </Button>
                  </div>
                  {status?.ngrokUrl && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                      <IconCloud size={12} />
                      Public access enabled
                    </p>
                  )}
                </div>
              </div>

              {/* Enable ngrok if not already */}
              {!status?.ngrokUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnableNgrok}
                  disabled={enableNgrok.isPending}
                  className="w-full"
                >
                  <IconCloud size={14} className="mr-2" />
                  Enable Public Access (ngrok)
                </Button>
              )}

              {/* Stop sharing */}
              <Button
                variant="destructive"
                onClick={handleStopSharing}
                disabled={stopSharing.isPending}
                className="w-full"
              >
                <IconX size={16} className="mr-2" />
                Stop Sharing
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Share Session Button - Use this in chat header
 */
interface ShareSessionButtonProps {
  styleVariant?: 'default' | 'zen'
}

export function ShareSessionButton({ styleVariant = 'default' }: ShareSessionButtonProps) {
  const [open, setOpen] = useState(false)
  const chatId = useAtomValue(selectedChatIdAtom)
  const isZenStyle = styleVariant === 'zen'
  
  // Get current chat data
  const { data: chat } = trpc.chats.get.useQuery(
    { id: chatId ?? '' },
    { enabled: !!chatId }
  )
  const { data: messages = [] } = trpc.messages.list.useQuery(
    { chatId: chatId ?? '' },
    { enabled: !!chatId }
  )

  if (!chatId) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isZenStyle ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => setOpen(true)}
            className={
              isZenStyle
                ? 'h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg'
                : 'h-8 px-3 gap-1.5 bg-background/80 backdrop-blur-sm border-border/50 hover:bg-accent hover:border-border text-sm font-medium'
            }
            aria-label="Compartir"
          >
            <IconShare size={14} />
            {!isZenStyle && 'Compartir'}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Compartir esta sesión
        </TooltipContent>
      </Tooltip>
      <ShareSessionDialog
        open={open}
        onOpenChange={setOpen}
        chatId={chatId}
        chatTitle={chat?.title ?? 'S-AGI Session'}
        messages={messages.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          createdAt: m.createdAt
        }))}
      />
    </>
  )
}
