import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { trpc } from '@/lib/trpc'
import { toast } from 'sonner'
import { IconLoader2, IconKey, IconShieldCheck, IconEye, IconEyeOff, IconTrash, IconBolt, IconWorldSearch } from '@tabler/icons-react'
import { useAtom, useAtomValue } from 'jotai'
import { availableModelsAtom, selectedModelAtom } from '@/lib/atoms'

export function ApiKeysTab() {
    const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom)
    const availableModels = useAtomValue(availableModelsAtom)
    
    // Get API key status
    const { data: keyStatus, isLoading: isStatusLoading } = trpc.settings.getApiKeyStatus.useQuery()

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

    const utils = trpc.useUtils()

    // Local state for form inputs
    const [openaiKey, setOpenaiKey] = useState('')
    const [tavilyKey, setTavilyKey] = useState('')
    const [showOpenaiKey, setShowOpenaiKey] = useState(false)
    const [showTavilyKey, setShowTavilyKey] = useState(false)

    const handleSaveOpenAIKey = () => {
        setOpenAIKeyMutation.mutate({ key: openaiKey.trim() || null })
        setOpenaiKey('')
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

    if (isStatusLoading) {
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

            {/* Model Selection */}
            <div className="border border-border rounded-lg p-6 space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <IconBolt size={18} />
                        <h4 className="font-medium">Model Selection</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Choose which GPT-5 model to use for chat.
                    </p>
                </div>

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

                {!keyStatus?.hasOpenAI && (
                    <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                        Configure your OpenAI API key below to enable AI features
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
