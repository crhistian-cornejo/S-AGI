import log from 'electron-log'
import { getRawDatabase } from '../storage'

const NAME_MEMORY_KEY_PREFIX = 'memory.user.'
const NAME_MEMORY_KEY_SUFFIX = '.profile_name'
const MAX_NAME_LENGTH = 80
const PLACEHOLDER_NAMES = new Set(['user', 'local user', 'unknown'])

type NameMemorySource = 'profile' | 'account' | 'manual'

interface NameMemoryPayload {
  name: string
  source: NameMemorySource
  updatedAt: number
}

function getNameMemoryKey(userId: string): string {
  return `${NAME_MEMORY_KEY_PREFIX}${userId}${NAME_MEMORY_KEY_SUFFIX}`
}

function toTitleCase(input: string): string {
  return input
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function nameFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null
  const localPart = email.split('@')[0]?.trim()
  if (!localPart) return null
  const normalized = localPart.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return toTitleCase(normalized)
}

function sanitizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null

  const cleaned = input
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return null

  const limited = cleaned.slice(0, MAX_NAME_LENGTH)
  if (PLACEHOLDER_NAMES.has(limited.toLowerCase())) return null

  return limited
}

function parseMemoryValue(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null
  try {
    const parsed = JSON.parse(rawValue) as Partial<NameMemoryPayload>
    return sanitizeName(parsed.name)
  } catch {
    // Backward-compatible fallback if value was stored as plain string.
    return sanitizeName(rawValue)
  }
}

export function extractProfileName(input: {
  userMetadata?: Record<string, unknown> | null
  email?: string | null
  fallbackDisplayName?: string | null
}): string | null {
  const userMetadata = input.userMetadata ?? {}

  const fullName = sanitizeName(userMetadata.full_name)
  if (fullName) return fullName

  const preferredName = sanitizeName(userMetadata.preferred_name)
  if (preferredName) return preferredName

  const explicitName = sanitizeName(userMetadata.name)
  if (explicitName) return explicitName

  const givenName = sanitizeName(userMetadata.given_name ?? userMetadata.first_name)
  const familyName = sanitizeName(userMetadata.family_name ?? userMetadata.last_name)
  if (givenName && familyName) return sanitizeName(`${givenName} ${familyName}`)
  if (givenName) return givenName

  const fallbackDisplayName = sanitizeName(input.fallbackDisplayName)
  if (fallbackDisplayName) return fallbackDisplayName

  return sanitizeName(nameFromEmail(input.email))
}

export function getProfileNameMemory(userId: string | null | undefined): string | null {
  if (!userId) return null

  const db = getRawDatabase()
  if (!db) return null

  try {
    const row = db
      .prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
      .get(getNameMemoryKey(userId)) as { value?: string } | undefined

    return parseMemoryValue(row?.value)
  } catch (error) {
    log.warn('[ProfileMemory] Failed to read profile name memory:', error)
    return null
  }
}

export function setProfileNameMemory(
  userId: string | null | undefined,
  name: string | null | undefined,
  source: NameMemorySource = 'profile',
): string | null {
  if (!userId) return null

  const sanitizedName = sanitizeName(name)
  if (!sanitizedName) return null

  const db = getRawDatabase()
  if (!db) return sanitizedName

  try {
    const now = Date.now()
    const payload: NameMemoryPayload = {
      name: sanitizedName,
      source,
      updatedAt: now,
    }

    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(
      getNameMemoryKey(userId),
      JSON.stringify(payload),
      Math.floor(now / 1000),
    )
  } catch (error) {
    log.warn('[ProfileMemory] Failed to persist profile name memory:', error)
  }

  return sanitizedName
}

export function syncProfileNameMemory(input: {
  userId: string | null | undefined
  userMetadata?: Record<string, unknown> | null
  email?: string | null
  fallbackDisplayName?: string | null
  source?: NameMemorySource
}): string | null {
  const extractedName = extractProfileName({
    userMetadata: input.userMetadata,
    email: input.email,
    fallbackDisplayName: input.fallbackDisplayName,
  })

  if (extractedName) {
    return setProfileNameMemory(input.userId, extractedName, input.source ?? 'profile')
  }

  return getProfileNameMemory(input.userId)
}
