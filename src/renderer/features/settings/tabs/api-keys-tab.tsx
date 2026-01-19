import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { trpc } from '@/lib/trpc'
import { toast } from 'sonner'
import { IconLoader2, IconKey, IconShieldCheck, IconEye, IconEyeOff, IconTrash, IconBolt, IconWorldSearch, IconBrandOpenai, IconPlugConnected, IconPlugConnectedX, IconSparkles } from '@tabler/icons-react'
import { ZaiIcon } from '@/components/icons/model-icons'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { availableModelsAtom, selectedModelAtom, allModelsGroupedAtom, hasChatGPTPlusAtom, chatGPTPlusStatusAtom, currentProviderAtom } from '@/lib/atoms'
import type { AIProvider } from '@shared/ai-types'

export function ApiKeysTab() {
    const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom)
    const [currentProvider, setCurrentProvider] = useAtom(currentProviderAtom)
    const availableModels = useAtomValue(availableModelsAtom)
    const allModelsGrouped = useAtomValue(allModelsGroupedAtom)
    const setHasChatGPTPlus = useSetAtom(hasChatGPTPlusAtom)
    const setChatGPTPlusStatus = useSetAtom(chatGPTPlusStatusAtom)
    
    // Get API key status
    const { data: keyStatus, isLoading: isStatusLoading } = trpc.settings.getApiKeyStatus.useQuery()
    
    // Get ChatGPT Plus status
    const { data: chatGPTStatus, isLoading: isChatGPTStatusLoading } = trpc.auth.getChatGPTStatus.useQuery()
    
    // Update atoms when status changes
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

    // Mutations
    const setOpenAIKeyMutation = trpc.settings.setOpenAIKey.useMutation({
        onSuccess: () => {
            toast.success('OpenAI API key updated successfully')
            utils.settings.getApiKeyStatus.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update OpenAI API key')
        }
    })

    const setZaiKeyMutation = trpc.settings.setZaiKey.useMutation({
        onSuccess: () => {
            toast.success('Z.AI API key updated successfully')
            utils.settings.getApiKeyStatus.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update Z.AI API key')
        }
    })

    const setTavilyKeyMutation = trpc.settings.setTavilyKey.useMutation({
        onSuccess: () => {
            toast.success('Tavily API key updated successfully')
            utils.settings.getApiKeyStatus.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update Tavily API key')
        }
    })

    const clearAllKeysMutation = trpc.settings.clearAllKeys.useMutation({
        onSuccess: () => {
            toast.success('All API keys cleared successfully')
            utils.settings.getApiKeyStatus.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to clear API keys')
        }
    })

    // ChatGPT Plus OAuth mutations
    const connectChatGPTMutation = trpc.auth.connectChatGPT.useMutation({
        onSuccess: () => {
            toast.info('Opening ChatGPT authorization in browser...')
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to start ChatGPT connection')
        }
    })

    const disconnectChatGPTMutation = trpc.auth.disconnectChatGPT.useMutation({
        onSuccess: () => {
            toast.success('Disconnected from ChatGPT Plus')
            utils.auth.getChatGPTStatus.invalidate()
            // Switch back to openai provider if currently using chatgpt-plus
            if (currentProvider === 'chatgpt-plus') {
                setCurrentProvider('openai')
                setSelectedModel('gpt-5-mini')
            }
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to disconnect from ChatGPT Plus')
        }
    })

    const utils = trpc.useUtils()

    // Listen for ChatGPT Plus connection event from main process
    useEffect(() => {
        // @ts-ignore - desktopApi type extended in preload
        const cleanup = window.desktopApi?.onChatGPTConnected?.(() => {
            // Refresh status when OAuth completes
            utils.auth.getChatGPTStatus.invalidate()
            utils.settings.getApiKeyStatus.invalidate()
            toast.success('Connected to ChatGPT Plus!')
        })
        return () => cleanup?.()
    }, [utils])

    // Local state for form inputs
    const [openaiKey, setOpenaiKey] = useState('')
    const [zaiKey, setZaiKey] = useState('')
    const [tavilyKey, setTavilyKey] = useState('')
    const [showOpenaiKey, setShowOpenaiKey] = useState(false)
    const [showZaiKey, setShowZaiKey] = useState(false)
    const [showTavilyKey, setShowTavilyKey] = useState(false)

    const handleSaveOpenAIKey = () => {
        setOpenAIKeyMutation.mutate({ key: openaiKey.trim() || null })
        setOpenaiKey('')
    }

    const handleSaveZaiKey = () => {
        setZaiKeyMutation.mutate({ key: zaiKey.trim() || null })
        setZaiKey('')
    }

    const handleSaveTavilyKey = () => {
        setTavilyKeyMutation.mutate({ key: tavilyKey.trim() || null })
        setTavilyKey('')
    }

    const handleClearAllKeys = () => {
        if (confirm('Are you sure you want to clear all API keys? This will sign you out from all AI services.')) {
            clearAllKeysMutation.mutate()
        }
    }

    const handleConnectChatGPT = () => {
        connectChatGPTMutation.mutate()
    }

    const handleDisconnectChatGPT = () => {
        if (confirm('Are you sure you want to disconnect from ChatGPT Plus?')) {
            disconnectChatGPTMutation.mutate()
        }
    }

    const handleProviderChange = (provider: AIProvider) => {
        setCurrentProvider(provider)
        // Set default model for the provider
        const models = provider === 'chatgpt-plus' 
            ? allModelsGrouped['chatgpt-plus'] 
            : provider === 'zai'
                ? allModelsGrouped.zai
                : allModelsGrouped.openai
        if (models.length > 0) {
            setSelectedModel(models[0].id)
        }
    }

    if (isStatusLoading || isChatGPTStatusLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <IconLoader2 className="animate-spin" size={24} />
            </div>
        )
    }

    return (
        <div className="space-y-6 p-6">
            <div className="space-y-2">
                <h3 className="text-lg font-semibold">API Keys</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your API keys for AI providers. Keys are stored securely using your system's keychain.
                </p>
            </div>

            {/* Security Notice */}
            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                <IconShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="text-sm text-green-800 dark:text-green-200">
                    Your API keys are stored securely using your system's keychain and are never exposed in the browser or logs.
                </div>
            </div>

            {/* Provider & Model Selection */}
            <div className="border border-border rounded-lg p-6 space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <IconBolt size={18} />
                        <h4 className="font-medium">AI Provider & Model</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Choose your AI provider and model. ChatGPT Plus uses your subscription (no per-token cost).
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Provider Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="provider-select">Provider</Label>
                        <Select value={currentProvider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
                            <SelectTrigger id="provider-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="openai">
                                    <div className="flex items-center gap-2">
                                        <IconKey size={14} />
                                        <span>OpenAI API</span>
                                        {keyStatus?.hasOpenAI && <Badge variant="secondary" className="text-xs ml-1">Key Set</Badge>}
                                    </div>
                                </SelectItem>
                                <SelectItem value="zai">
                                    <div className="flex items-center gap-2">
                                        <ZaiIcon className="text-amber-500" size={14} />
                                        <span>Z.AI Coding</span>
                                        {keyStatus?.hasZai && <Badge variant="secondary" className="text-xs ml-1">Key Set</Badge>}
                                    </div>
                                </SelectItem>
                                <SelectItem value="chatgpt-plus" disabled={!chatGPTStatus?.isConnected}>
                                    <div className="flex items-center gap-2">
                                        <IconSparkles size={14} />
                                        <span>ChatGPT Plus</span>
                                        {chatGPTStatus?.isConnected ? (
                                            <Badge variant="secondary" className="text-xs ml-1">Connected</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-xs ml-1">Not Connected</Badge>
                                        )}
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Model Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="model-select">Model</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                            <SelectTrigger id="model-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {availableModels.map((model) => (
                                    <SelectItem key={model.id} value={model.id}>
                                        <div className="flex flex-col">
                                            <span>{model.name}</span>
                                            {model.description && (
                                                <span className="text-xs text-muted-foreground">{model.description}</span>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {currentProvider === 'openai' && !keyStatus?.hasOpenAI && (
                    <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                        Configure your OpenAI API key below to enable AI features
                    </div>
                )}

                {currentProvider === 'zai' && !keyStatus?.hasZai && (
                    <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                        Configure your Z.AI API key below to enable GLM models
                    </div>
                )}
                
                {currentProvider === 'chatgpt-plus' && chatGPTStatus?.isConnected && (
                    <div className="text-sm text-emerald-600 dark:text-emerald-400 p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-md flex items-center gap-2">
                        <IconPlugConnected size={16} />
                        Using ChatGPT Plus subscription - no per-token cost
                    </div>
                )}
            </div>

            {/* ChatGPT Plus OAuth Connection */}
            <div className={`border rounded-lg p-6 space-y-4 ${chatGPTStatus?.isConnected ? 'border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-border'}`}>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <IconBrandOpenai size={18} />
                        <h4 className="font-medium">ChatGPT Plus / Pro</h4>
                        {chatGPTStatus?.isConnected ? (
                            <Badge variant="default" className="text-xs bg-emerald-600">
                                <IconPlugConnected size={12} className="mr-1" />
                                Connected
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-xs">
                                Not Connected
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Connect your ChatGPT Plus or Pro subscription to use GPT-5 Codex models without per-token costs.
                        Your subscription is used instead of API credits.
                    </p>
                </div>

                {chatGPTStatus?.isConnected ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">{chatGPTStatus.email || 'Connected'}</p>
                                {chatGPTStatus.connectedAt && (
                                    <p className="text-xs text-muted-foreground">
                                        Connected {new Date(chatGPTStatus.connectedAt).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDisconnectChatGPT}
                                disabled={disconnectChatGPTMutation.isPending}
                                className="hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                            >
                                {disconnectChatGPTMutation.isPending ? (
                                    <IconLoader2 className="animate-spin mr-2" size={14} />
                                ) : (
                                    <IconPlugConnectedX className="mr-2" size={14} />
                                )}
                                Disconnect
                            </Button>
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                            Available models: {allModelsGrouped['chatgpt-plus'].map(m => m.name).join(', ')}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <Button
                            onClick={handleConnectChatGPT}
                            disabled={connectChatGPTMutation.isPending}
                            className="w-full"
                        >
                            {connectChatGPTMutation.isPending ? (
                                <IconLoader2 className="animate-spin mr-2" size={16} />
                            ) : (
                                <IconBrandOpenai className="mr-2" size={16} />
                            )}
                            Connect ChatGPT Plus
                        </Button>
                        
                        <p className="text-xs text-muted-foreground text-center">
                            You'll be redirected to OpenAI to authorize access to your ChatGPT subscription.
                        </p>
                    </div>
                )}
            </div>

            {/* OpenAI API Key */}
            <div className="border border-border rounded-lg p-6 space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <IconKey size={18} />
                        <h4 className="font-medium">OpenAI API Key</h4>
                        {keyStatus?.hasOpenAI && (
                            <Badge variant="secondary" className="text-xs">
                                Configured
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Required for GPT-5 models. Get your API key from{' '}
                        <a
                            href="https://platform.openai.com/api-keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2"
                        >
                            OpenAI Platform
                        </a>
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            type={showOpenaiKey ? 'text' : 'password'}
                            placeholder={keyStatus?.hasOpenAI ? '••••••••••••••••' : 'sk-...'}
                            value={openaiKey}
                            onChange={(e) => setOpenaiKey(e.target.value)}
                            className="pr-10"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                        >
                            {showOpenaiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </Button>
                    </div>
                    <Button
                        onClick={handleSaveOpenAIKey}
                        disabled={setOpenAIKeyMutation.isPending || !openaiKey.trim()}
                    >
                        {setOpenAIKeyMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : 'Save'}
                    </Button>
                </div>
            </div>

            {/* Z.AI API Key */}
            <div className="border border-border rounded-lg p-6 space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <ZaiIcon className="text-amber-500" size={18} />
                        <h4 className="font-medium">Z.AI API Key</h4>
                        {keyStatus?.hasZai && (
                            <Badge variant="secondary" className="text-xs">
                                Configured
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Required for GLM-4.7 and GLM-4.5 Air. Paste your Z.AI Coding Plan key.
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            type={showZaiKey ? 'text' : 'password'}
                            placeholder={keyStatus?.hasZai ? '••••••••••••••••' : 'zai-...'}
                            value={zaiKey}
                            onChange={(e) => setZaiKey(e.target.value)}
                            onPaste={(event) => {
                                const text = event.clipboardData.getData('text')
                                if (text) {
                                    event.preventDefault()
                                    setZaiKey(text)
                                }
                            }}
                            onKeyDown={(event) => {
                                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
                                    event.preventDefault()
                                    navigator.clipboard
                                        .readText()
                                        .then((text) => {
                                            if (text) setZaiKey(text)
                                        })
                                        .catch(() => {
                                            // Fallback: let the default paste happen if clipboard read fails
                                            const input = event.currentTarget
                                            input.focus()
                                        })
                                }
                            }}
                            className="pr-10"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => setShowZaiKey(!showZaiKey)}
                        >
                            {showZaiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </Button>
                    </div>
                    <Button
                        onClick={handleSaveZaiKey}
                        disabled={setZaiKeyMutation.isPending || !zaiKey.trim()}
                    >
                        {setZaiKeyMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : 'Save'}
                    </Button>
                </div>
            </div>

            {/* Tavily API Key */}
            <div className="border border-border rounded-lg p-6 space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <IconWorldSearch size={18} />
                        <h4 className="font-medium">Tavily API Key</h4>
                        <Badge variant="outline" className="text-xs">Optional</Badge>
                        {keyStatus?.hasTavily && (
                            <Badge variant="secondary" className="text-xs">
                                Configured
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Optional fallback for web search. GPT-5 models have native web search, but Tavily can be used as backup.{' '}
                        <a
                            href="https://tavily.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2"
                        >
                            Get a free key
                        </a>
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            type={showTavilyKey ? 'text' : 'password'}
                            placeholder={keyStatus?.hasTavily ? '••••••••••••••••' : 'tvly-...'}
                            value={tavilyKey}
                            onChange={(e) => setTavilyKey(e.target.value)}
                            className="pr-10"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => setShowTavilyKey(!showTavilyKey)}
                        >
                            {showTavilyKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </Button>
                    </div>
                    <Button
                        onClick={handleSaveTavilyKey}
                        disabled={setTavilyKeyMutation.isPending || !tavilyKey.trim()}
                    >
                        {setTavilyKeyMutation.isPending ? <IconLoader2 className="animate-spin" size={16} /> : 'Save'}
                    </Button>
                </div>
            </div>

            {/* Clear All Keys */}
            <div className="border border-destructive/20 rounded-lg p-6 space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <IconTrash size={18} className="text-destructive" />
                        <h4 className="font-medium text-destructive">Clear All API Keys</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        This will remove all stored API keys. You will need to re-enter them to use AI features.
                    </p>
                </div>
                <Button
                    variant="destructive"
                    onClick={handleClearAllKeys}
                    disabled={clearAllKeysMutation.isPending}
                >
                    {clearAllKeysMutation.isPending ? (
                        <IconLoader2 className="animate-spin mr-2" size={16} />
                    ) : (
                        <IconTrash className="mr-2" size={16} />
                    )}
                    Clear All Keys
                </Button>
            </div>
        </div>
    )
}
