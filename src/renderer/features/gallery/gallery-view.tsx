"use client";

import React, { useState } from "react";
import { useAtom, useSetAtom } from 'jotai'
import { sidebarOpenAtom, activeTabAtom, commandKOpenAtom } from '@/lib/atoms'
import { trpc } from '@/lib/trpc'
import { motion, AnimatePresence } from 'motion/react'
import { IconPhoto, IconDownload, IconExternalLink, IconRefresh, IconX, IconLayoutSidebarLeftExpand, IconPlus, IconHistory } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// --- Focus Card Component (User Style) ---
export const Card = React.memo(
  ({
    card,
    index,
    hovered,
    setHovered,
    onClick,
  }: {
    card: any;
    index: number;
    hovered: number | null;
    setHovered: React.Dispatch<React.SetStateAction<number | null>>;
    onClick: () => void;
  }) => {
    const [imgError, setImgError] = useState(false)
    return (
    <div
      onMouseEnter={() => setHovered(index)}
      onMouseLeave={() => setHovered(null)}
      onClick={onClick}
      className={cn(
        "rounded-2xl relative bg-gray-100 dark:bg-neutral-900 overflow-hidden h-full w-full transition-all duration-300 ease-out cursor-zoom-in border border-border/50 shadow-sm",
        hovered !== null && hovered !== index && "blur-[2px] scale-[0.98] opacity-50"
      )}
    >
      {imgError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground p-4">
          <IconPhoto size={32} className="opacity-50" />
          <span className="text-xs text-center">No se pudo cargar</span>
        </div>
      ) : (
        <img
          src={card.src}
          alt={card.title}
          className="object-cover absolute inset-0 w-full h-full"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      )}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 flex flex-col justify-end py-6 px-4 transition-opacity duration-300",
          hovered === index ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="text-lg font-semibold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-200 truncate">
          {card.title}
        </div>
        <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-neutral-400">
                {card.date}
            </span>
            <button 
                type="button"
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                onClick={(e) => {
                    e.stopPropagation()
                    window.open(card.src, '_blank')
                }}
            >
                <IconExternalLink size={14} />
            </button>
        </div>
      </div>
    </div>
    )
  }
);

Card.displayName = "Card";

// --- Main Gallery View ---
export function GalleryView() {
    const { data: images, isLoading, refetch, isFetching } = trpc.gallery.list.useQuery()
    const [hovered, setHovered] = useState<number | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)
    const [, setActiveTab] = useAtom(activeTabAtom)
    const setCommandKOpen = useSetAtom(commandKOpenAtom)
    
    // Get platform info at runtime for better detection
    const platform = (window as any).desktopApi?.platform || 'unknown'
    const isWindowsRuntime = platform === 'win32'
    
    // Debug log
    React.useEffect(() => {
        console.log('[Gallery] Platform detected:', platform, 'isWindows:', isWindowsRuntime)
        console.log('[Gallery] desktopApi available:', !!(window as any).desktopApi)
    }, [])

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    <IconPhoto className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary opacity-50" size={20} />
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">Loading your gallery...</p>
            </div>
        )
    }

    if (!images || images.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-24 h-24 rounded-3xl bg-accent/30 flex items-center justify-center mb-2">
                    <IconPhoto size={48} className="text-muted-foreground/40" />
                </div>
                <div className="space-y-2 max-w-xs">
                    <h3 className="text-xl font-semibold">Empty Gallery</h3>
                    <p className="text-sm text-muted-foreground">
                        Images you upload or generate with AI will appear here.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 rounded-xl">
                    <IconRefresh size={14} />
                    Refresh
                </Button>
            </div>
        )
    }

    // Map TRPC data to FocusCards format
    const cards = images.map(img => ({
        title: img.name,
        src: img.url,
        date: new Date(img.createdAt).toLocaleDateString(),
        id: img.id
    }))

    return (
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
            {/* Header */}
            <div className="h-14 border-b border-border/50 flex items-center px-4 shrink-0 gap-2">
                {/* Botón sidebar toggle cuando está cerrado - Solo Windows */}
                {isWindowsRuntime && !sidebarOpen && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg shrink-0"
                                onClick={() => setSidebarOpen(true)}
                            >
                                <IconLayoutSidebarLeftExpand size={18} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Open Sidebar</TooltipContent>
                    </Tooltip>
                )}
                
                <IconPhoto className="text-primary shrink-0" size={20} />
                <h2 className="font-semibold tracking-tight shrink-0">Gallery</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold uppercase tracking-wider shrink-0">
                    {images.length} items
                </span>
                
                <div className="w-px h-6 bg-border shrink-0 mx-1" />
                
                {/* Acciones - Solo Windows */}
                {isWindowsRuntime && (
                    <div className="flex items-center gap-1 shrink-0">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg"
                                    onClick={() => setActiveTab('chat')}
                                >
                                    <IconPlus size={18} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">New Chat</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg"
                                    onClick={() => setCommandKOpen(true)}
                                >
                                    <IconHistory size={18} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Search chats</TooltipContent>
                        </Tooltip>
                    </div>
                )}
                
                <div className="flex-1" />
                
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => refetch()} 
                            disabled={isFetching}
                            className="h-8 w-8 rounded-lg"
                        >
                            <IconRefresh size={18} className={cn(isFetching && "animate-spin")} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Refresh</TooltipContent>
                </Tooltip>
            </div>

            {/* Bento-styled grid using user's FocusCards logic */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-[1600px] mx-auto w-full auto-rows-[200px]">
                    {cards.map((card, index) => {
                        // Create variety for bento effect
                        const isLarge = index % 9 === 0
                        const isWide = index % 11 === 3
                        const isTall = index % 7 === 5

                        return (
                            <motion.div
                                key={card.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className={cn(
                                    isLarge && "md:col-span-2 md:row-span-2 h-auto",
                                    isWide && "md:col-span-2 h-auto",
                                    isTall && "md:row-span-2 h-auto"
                                )}
                            >
                                <Card
                                    card={card}
                                    index={index}
                                    hovered={hovered}
                                    setHovered={setHovered}
                                    onClick={() => setSelectedImage(card.src)}
                                />
                            </motion.div>
                        )
                    })}
                </div>
            </div>

            {/* Lightbox */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8"
                        onClick={() => setSelectedImage(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative max-w-full max-h-full overflow-hidden rounded-2xl shadow-2xl border border-white/10 flex items-center justify-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img 
                                src={selectedImage} 
                                alt="Full size" 
                                className="max-w-full max-h-[85vh] object-contain select-none"
                            />
                        </motion.div>
                        
                        <div className="absolute top-6 right-6 flex gap-3">
                             <Button 
                                type="button"
                                variant="outline" 
                                size="sm" 
                                className="bg-white/10 border-white/20 text-white hover:bg-white/20 rounded-xl backdrop-blur-md"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    window.open(selectedImage, '_blank')
                                }}
                            >
                                <IconDownload size={16} className="mr-2" />
                                Download
                            </Button>
                            <Button 
                                type="button"
                                variant="ghost" 
                                size="icon" 
                                className="text-white hover:bg-white/10 rounded-full h-10 w-10 backdrop-blur-md"
                                onClick={() => setSelectedImage(null)}
                            >
                                <IconX size={24} />
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
