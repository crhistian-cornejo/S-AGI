import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { trpc } from '@/lib/trpc'
import { toast } from 'sonner'
import { 
    IconLoader2, 
    IconKey, 
    IconEye, 
    IconEyeOff, 
    IconTrash, 
    IconBolt, 
    IconBrandOpenai, 
    IconWorldSearch 
} from '@tabler/icons-react'
import { ZaiIcon } from '@/components/icons/model-icons'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { 
    availableModelsAtom, 
    selectedModelAtom, 
    allModelsGroupedAtom, 
    hasChatGPTPlusAtom, 
    chatGPTPlusStatusAtom, 
    currentProviderAtom
} from '@/lib/atoms'
import type { AIProvider } from '@s-agi/core/types/ai'

export function ApiKeysTab() {
    const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom)
    const [currentProvider, setCurrentProvider] = useAtom(currentProviderAtom)
    const availableModels = useAtomValue(availableModelsAtom)
    const allModelsGrouped = useAtomValue(allModelsGroupedAtom)
    const setHasChatGPTPlus = useSetAtom(hasChatGPTPlusAtom)
    const setChatGPTPlusStatus = useSetAtom(chatGPTPlusStatusAtom)
    
    const utils = trpc.useUtils()

    // Get status queries
    const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery()
    const { data: chatGPTStatus } = trpc.auth.getChatGPTStatus.useQuery()
    const { data: claudeCodeStatus } = trpc.auth.getClaudeCodeStatus.useQuery()
    
    // Sync atoms with queries
    useEffect(() => {
        if (chatGPTStatus) {
            setHasChatGPTPlus(chatGPTStatus.isConnected)
            setChatGPTPlusStatus({
                isConnected: chatGPTStatus.isConnected,
                email: chatGPTStatus.email ?? undefined,
                accountId: chatGPTStatus.accountId ?? undefined,
                connectedAt: chatGPTStatus.connectedAt ?? undefined
            })
        }
    }, [chatGPTStatus, setHasChatGPTPlus, setChatGPTPlusStatus])

    // Mutations for API Keys
    const setOpenAIKeyMutation = trpc.settings.setOpenAIKey.useMutation({
        onSuccess: () => {
            toast.success('OpenAI API key updated')
            utils.settings.getApiKeyStatus.invalidate()
        },
        onError: (e) => toast.error(e.message)
    })

    const setZaiKeyMutation = trpc.settings.setZaiKey.useMutation({
        onSuccess: () => {
            toast.success('Z.AI API key updated')
            utils.settings.getApiKeyStatus.invalidate()
        },
        onError: (e) => toast.error(e.message)
    })

    const setTavilyKeyMutation = trpc.settings.setTavilyKey.useMutation({
        onSuccess: () => {
            toast.success('Tavily API key updated')
            utils.settings.getApiKeyStatus.invalidate()
        },
        onError: (e) => toast.error(e.message)
    })

    const clearAllKeysMutation = trpc.settings.clearAllKeys.useMutation({
        onSuccess: () => {
            toast.success('All credentials cleared')
            utils.settings.getApiKeyStatus.invalidate()
            utils.auth.getChatGPTStatus.invalidate()
        },
        onError: (e) => toast.error(e.message)
    })

    // Mutations for OAuth
    const connectChatGPTMutation = trpc.auth.connectChatGPT.useMutation({
        onSuccess: () => toast.info('Opening authorization...'),
        onError: (e) => toast.error(e.message)
    })

    const disconnectChatGPTMutation = trpc.auth.disconnectChatGPT.useMutation({
        onSuccess: () => {
            toast.success('Disconnected from ChatGPT')
            utils.auth.getChatGPTStatus.invalidate()
            if (currentProvider === 'chatgpt-plus') setCurrentProvider('openai')
        },
        onError: (e) => toast.error(e.message)
    })

    // Claude Code OAuth state
    const [showClaudeCodeDialog, setShowClaudeCodeDialog] = useState(false)
    const [claudeAuthCode, setClaudeAuthCode] = useState('')

    // Claude Code OAuth mutations
    const connectClaudeCodeMutation = trpc.auth.connectClaudeCode.useMutation({
        onSuccess: () => {
            toast.info('Opening Claude authorization in browser...')
            setShowClaudeCodeDialog(true) // Show dialog to paste code
        },
        onError: (e) => toast.error(e.message)
    })

    const completeClaudeCodeMutation = trpc.auth.completeClaudeCodeAuth.useMutation({
        onSuccess: () => {
            toast.success('Claude Code connected!')
            setShowClaudeCodeDialog(false)
            setClaudeAuthCode('')
            utils.auth.getClaudeCodeStatus.invalidate()
        },
        onError: (e) => {
            toast.error(e.message)
        }
    })

    const disconnectClaudeCodeMutation = trpc.auth.disconnectClaudeCode.useMutation({
        onSuccess: () => {
            toast.success('Disconnected from Claude Code')
            utils.auth.getClaudeCodeStatus.invalidate()
            if (currentProvider === 'claude') setCurrentProvider('openai')
        },
        onError: (e) => toast.error(e.message)
    })

    const handleClaudeCodeSubmit = () => {
        if (!claudeAuthCode.trim()) {
            toast.error('Please enter the authorization code')
            return
        }
        completeClaudeCodeMutation.mutate({ code: claudeAuthCode.trim() })
    }


    // Listen for main process events
    useEffect(() => {
        // @ts-ignore
        const cleanupCP = window.desktopApi?.onChatGPTConnected?.(() => {
            utils.auth.getChatGPTStatus.invalidate()
            toast.success('ChatGPT Connected!')
        })
        // @ts-ignore
        const cleanupCC = window.desktopApi?.onClaudeCodeConnected?.(() => {
            utils.auth.getClaudeCodeStatus.invalidate()
            toast.success('Claude Code Connected!')
        })
        return () => {
            cleanupCP?.()
            cleanupCC?.()
        }
    }, [utils])

    // UI state
    const [openaiKey, setOpenaiKey] = useState('')
    const [zaiKey, setZaiKey] = useState('')
    const [tavilyKey, setTavilyKey] = useState('')
    const [showOpenaiKey, setShowOpenaiKey] = useState(false)
    const [showZaiKey, setShowZaiKey] = useState(false)
    const [showTavilyKey, setShowTavilyKey] = useState(false)

    const handleProviderChange = (p: AIProvider) => {
        setCurrentProvider(p)
        const models = allModelsGrouped[p] || []
        if (models.length > 0) {
            const defaultModel = {
                openai: 'gpt-5',
                'chatgpt-plus': 'gpt-5.1-codex-max',
                zai: 'GLM-4.7-Flash',
                claude: 'claude-sonnet-4-5-20251101'
            }[p]
            setSelectedModel(defaultModel || models[0].id)
        }
    }

    // Auto-switch away from Claude if disconnected
    useEffect(() => {
        if (currentProvider === 'claude' && !claudeCodeStatus?.isConnected) {
            setCurrentProvider('openai')
        }
    }, [claudeCodeStatus?.isConnected, currentProvider, setCurrentProvider])

    return (
        <div className="space-y-6 p-6">
            <div className="space-y-2">
                <h3 className="text-lg font-semibold">AI Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Configure your AI providers. Subscription-based providers use zero credits.
                </p>
            </div>

            {/* Selector */}
            <div className="border border-border rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <IconBolt size={18} />
                    <h4 className="font-medium">Primary Provider</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <Select value={currentProvider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="openai">
                                    <div className="flex items-center gap-2"><IconBrandOpenai size={14} /><span>OpenAI API</span></div>
                                </SelectItem>
                                <SelectItem value="chatgpt-plus" disabled={!chatGPTStatus?.isConnected}>
                                    <div className="flex items-center gap-2"><IconBrandOpenai size={14} className="text-emerald-500" /><span>ChatGPT Plus</span></div>
                                </SelectItem>
                                <SelectItem value="zai">
                                    <div className="flex items-center gap-2"><ZaiIcon size={14} className="text-amber-500" /><span>Z.AI Subscription</span></div>
                                </SelectItem>
                                <SelectItem value="claude" disabled={!claudeCodeStatus?.isConnected}>
                                    <div className="flex items-center gap-2">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-orange-500">
                                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                                        </svg>
                                        <span>Claude Pro/Max</span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Model</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                            <SelectTrigger className="max-w-[220px] [&>span]:min-w-0 [&>span]:truncate">
                                <span className="truncate">
                                    {availableModels.find(m => m.id === selectedModel)?.name ?? selectedModel ?? 'Model'}
                                </span>
                            </SelectTrigger>
                            <SelectContent>
                                {availableModels.map(m => (
                                    <SelectItem key={m.id} value={m.id}>
                                        <div className="flex flex-col gap-0.5 py-0.5">
                                            <span>{m.name}</span>
                                            {m.description && (
                                                <span className="text-[11px] text-muted-foreground">{m.description}</span>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Subscriptions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Gemini - DISABLED: OAuth token incompatible with API endpoint */}
                {/*
                <div className={`border rounded-lg p-6 space-y-4 ${geminiStatus?.isConnected ? 'border-blue-500/50 bg-blue-50/10' : ''}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><GeminiIcon className="text-blue-500" size={20} /><h4 className="font-semibold">Gemini Advanced</h4></div>
                        {geminiStatus?.isConnected && <Badge className="bg-blue-500">Connected</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Use Google One AI Premium for free tokens.</p>
                    {geminiStatus?.isConnected ? (
                        <div className="space-y-2">
                            <p className="text-xs font-medium">{geminiStatus.email}</p>
                            <Button variant="outline" size="sm" className="w-full text-red-500" onClick={() => disconnectGeminiMutation.mutate()}>Disconnect</Button>
                        </div>
                    ) : (
                        <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => connectGeminiMutation.mutate()} disabled={connectGeminiMutation.isPending}>
                            {connectGeminiMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : <GeminiIcon className="mr-2" size={16} />}
                            Connect Google
                        </Button>
                    )}
                </div>
                */}

                {/* ChatGPT */}
                <div className={`border rounded-lg p-6 space-y-4 ${chatGPTStatus?.isConnected ? 'border-emerald-500/50 bg-emerald-50/10' : ''}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><IconBrandOpenai className="text-emerald-500" size={20} /><h4 className="font-semibold">ChatGPT Plus</h4></div>
                        {chatGPTStatus?.isConnected && <Badge className="bg-emerald-500">Connected</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Use ChatGPT Plus/Pro subscription via Codex.</p>
                    {chatGPTStatus?.isConnected ? (
                        <div className="space-y-2">
                            <p className="text-xs font-medium">{chatGPTStatus.email}</p>
                            <Button variant="outline" size="sm" className="w-full text-red-500" onClick={() => disconnectChatGPTMutation.mutate()}>Disconnect</Button>
                        </div>
                    ) : (
                        <Button className="w-full" onClick={() => connectChatGPTMutation.mutate()} disabled={connectChatGPTMutation.isPending}>
                            {connectChatGPTMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : <IconBrandOpenai className="mr-2" size={16} />}
                            Connect Plus
                        </Button>
                    )}
                </div>

                {/* Claude Code */}
                <div className={`border rounded-lg p-6 space-y-4 ${claudeCodeStatus?.isConnected ? 'border-orange-500/50 bg-orange-50/10' : ''}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <svg className="text-orange-500" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                            </svg>
                            <h4 className="font-semibold">Claude Code</h4>
                        </div>
                        {claudeCodeStatus?.isConnected && <Badge className="bg-orange-500">Connected</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Use Claude Pro/Max subscription for AI features.</p>
                    {claudeCodeStatus?.isConnected ? (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                                Connected {claudeCodeStatus.source === 'cli_import' ? '(from CLI)' : ''}
                            </p>
                            <Button variant="outline" size="sm" className="w-full text-red-500" onClick={() => disconnectClaudeCodeMutation.mutate()}>Disconnect</Button>
                        </div>
                    ) : (
                        <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={() => connectClaudeCodeMutation.mutate()} disabled={connectClaudeCodeMutation.isPending}>
                            {connectClaudeCodeMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : (
                                <svg className="mr-2" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                                </svg>
                            )}
                            Connect Claude
                        </Button>
                    )}
                </div>
            </div>

            {/* API Keys */}
            <div className="space-y-4">
                {/* OpenAI API */}
                <div className="border border-border rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><IconKey size={18} /><h4>OpenAI API</h4></div>
                        {keyStatus?.hasOpenAI && <Badge variant="secondary">Set</Badge>}
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input 
                                type={showOpenaiKey ? 'text' : 'password'} 
                                placeholder="sk-..."
                                value={openaiKey} 
                                onChange={e => setOpenaiKey(e.target.value)} 
                                className="pr-10" 
                            />
                            <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowOpenaiKey(!showOpenaiKey)}>
                                {showOpenaiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                            </Button>
                        </div>
                        <Button 
                            className="bg-[#D97757] hover:bg-[#C16648] text-white px-6 font-semibold"
                            onClick={() => setOpenAIKeyMutation.mutate({ key: openaiKey.trim() || null })} 
                            disabled={setOpenAIKeyMutation.isPending}
                        >
                            {setOpenAIKeyMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : 'Save'}
                        </Button>
                    </div>
                </div>

                {/* Z.AI Key */}
                <div className="border border-border rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><ZaiIcon size={18} className="text-amber-500" /><h4>Z.AI Key</h4></div>
                        {keyStatus?.hasZai && <Badge variant="secondary">Set</Badge>}
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input 
                                type={showZaiKey ? 'text' : 'password'} 
                                placeholder="zai-..."
                                value={zaiKey} 
                                onChange={e => setZaiKey(e.target.value)} 
                                className="pr-10" 
                            />
                            <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowZaiKey(!showZaiKey)}>
                                {showZaiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                            </Button>
                        </div>
                        <Button 
                            className="bg-[#D97757] hover:bg-[#C16648] text-white px-6 font-semibold"
                            onClick={() => setZaiKeyMutation.mutate({ key: zaiKey.trim() || null })} 
                            disabled={setZaiKeyMutation.isPending}
                        >
                            {setZaiKeyMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : 'Save'}
                        </Button>
                    </div>
                </div>

                {/* Tavily (Search) */}
                <div className="border border-border rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><IconWorldSearch size={18} className="text-blue-500" /><h4>Tavily (Search)</h4></div>
                        {keyStatus?.hasTavily && <Badge variant="secondary">Set</Badge>}
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input 
                                type={showTavilyKey ? 'text' : 'password'} 
                                placeholder="tvly-..."
                                value={tavilyKey} 
                                onChange={e => setTavilyKey(e.target.value)} 
                                className="pr-10" 
                            />
                            <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowTavilyKey(!showTavilyKey)}>
                                {showTavilyKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                            </Button>
                        </div>
                        <Button 
                            className="bg-[#D97757] hover:bg-[#C16648] text-white px-6 font-semibold"
                            onClick={() => setTavilyKeyMutation.mutate({ key: tavilyKey.trim() || null })} 
                            disabled={setTavilyKeyMutation.isPending}
                        >
                            {setTavilyKeyMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : 'Save'}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t border-border">
                <Button
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50/10 transition-colors"
                    onClick={() => { if(confirm('Are you sure you want to clear all stored credentials?')) clearAllKeysMutation.mutate() }}
                    disabled={clearAllKeysMutation.isPending}
                >
                    <IconTrash size={16} className="mr-2" />
                    Clear All Credentials
                </Button>
            </div>

            {/* Claude Code OAuth Dialog */}
            <Dialog open={showClaudeCodeDialog} onOpenChange={setShowClaudeCodeDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <svg className="text-orange-500" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                            </svg>
                            Connect Claude Code
                        </DialogTitle>
                        <DialogDescription>
                            A browser window should have opened. After authorizing, copy the code shown and paste it below.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="claude-auth-code">Authorization Code</Label>
                            <Input
                                id="claude-auth-code"
                                placeholder="Paste the code from the browser here..."
                                value={claudeAuthCode}
                                onChange={(e) => setClaudeAuthCode(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleClaudeCodeSubmit()
                                }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            The code looks like: NICCX5Iiy...#c1c70411-aaea-4f52-81ee-7e2f05f74b12
                        </p>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => {
                            setShowClaudeCodeDialog(false)
                            setClaudeAuthCode('')
                        }}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-orange-600 hover:bg-orange-700"
                            onClick={handleClaudeCodeSubmit}
                            disabled={completeClaudeCodeMutation.isPending || !claudeAuthCode.trim()}
                        >
                            {completeClaudeCodeMutation.isPending ? (
                                <IconLoader2 className="animate-spin mr-2" size={16} />
                            ) : null}
                            Connect
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
