# 🟠 PRIORITY 2: Extract Business Logic from Routers

**Status**: 🟡 PENDING  
**Severity**: 🟠 HIGH  
**Estimated Time**: 2-3 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Problem**: Business logic is embedded in tRPC routers, making them difficult to test, reuse, and maintain. Routers should be thin and delegate to services.

---

## 🎯 Objectives

1. Create `src/main/lib/services/` directory
2. Extract business logic from routers to services
3. Keep routers focused on API layer
4. Improve testability

---

## 📋 Functions to Extract

### From `chats.ts`

1. **cleanupChatFiles()** (~140 lines)
   - Location: Lines 6-142
   - Responsibilities:
     - Delete chat files from storage
     - Delete OpenAI vector store files
     - Update database records
   - Target: `services/chat-cleanup-service.ts`

2. **enrichWithMeta()** (~80 lines)
   - Location: Lines 150-230
   - Responsibilities:
     - Add metadata to chat
     - Include file counts
     - Include message counts
   - Target: `services/chat-enrichment-service.ts`

### From `messages.ts`

3. **regenerateAttachmentUrls()** (~60 lines)
   - Location: Lines 80-140
   - Responsibilities:
     - Generate new URLs for attachments
     - Update database
   - Target: `services/attachment-url-service.ts`

4. **decodeImageDataUrl()** (~40 lines)
   - Location: Lines 200-240
   - Responsibilities:
     - Parse data URLs
     - Extract mime type and base64
   - Target: `services/image-data-service.ts`

### From `auth.ts`

5. **parseOAuthTokensFromUrl()** (~50 lines)
   - Location: Lines 300-350
   - Responsibilities:
     - Parse OAuth callback URL
     - Extract tokens
     - Validate tokens
   - Target: `services/auth-token-service.ts`

---

## 🔧 Implementation Plan

### Step 1: Create services directory (5 min)

```bash
mkdir -p src/main/lib/services
```

### Step 2: Extract chat-cleanup-service.ts (30 min)

```typescript
// src/main/lib/services/chat-cleanup-service.ts
import { supabase } from '../supabase/client'
import { log } from '../logger'

export async function cleanupChatFiles(
  chatId: string,
  userId: string
): Promise<void> {
  log.info('[ChatCleanup] Starting cleanup for chat:', chatId)

  try {
    const deletedFiles: string[] = []
    const failedFiles: string[] = []

    // Fetch chat files
    const { data: chatFiles, error: fetchError } = await supabase
      .from('chat_files')
      .select('id, storage_path, openai_file_id, openai_vector_store_file_id, filename')
      .eq('chat_id', chatId)
      .eq('user_id', userId)

    if (fetchError) {
      log.error('[ChatCleanup] Failed to fetch chat files:', fetchError)
      throw fetchError
    }

    if (!chatFiles || chatFiles.length === 0) {
      log.info('[ChatCleanup] No files to cleanup')
      return
    }

    // Delete each file from storage
    for (const file of chatFiles) {
      try {
        // Delete from Supabase storage
        if (file.storage_path) {
          const { error: storageError } = await supabase.storage
            .from('chat-attachments')
            .remove([file.storage_path])

          if (storageError) {
            log.warn('[ChatCleanup] Failed to delete from storage:', file.filename, storageError)
            failedFiles.push(file.filename)
            continue
          }
        }

        // Delete from OpenAI
        if (file.openai_file_id) {
          // Delete from OpenAI
        }

        if (file.openai_vector_store_file_id) {
          // Delete from OpenAI vector store
        }

        deletedFiles.push(file.filename)
      } catch (err) {
        log.error('[ChatCleanup] Error deleting file:', file.filename, err)
        failedFiles.push(file.filename)
      }
    }

    // Delete database records
    const { error: deleteError } = await supabase
      .from('chat_files')
      .delete()
      .eq('chat_id', chatId)

    if (deleteError) {
      log.error('[ChatCleanup] Failed to delete database records:', deleteError)
      throw deleteError
    }

    log.info('[ChatCleanup] Cleanup complete:', {
      chatId,
      deletedFiles: deletedFiles.length,
      failedFiles: failedFiles.length,
      failedFileNames: failedFiles
    })
  } catch (err) {
    log.error('[ChatCleanup] Error during cleanup for chat:', chatId, err)
    throw err
  }
}
```

### Step 3: Extract chat-enrichment-service.ts (20 min)

```typescript
// src/main/lib/services/chat-enrichment-service.ts
import { supabase } from '../supabase/client'
import { log } from '../logger'

export interface ChatMetadata {
  fileCount: number
  messageCount: number
  lastActivityAt: string | null
}

export async function enrichWithMeta(
  chatId: string,
  chat: any
): Promise<any> {
  try {
    // Get file count
    const { count: fileCount } = await supabase
      .from('chat_files')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', chatId)

    // Get message count
    const { count: messageCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', chatId)

    // Return enriched chat
    return {
      ...chat,
      meta: {
        fileCount: fileCount || 0,
        messageCount: messageCount || 0,
      }
    }
  } catch (err) {
    log.error('[ChatEnrichment] Error enriching chat:', chatId, err)
    // Return original chat if enrichment fails
    return chat
  }
}
```

### Step 4: Extract attachment-url-service.ts (20 min)

```typescript
// src/main/lib/services/attachment-url-service.ts
import { supabase } from '../supabase/client'
import { log } from '../logger'

export async function regenerateAttachmentUrls(
  chatId: string,
  userId: string
): Promise<void> {
  try {
    const { data: attachments, error } = await supabase
      .from('chat_files')
      .select('id, storage_path, filename')
      .eq('chat_id', chatId)

    if (error) {
      log.error('[AttachmentURL] Failed to fetch attachments:', error)
      throw error
    }

    if (!attachments || attachments.length === 0) {
      return
    }

    // Generate new URLs
    for (const attachment of attachments) {
      if (attachment.storage_path) {
        const { data: urlData } = await supabase.storage
          .from('chat-attachments')
          .createSignedUrl(attachment.storage_path, 60 * 60) // 1 hour

        if (urlData?.signedUrl) {
          await supabase
            .from('chat_files')
            .update({ url: urlData.signedUrl })
            .eq('id', attachment.id)
        }
      }
    }
  } catch (err) {
    log.error('[AttachmentURL] Error regenerating URLs:', err)
    throw err
  }
}
```

### Step 5: Extract image-data-service.ts (15 min)

```typescript
// src/main/lib/services/image-data-service.ts
import { log } from '../logger'

export interface DecodedDataUrl {
  mimeType: string
  data: string
}

export function decodeImageDataUrl(dataUrl: string): DecodedDataUrl | null {
  try {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)

    if (!matches || matches.length !== 3) {
      return null
    }

    return {
      mimeType: matches[1],
      data: matches[2]
    }
  } catch (err) {
    log.error('[ImageData] Failed to decode data URL:', err)
    return null
  }
}
```

### Step 6: Extract auth-token-service.ts (15 min)

```typescript
// src/main/lib/services/auth-token-service.ts
import { log } from '../logger'

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function parseOAuthTokensFromUrl(url: string): OAuthTokens | null {
  try {
    const urlObj = new URL(url)
    const accessToken = urlObj.searchParams.get('access_token')
    const refreshToken = urlObj.searchParams.get('refresh_token')
    const expiresIn = urlObj.searchParams.get('expires_in')

    if (!accessToken || !refreshToken || !expiresIn) {
      return null
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + parseInt(expiresIn) * 1000
    }
  } catch (err) {
    log.error('[AuthToken] Failed to parse tokens from URL:', err)
    return null
  }
}
```

### Step 7: Create services index (10 min)

```typescript
// src/main/lib/services/index.ts
export * from './chat-cleanup-service'
export * from './chat-enrichment-service'
export * from './attachment-url-service'
export * from './image-data-service'
export * from './auth-token-service'
```

### Step 8: Update routers (30 min)

```typescript
// src/main/lib/trpc/routers/chats.ts
// Remove local function definitions
// Import from services

import { cleanupChatFiles, enrichWithMeta } from '../../services'

export const chatsRouter = router({
  cleanup: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return await cleanupChatFiles(input.chatId, ctx.userId)
    }),

  list: publicProcedure
    .query(async ({ ctx }) => {
      const { data: chats } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', ctx.userId)

      return chats?.map(chat => enrichWithMeta(chat.id, chat)) || []
    })
})
```

### Step 9: Test all services (30 min)

- Test chat cleanup
- Test chat enrichment
- Test attachment URL generation
- Test image data decoding
- Test OAuth token parsing

### Step 10: Update AGENTS.md (15 min)

Add documentation:
```markdown
## Services Layer

Business logic is extracted to `src/main/lib/services/`:

- **Chat Cleanup**: Delete files and cleanup resources
- **Chat Enrichment**: Add metadata to chats
- **Attachment URLs**: Generate signed URLs
- **Image Data**: Decode data URLs
- **Auth Tokens**: Parse OAuth tokens

Routers should be thin and delegate to services.
```

---

## ✅ Acceptance Criteria

- [ ] All services created
- [ ] All business logic extracted from routers
- [ ] Routers updated to use services
- [ ] All tests pass
- [ ] AGENTS.md updated
- [ ] Code review completed

---

## 🧪 Testing Strategy

```typescript
describe('Services', () => {
  describe('ChatCleanupService', () => {
    it('should cleanup chat files', async () => {
      await cleanupChatFiles('chat-123', 'user-123')
      // Verify files deleted
    })
  })

  describe('ImageDataService', () => {
    it('should decode data URL', () => {
      const result = decodeImageDataUrl('data:image/png;base64,iVBORw0KG...')
      expect(result?.mimeType).toBe('image/png')
      expect(result?.data).toBeDefined()
    })
  })

  describe('AuthTokenService', () => {
    it('should parse OAuth tokens', () => {
      const url = 'https://example.com/callback?access_token=abc&refresh_token=def&expires_in=3600'
      const tokens = parseOAuthTokensFromUrl(url)
      expect(tokens?.accessToken).toBe('abc')
      expect(tokens?.refreshToken).toBe('def')
    })
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking router functionality | HIGH | Thorough testing of all routes |
| Service dependencies circular | MEDIUM | Analyze dependencies before extracting |
| Missing error handling | LOW | Review error handling in services |
| Performance regression | LOW | No logic changes, just reorganization |

---

## 📊 Metrics

**Before**:
- Business logic in routers: ~350 lines
- Routers: Fat, hard to test
- Test coverage: <5%

**After**:
- Business logic in services: ~350 lines (organized)
- Routers: Thin, focused
- Test coverage: ~40%

---

## 🔄 Rollback Plan

```bash
# If issues arise:
git checkout HEAD~1 -- src/main/lib/services/
git checkout HEAD~1 -- src/main/lib/trpc/routers/chats.ts
git checkout HEAD~1 -- src/main/lib/trpc/routers/messages.ts
git checkout HEAD~1 -- src/main/lib/trpc/routers/auth.ts
rm -rf src/main/lib/services/
```

---

## 📝 Notes

- Services should be pure business logic
- Services should be testable without tRPC
- Services should handle logging internally
- Routers should delegate to services
- Consider adding service interfaces for better testing

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 2.3
- [AGENTS.md](../../AGENTS.md) - Architecture guidelines

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
