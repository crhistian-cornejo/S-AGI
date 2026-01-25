import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import crypto from 'crypto'

const STORE_FILE = 'sensitive-pin.encrypted'

interface PinData {
    saltB64: string
    hashB64: string
}

export class SensitivePinStore {
    private storePath: string
    private cache: PinData | null = null

    constructor() {
        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')
        if (!existsSync(secureDir)) {
            mkdirSync(secureDir, { recursive: true })
        }
        this.storePath = join(secureDir, STORE_FILE)
        this.load()
    }

    private load(): void {
        try {
            if (!existsSync(this.storePath)) {
                this.cache = null
                return
            }
            const encrypted = readFileSync(this.storePath)
            if (!safeStorage.isEncryptionAvailable()) {
                this.cache = null
                return
            }
            const decrypted = safeStorage.decryptString(encrypted)
            const parsed = JSON.parse(decrypted) as PinData
            if (parsed?.saltB64 && parsed?.hashB64) {
                this.cache = parsed
            } else {
                this.cache = null
            }
        } catch {
            this.cache = null
        }
    }

    private save(): void {
        if (!safeStorage.isEncryptionAvailable()) return
        if (!this.cache) return
        const data = JSON.stringify(this.cache)
        const encrypted = safeStorage.encryptString(data)
        writeFileSync(this.storePath, encrypted)
    }

    hasPin(): boolean {
        return !!this.cache
    }

    setPin(pin: string): void {
        const salt = crypto.randomBytes(16)
        const hash = crypto.scryptSync(pin, salt, 32)
        this.cache = { saltB64: salt.toString('base64'), hashB64: hash.toString('base64') }
        this.save()
    }

    verifyPin(pin: string): boolean {
        if (!this.cache) return false
        const salt = Buffer.from(this.cache.saltB64, 'base64')
        const expected = Buffer.from(this.cache.hashB64, 'base64')
        const actual = crypto.scryptSync(pin, salt, 32)
        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
    }

    clear(): void {
        this.cache = null
        try {
            if (existsSync(this.storePath)) unlinkSync(this.storePath)
        } catch {}
    }
}

let instance: SensitivePinStore | null = null

export function getSensitivePinStore(): SensitivePinStore {
    if (!instance) instance = new SensitivePinStore()
    return instance
}

