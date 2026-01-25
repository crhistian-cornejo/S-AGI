import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconCamera, IconEdit, IconLoader2, IconPhoto, IconTrash, IconUser } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export type AvatarUpdate =
    | { mode: 'remove' }
    | { mode: 'provider'; providerUrl: string }
    | { mode: 'upload'; dataUrl: string }

type EditorImage = {
    img: HTMLImageElement
    naturalWidth: number
    naturalHeight: number
}

export function AvatarEditorDialog({
    open,
    onOpenChange,
    currentAvatarUrl,
    providerAvatarUrl,
    value,
    onChange
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    currentAvatarUrl: string | null
    providerAvatarUrl: string | null
    value: AvatarUpdate | null
    onChange: (next: AvatarUpdate | null) => void
}) {
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const cameraStreamRef = useRef<MediaStream | null>(null)
    const editorCanvasRef = useRef<HTMLCanvasElement | null>(null)

    const [isBusy, setIsBusy] = useState(false)
    const [editorImage, setEditorImage] = useState<EditorImage | null>(null)
    const [scale, setScale] = useState(1)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [dragState, setDragState] = useState<{ active: boolean; startX: number; startY: number; startOffsetX: number; startOffsetY: number }>({
        active: false,
        startX: 0,
        startY: 0,
        startOffsetX: 0,
        startOffsetY: 0
    })
    const [cameraActive, setCameraActive] = useState(false)

    const displayedUrl = useMemo(() => {
        if (value?.mode === 'upload') return value.dataUrl
        if (value?.mode === 'provider') return value.providerUrl
        if (value?.mode === 'remove') return null
        return currentAvatarUrl
    }, [currentAvatarUrl, value])

    const canUseProvider = !!providerAvatarUrl && /^https?:\/\//.test(providerAvatarUrl)

    const loadImage = async (src: string) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = src
        })
        setEditorImage({
            img,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
        })
        setScale(1)
        setOffset({ x: 0, y: 0 })
    }

    const stopCamera = () => {
        const stream = cameraStreamRef.current
        if (stream) {
            stream.getTracks().forEach((t) => t.stop())
            cameraStreamRef.current = null
        }
        setCameraActive(false)
    }

    const startCamera = async () => {
        setIsBusy(true)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
            cameraStreamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                await videoRef.current.play()
            }
            setCameraActive(true)
        } finally {
            setIsBusy(false)
        }
    }

    const captureFromCamera = async () => {
        if (!videoRef.current) return
        setIsBusy(true)
        try {
            const video = videoRef.current
            const w = Math.max(1, video.videoWidth)
            const h = Math.max(1, video.videoHeight)
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('Canvas not supported')
            ctx.drawImage(video, 0, 0, w, h)
            const dataUrl = canvas.toDataURL('image/png')
            await loadImage(dataUrl)
            stopCamera()
        } finally {
            setIsBusy(false)
        }
    }

    const openFilePicker = () => fileInputRef.current?.click()

    const onFileSelected = async (file: File | null) => {
        if (!file) return
        setIsBusy(true)
        try {
            const objectUrl = URL.createObjectURL(file)
            try {
                await loadImage(objectUrl)
            } finally {
                URL.revokeObjectURL(objectUrl)
            }
        } finally {
            setIsBusy(false)
        }
    }

    const renderPreview = useCallback(() => {
        const canvas = editorCanvasRef.current
        const image = editorImage?.img
        if (!canvas || !image) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const size = canvas.width
        const imgW = editorImage.naturalWidth
        const imgH = editorImage.naturalHeight
        const coverScale = Math.max(size / imgW, size / imgH)
        const s = coverScale * scale

        const drawW = imgW * s
        const drawH = imgH * s
        const x = (size - drawW) / 2 + offset.x
        const y = (size - drawH) / 2 + offset.y

        ctx.clearRect(0, 0, size, size)
        ctx.fillStyle = '#0b0b0c'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(image, x, y, drawW, drawH)
    }, [editorImage, offset.x, offset.y, scale])

    const exportCropped = async (): Promise<string> => {
        const canvas = editorCanvasRef.current
        const image = editorImage?.img
        if (!canvas || !image) throw new Error('No image loaded')

        const size = canvas.width
        const imgW = editorImage.naturalWidth
        const imgH = editorImage.naturalHeight
        const coverScale = Math.max(size / imgW, size / imgH)
        const s = coverScale * scale

        const drawW = imgW * s
        const drawH = imgH * s
        const x = (size - drawW) / 2 + offset.x
        const y = (size - drawH) / 2 + offset.y

        const out = document.createElement('canvas')
        out.width = 256
        out.height = 256
        const outCtx = out.getContext('2d')
        if (!outCtx) throw new Error('Canvas not supported')
        outCtx.imageSmoothingEnabled = true
        outCtx.imageSmoothingQuality = 'high'
        outCtx.fillStyle = '#000'
        outCtx.fillRect(0, 0, 256, 256)

        const scaleOut = 256 / size
        outCtx.drawImage(image, x * scaleOut, y * scaleOut, drawW * scaleOut, drawH * scaleOut)

        const webp = out.toDataURL('image/webp', 0.92)
        if (webp.startsWith('data:image/webp')) return webp
        return out.toDataURL('image/png')
    }

    useEffect(() => {
        if (!open) {
            stopCamera()
            setEditorImage(null)
            setScale(1)
            setOffset({ x: 0, y: 0 })
            return
        }
    }, [open])

    useEffect(() => {
        renderPreview()
    }, [renderPreview])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[740px]">
                <DialogHeader>
                    <DialogTitle>Edit profile picture</DialogTitle>
                    <DialogDescription>
                        Upload, capture with camera, or use your provider photo.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-[320px_1fr] gap-6">
                    <div className="space-y-3">
                        <div className="relative">
                            <canvas
                                ref={editorCanvasRef}
                                width={320}
                                height={320}
                                className={cn(
                                    'rounded-xl border border-border bg-muted',
                                    editorImage ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                                )}
                                onPointerDown={(e) => {
                                    if (!editorImage) return
                                    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
                                    setDragState({
                                        active: true,
                                        startX: e.clientX,
                                        startY: e.clientY,
                                        startOffsetX: offset.x,
                                        startOffsetY: offset.y
                                    })
                                }}
                                onPointerMove={(e) => {
                                    if (!dragState.active) return
                                    setOffset({
                                        x: dragState.startOffsetX + (e.clientX - dragState.startX),
                                        y: dragState.startOffsetY + (e.clientY - dragState.startY)
                                    })
                                }}
                                onPointerUp={() => setDragState((s) => ({ ...s, active: false }))}
                                onPointerCancel={() => setDragState((s) => ({ ...s, active: false }))}
                            />
                            {!editorImage && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                    <IconUser size={26} />
                                    <div className="text-xs">Choose an image to edit</div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">Zoom</div>
                                <div className="text-xs tabular-nums text-muted-foreground">{scale.toFixed(2)}×</div>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={3}
                                step={0.01}
                                value={scale}
                                onChange={(e) => setScale(Number(e.target.value))}
                                disabled={!editorImage}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-14 w-14 rounded-full border border-border overflow-hidden bg-muted">
                                {displayedUrl ? (
                                    <img src={displayedUrl} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                        <IconUser size={20} />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className="text-sm font-medium">Preview</div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {value?.mode ? `Pending: ${value.mode}` : 'No changes yet'}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" onClick={openFilePicker} disabled={isBusy}>
                                {isBusy ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconPhoto className="h-4 w-4 mr-2" />}
                                Upload
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => (cameraActive ? stopCamera() : startCamera())}
                                disabled={isBusy}
                            >
                                {cameraActive ? (
                                    <>
                                        <IconCamera className="h-4 w-4 mr-2" />
                                        Stop camera
                                    </>
                                ) : (
                                    <>
                                        <IconCamera className="h-4 w-4 mr-2" />
                                        Camera
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                    if (!currentAvatarUrl) return
                                    setIsBusy(true)
                                    try {
                                        await loadImage(currentAvatarUrl)
                                    } finally {
                                        setIsBusy(false)
                                    }
                                }}
                                disabled={!currentAvatarUrl || isBusy}
                            >
                                <IconEdit className="h-4 w-4 mr-2" />
                                Edit current
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (!providerAvatarUrl) return
                                    onChange({ mode: 'provider', providerUrl: providerAvatarUrl })
                                    setEditorImage(null)
                                    setScale(1)
                                    setOffset({ x: 0, y: 0 })
                                }}
                                disabled={!canUseProvider || isBusy}
                            >
                                <IconUser className="h-4 w-4 mr-2" />
                                Provider photo
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    onChange({ mode: 'remove' })
                                    setEditorImage(null)
                                    setScale(1)
                                    setOffset({ x: 0, y: 0 })
                                }}
                                disabled={isBusy}
                            >
                                <IconTrash className="h-4 w-4 mr-2" />
                                Remove
                            </Button>
                        </div>

                        {cameraActive && (
                            <div className="rounded-xl border border-border overflow-hidden bg-muted">
                                <video ref={videoRef} className="w-full aspect-video object-cover" muted playsInline />
                                <div className="p-3 flex justify-end">
                                    <Button size="sm" onClick={captureFromCamera} disabled={isBusy}>
                                        {isBusy && <IconLoader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Capture
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl border border-border p-3">
                            <div className="text-xs text-muted-foreground">
                                Tip: drag the image in the square to reposition, then adjust zoom.
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={async () => {
                            if (!editorImage) {
                                onOpenChange(false)
                                return
                            }
                            setIsBusy(true)
                            try {
                                const dataUrl = await exportCropped()
                                onChange({ mode: 'upload', dataUrl })
                                onOpenChange(false)
                            } finally {
                                setIsBusy(false)
                            }
                        }}
                        disabled={isBusy || !editorImage}
                    >
                        {isBusy && <IconLoader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Use this image
                    </Button>
                </DialogFooter>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
                />
            </DialogContent>
        </Dialog>
    )
}
