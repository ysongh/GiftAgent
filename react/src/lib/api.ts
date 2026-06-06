import { getIdentityToken, useIdentityToken, usePrivy } from '@privy-io/react-auth'

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'

/** Does this path hit a route that requires the identity token (server reads the profile)? */
function needsIdentityToken(path: string): boolean {
  return path.endsWith('/claim') || path.startsWith('/api/agent')
}

/**
 * Returns a fetch wrapper that attaches the Privy access token (Authorization)
 * and, for routes that need the user profile, the identity token (privy-id-token).
 * All token handling stays here so pages don't juggle headers.
 *
 * The identity token requires "Return user data in an identity token" to be enabled
 * in the Privy dashboard (User management -> Authentication -> Advanced); without it
 * getIdentityToken() / useIdentityToken() return null.
 */
export function useAuthedFetch() {
  const { getAccessToken } = usePrivy()
  // Reactive hook value is the most reliable source; fall back to the cookie reader.
  const { identityToken } = useIdentityToken()

  return async function authedFetch(path: string, init: RequestInit = {}) {
    const accessToken = await getAccessToken()
    const idToken = identityToken ?? (await getIdentityToken())

    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json')
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    if (idToken) headers.set('privy-id-token', idToken)

    // Fail fast with an actionable message for routes that require the identity token.
    if (!idToken && needsIdentityToken(path)) {
      throw new Error(
        'No identity token available. Enable "Return user data in an identity token" in the ' +
          'Privy dashboard (User management → Authentication → Advanced), then log out and back in.',
      )
    }

    return fetch(`${API_URL}${path}`, { ...init, headers })
  }
}
