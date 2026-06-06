import { getIdentityToken, usePrivy } from '@privy-io/react-auth'

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'

/**
 * Returns a fetch wrapper that attaches the Privy access token (Authorization)
 * and, for routes that need the user profile, the identity token (privy-id-token).
 * All token handling stays here so pages don't juggle headers.
 */
export function useAuthedFetch() {
  const { getAccessToken } = usePrivy()

  return async function authedFetch(path: string, init: RequestInit = {}) {
    const [accessToken, identityToken] = await Promise.all([
      getAccessToken(),
      getIdentityToken(),
    ])

    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json')
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    if (identityToken) headers.set('privy-id-token', identityToken)

    return fetch(`${API_URL}${path}`, { ...init, headers })
  }
}
