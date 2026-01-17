import { createTRPCReact } from "@trpc/react-query"
import { createTRPCProxyClient } from "@trpc/client"
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

/**
 * Vanilla client for use outside React components (stores, utilities)
 */
export const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [ipcLink({ transformer: superjson })],
})

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
        const client = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 5000,
                    refetchOnWindowFocus: false,
                    retry: false
                },
                mutations: {
                    retry: false
                }
            }
        })
        globalQueryClient = client
        return client
    })

    const [trpcReactClient] = useState(() =>
        trpc.createClient({
            links: [ipcLink({ transformer: superjson })]
        })
    )

    return (
        <trpc.Provider client={trpcReactClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </trpc.Provider>
    )
}
