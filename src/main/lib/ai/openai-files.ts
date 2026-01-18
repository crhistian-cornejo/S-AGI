import OpenAIModule, { toFile } from 'openai'
import type OpenAIType from 'openai'
import { supabase } from '../supabase/client'
import log from 'electron-log'

// Handle both ESM and CJS module systems
const OpenAI = (OpenAIModule as any).default || OpenAIModule

export interface OpenAIFileServiceConfig {
    apiKey: string
}

export class OpenAIFileService {
    private client: OpenAIType

    constructor(config: OpenAIFileServiceConfig) {
        if (!config.apiKey) {
            log.error('[OpenAIFileService] No API key provided!')
            throw new Error('OpenAI API key is required')
        }
        
        log.info('[OpenAIFileService] Initializing with API key length:', config.apiKey.length)
        
        this.client = new OpenAI({
            apiKey: config.apiKey
        })
        
        // Verify client is properly initialized
        log.info('[OpenAIFileService] Client initialized, vectorStores available:', !!this.client.vectorStores)
    }

    /**
     * Get or create a vector store for a specific chat
     */
    async getOrCreateVectorStore(chatId: string, userId: string): Promise<string> {
        // Check if chat already has a vector store ID
        const { data: chat, error } = await supabase
            .from('chats')
            .select('openai_vector_store_id, title')
            .eq('id', chatId)
            .eq('user_id', userId)
            .single()

        if (error || !chat) {
            log.error('[OpenAIFileService] Chat not found:', { chatId, error })
            throw new Error('Chat not found')
        }

        if (chat.openai_vector_store_id) {
            return chat.openai_vector_store_id
        }

        // Create new vector store in OpenAI (SDK v6+ uses client.vectorStores directly)
        log.info('[OpenAIFileService] Creating new vector store for chat:', chatId)
        log.info('[OpenAIFileService] client.vectorStores type:', typeof this.client.vectorStores)
        log.info('[OpenAIFileService] client.vectorStores.create type:', typeof this.client.vectorStores?.create)
        
        if (!this.client.vectorStores) {
            log.error('[OpenAIFileService] vectorStores is undefined on client!')
            throw new Error('OpenAI client not properly initialized - vectorStores is undefined')
        }
        
        const vectorStore = await this.client.vectorStores.create({
            name: `Chat: ${chat.title || chatId}`,
            metadata: {
                chatId: chatId,
                userId: userId
            }
        })

        // Save ID to Supabase
        const { data: updateData, error: updateError } = await supabase
            .from('chats')
            .update({ openai_vector_store_id: vectorStore.id })
            .eq('id', chatId)
            .select()

        if (updateError) {
            log.error('[OpenAIFileService] Failed to save vector store ID:', updateError)
        } else {
            log.info('[OpenAIFileService] Vector store ID saved to Supabase:', { chatId, vectorStoreId: vectorStore.id, updateData })
        }

        return vectorStore.id
    }

    /**
     * Upload a file and add it to a vector store, waiting for processing to complete
     */
    async uploadAndAttachFile(vectorStoreId: string, fileData: Buffer, fileName: string): Promise<string> {
        log.info('[OpenAIFileService] Uploading file to OpenAI:', fileName)
        
        // 1. Upload file
        const file = await this.client.files.create({
            file: await toFile(fileData, fileName),
            purpose: 'assistants'
        })
        log.info('[OpenAIFileService] File created in OpenAI:', file.id)

        // 2. Attach to vector store and poll until processing is complete
        log.info('[OpenAIFileService] Attaching file to vector store and polling:', { fileId: file.id, vectorStoreId })
        
        // First, attach the file
        await this.client.vectorStores.files.create(vectorStoreId, {
            file_id: file.id
        })
        
        // Then poll until processing is complete (max 60 seconds)
        const maxAttempts = 30 // 30 * 2s = 60s max
        let attempts = 0
        let status = 'in_progress'
        
        while (status === 'in_progress' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
            attempts++
            
            try {
                const fileStatus = await this.client.vectorStores.files.retrieve(file.id, { 
                    vector_store_id: vectorStoreId 
                })
                status = fileStatus.status
                log.info(`[OpenAIFileService] File status poll ${attempts}/${maxAttempts}:`, status)
                
                if (status === 'completed') {
                    log.info('[OpenAIFileService] File processing completed:', file.id)
                    break
                } else if (status === 'failed' || status === 'cancelled') {
                    log.error('[OpenAIFileService] File processing failed:', status)
                    throw new Error(`File processing ${status}`)
                }
            } catch (err) {
                log.warn('[OpenAIFileService] Error checking file status:', err)
            }
        }
        
        if (status !== 'completed') {
            log.warn('[OpenAIFileService] File processing timed out, status:', status)
            // Continue anyway, the file might be available soon
        }

        return file.id
    }

    /**
     * Delete a file from OpenAI and vector store
     */
    async deleteFile(vectorStoreId: string, fileId: string): Promise<void> {
        try {
            // Remove from vector store first (SDK v6+ signature: delete(fileId, { vector_store_id }))
            await this.client.vectorStores.files.delete(fileId, { vector_store_id: vectorStoreId })
            // Then delete the file itself
            await this.client.files.delete(fileId)
            log.info('[OpenAIFileService] Deleted file:', fileId)
        } catch (err) {
            log.error('[OpenAIFileService] Delete file error:', err)
            throw err
        }
    }

    /**
     * List all files in a vector store
     */
    async listVectorStoreFiles(vectorStoreId: string): Promise<Array<{
        id: string
        filename: string
        status: string
        bytes: number
        createdAt: number
    }>> {
        try {
            // SDK v6+ uses client.vectorStores directly and returns an async iterator
            const filesIterator = await this.client.vectorStores.files.list(vectorStoreId)
            const files: any[] = []
            for await (const file of filesIterator) {
                files.push(file)
            }
            
            // Fetch file details for each file to get filename
            const filesWithDetails = await Promise.all(
                files.map(async (vsFile: any) => {
                    try {
                        const fileDetails = await this.client.files.retrieve(vsFile.id)
                        return {
                            id: vsFile.id,
                            filename: fileDetails.filename,
                            status: vsFile.status,
                            bytes: fileDetails.bytes,
                            createdAt: fileDetails.created_at
                        }
                    } catch (err) {
                        log.warn('[OpenAIFileService] Could not get file details:', vsFile.id)
                        return {
                            id: vsFile.id,
                            filename: 'Unknown',
                            status: vsFile.status,
                            bytes: 0,
                            createdAt: 0
                        }
                    }
                })
            )
            
            return filesWithDetails
        } catch (err) {
            log.error('[OpenAIFileService] List files error:', err)
            return []
        }
    }

    /**
     * Check the status of a file in a vector store
     */
    async getFileStatus(vectorStoreId: string, fileId: string): Promise<string> {
        try {
            // SDK v6+ signature: retrieve(fileId, { vector_store_id })
            const file = await this.client.vectorStores.files.retrieve(fileId, { vector_store_id: vectorStoreId })
            return file.status
        } catch (err) {
            log.error('[OpenAIFileService] Get file status error:', err)
            return 'unknown'
        }
    }
}
