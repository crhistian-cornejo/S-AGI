/**
 * Credentials Module
 *
 * Exports for secure credential management
 */

export {
    getSecureStorage,
    SecureStorageBackend,
    type CredentialId,
    type StoredCredential,
    type CredentialType,
} from './secure-storage'

export {
    getCredentialManager,
    CredentialManager,
    type ClaudeOAuthCredentials,
    type ChatGPTOAuthCredentials,
} from './manager'
