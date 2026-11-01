import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 2, // 2 minutes
    },
    mutations: {
      retry: false,
    },
  },
})

/**
 * Resets all query data, invalidating and removing all cached queries.
 * Must be executed upon user logout or role transition to preserve data boundaries.
 */
export function resetQueryClientCache() {
  queryClient.clear()
}
