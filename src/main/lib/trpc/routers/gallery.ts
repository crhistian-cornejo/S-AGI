import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import log from 'electron-log'

interface GalleryImage {
    id: string
    url: string
    name: string
    type: 'uploaded' | 'generated' | 'edited'
    createdAt: string
    chatId: string | null
}

// Signed URL expiration (7 days in seconds)
const SIGNED_URL_EXPIRATION = 60 * 60 * 24 * 7

export const galleryRouter = router({
    /**
     * List all images (uploaded and generated) for the current user
     */
    list: protectedProcedure.query(async ({ ctx }) => {
        try {
            const allImages: GalleryImage[] = []

            // 1. Fetch uploaded images from chat_files
            const { data: uploadedFiles, error: uploadError } = await supabase
                .from('chat_files')
                .select('*')
                .eq('user_id', ctx.userId)
                .ilike('content_type', 'image/%')
                .order('created_at', { ascending: false })

            if (uploadError) {
                log.error('[GalleryRouter] Error fetching uploaded images:', uploadError)
            }

            // Add images from chat_files (user uploads only; generated/edited come from storage list below)
            // User uploads: bucket 'attachments', path userId/chat-files/...
            // AI-generated/edited: bucket 'images' — we skip those here and get them from the 'images' list
            if (uploadedFiles) {
                for (const file of uploadedFiles) {
                    if (!file.storage_path) continue
                    const path = file.storage_path as string
                    if (path.startsWith('generated/') || path.startsWith('edited/')) continue

                    const { data: signedData, error: signError } = await supabase.storage
                        .from('attachments')
                        .createSignedUrl(path, SIGNED_URL_EXPIRATION)

                    if (signError) {
                        log.warn('[GalleryRouter] Signed URL failed (attachments):', { path, err: signError.message })
                        continue
                    }
                    if (signedData?.signedUrl) {
                        allImages.push({
                            id: file.id,
                            url: signedData.signedUrl,
                            name: file.filename || path.split('/').pop() || 'image',
                            type: 'uploaded',
                            createdAt: file.created_at,
                            chatId: file.chat_id
                        })
                    }
                }
            }

            // 2. Fetch generated images from storage 'images' bucket
            // Images are stored in: generated/{chatId}/{uuid}.png and edited/{chatId}/{uuid}.png
            try {
                // List 'generated' folder
                const { data: generatedFolders, error: genError } = await supabase.storage
                    .from('images')
                    .list('generated', { limit: 100 })
                
                if (genError) {
                    log.warn('[GalleryRouter] Error listing generated folder:', genError)
                }

                if (generatedFolders) {
                    for (const folder of generatedFolders) {
                        // Each folder is a chatId - list images inside
                        const { data: chatImages } = await supabase.storage
                            .from('images')
                            .list(`generated/${folder.name}`, { limit: 50 })
                        
                        if (chatImages) {
                            for (const img of chatImages) {
                                if (img.name.match(/\.(png|jpg|jpeg|webp)$/i)) {
                                    const path = `generated/${folder.name}/${img.name}`
                                    const { data: signedData } = await supabase.storage
                                        .from('images')
                                        .createSignedUrl(path, SIGNED_URL_EXPIRATION)
                                    
                                    if (signedData?.signedUrl) {
                                        allImages.push({
                                            id: img.id || path,
                                            url: signedData.signedUrl,
                                            name: img.name,
                                            type: 'generated',
                                            createdAt: img.created_at || new Date().toISOString(),
                                            chatId: folder.name
                                        })
                                    }
                                }
                            }
                        }
                    }
                }

                // List 'edited' folder
                const { data: editedFolders, error: editError } = await supabase.storage
                    .from('images')
                    .list('edited', { limit: 100 })
                
                if (editError) {
                    log.warn('[GalleryRouter] Error listing edited folder:', editError)
                }

                if (editedFolders) {
                    for (const folder of editedFolders) {
                        const { data: chatImages } = await supabase.storage
                            .from('images')
                            .list(`edited/${folder.name}`, { limit: 50 })
                        
                        if (chatImages) {
                            for (const img of chatImages) {
                                if (img.name.match(/\.(png|jpg|jpeg|webp)$/i)) {
                                    const path = `edited/${folder.name}/${img.name}`
                                    const { data: signedData } = await supabase.storage
                                        .from('images')
                                        .createSignedUrl(path, SIGNED_URL_EXPIRATION)
                                    
                                    if (signedData?.signedUrl) {
                                        allImages.push({
                                            id: img.id || path,
                                            url: signedData.signedUrl,
                                            name: img.name,
                                            type: 'edited',
                                            createdAt: img.created_at || new Date().toISOString(),
                                            chatId: folder.name
                                        })
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                log.warn('[GalleryRouter] Failed to list storage images:', err)
            }

            // De-duplicate by URL
            const uniqueImages = Array.from(new Map(allImages.map(img => [img.url, img])).values())

            // Sort all by date (newest first)
            return uniqueImages.sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
        } catch (error) {
            log.error('[GalleryRouter] list error:', error)
            throw new Error('Failed to fetch gallery images')
        }
    })
})
