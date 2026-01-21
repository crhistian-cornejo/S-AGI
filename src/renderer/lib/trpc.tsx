import { createTRPCReact } from "@trpc/react-query"
import { httpBatchLink } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import superjson from "superjson"
import { useState, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Import the AppRouter TYPE only (not the actual router code)
// This ensures no main process code is bundled into the renderer
import type { AppRouter } from "@shared/trpc-types"

/**
 * React hooks for tRPC
 */
export const trpc = createTRPCReact<AppRouter>()

// Global variable type for singleton preservation during HMR
const globalForTRPC = window as unknown as {
    __trpc_client__?: ReturnType<typeof trpc.createClient>
    __query_client__?: QueryClient
}

// Global tRPC client instance for vanilla usage
export let trpcClient: ReturnType<typeof trpc.createClient>

// Global query client instance
let globalQueryClient: QueryClient | null = null

export function getQueryClient(): QueryClient | null {
    return globalQueryClient
}

/**
 * tRPC Provider with React Query
 */
export function TRPCProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => {
        // Reuse existing client if available (HMR)
        if (globalForTRPC.__query_client__) {
            globalQueryClient = globalForTRPC.__query_client__
            return globalForTRPC.__query_client__
        }

        const client = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 20_000,
                    gcTime: 1000 * 60 * 30,
                    refetchOnWindowFocus: false,
                    refetchOnReconnect: true,
                    retry: false
                },
                mutations: {
                    retry: false
                }
            }
        })

        globalForTRPC.__query_client__ = client
        globalQueryClient = client
        return client
    })

    const [trpcReactClient] = useState(() => {
        // Reuse existing client if available (HMR)
        if (globalForTRPC.__trpc_client__) {
            trpcClient = globalForTRPC.__trpc_client__
            return globalForTRPC.__trpc_client__
        }

        const hasElectronTRPC = typeof (window as any).electronTRPC !== 'undefined'

        const client = trpc.createClient({
            links: hasElectronTRPC
                ? [ipcLink({ transformer: superjson })]
                : [
                    httpBatchLink({
                        url: `${window.location.origin}/trpc`,
                        transformer: superjson
                    })
                ]
        })

        globalForTRPC.__trpc_client__ = client
        trpcClient = client // Store it for external use
        return client
    })

    return (
        <trpc.Provider client={trpcReactClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </trpc.Provider>
    )
}
