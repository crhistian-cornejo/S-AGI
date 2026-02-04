const globalKey = '__sagi_univer_di_suppress__'

const getMessageText = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (value instanceof Error) return value.message
    try {
        return String(value)
    } catch {
        return ''
    }
}

const shouldSuppress = (args: unknown[]): boolean => {
    const text = args.map(getMessageText).join(' ')
    return text.includes('already exists') &&
        text.includes('Returning the cached identifier decorator')
}

if (!(globalThis as any)[globalKey]) {
    ;(globalThis as any)[globalKey] = true

    const originalWarn = console.warn
    const originalError = console.error

    console.warn = (...args: unknown[]) => {
        if (shouldSuppress(args)) return
        originalWarn.apply(console, args as [])
    }

    console.error = (...args: unknown[]) => {
        if (shouldSuppress(args)) return
        originalError.apply(console, args as [])
    }
}
