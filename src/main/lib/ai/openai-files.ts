import OpenAI, { toFile } from 'openai'
import { supabase } from '../supabase/client'
import log from 'electron-log'

export interface OpenAIFileServiceConfig {
    apiKey: string
}

export class OpenAIFileService {
    private client: OpenAI

    constructor(config: OpenAIFileServiceConfig) {
        this.client = new OpenAI({
            apiKey: config.apiKey
        })
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

        // Create new vector store in OpenAI
        log.info('[OpenAIFileService] Creating new vector store for chat:', chatId)
        const vectorStore = await (this.client.beta as any).vectorStores.create({
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
     * Upload a file and add it to a vector store
     */
    async uploadAndAttachFile(vectorStoreId: string, fileData: Buffer, fileName: string): Promise<string> {
        log.info('[OpenAIFileService] Uploading file to OpenAI:', fileName)
        
        // 1. Upload file
        const file = await this.client.files.create({
            file: await toFile(fileData, fileName),
            purpose: 'assistants'
        })

        // 2. Attach to vector store
        log.info('[OpenAIFileService] Attaching file to vector store:', { fileId: file.id, vectorStoreId })
        await (this.client.beta as any).vectorStores.files.create(vectorStoreId, {
            file_id: file.id
        })

        return file.id
    }

    /**
     * Delete a file from OpenAI and vector store
     */
    async deleteFile(vectorStoreId: string, fileId: string): Promise<void> {
        try {
            // Remove from vector store first
            await (this.client.beta as any).vectorStores.files.del(vectorStoreId, fileId)
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
            const response = await (this.client.beta as any).vectorStores.files.list(vectorStoreId)
            const files = response.data || []
            
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
            const file = await (this.client.beta as any).vectorStores.files.retrieve(vectorStoreId, fileId)
            return file.status
        } catch (err) {
            log.error('[OpenAIFileService] Get file status error:', err)
            return 'unknown'
        }
    }
}
