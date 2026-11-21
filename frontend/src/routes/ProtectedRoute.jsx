import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../state/auth.js'

function locationState(location) {
  if (!location) return undefined
  return {
    from: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
  }
}

export function ProtectedRoute({
  children,
  redirectTo = '/login',
  fallback = null,
  requireActive = true,
}) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') return fallback

  const hasToken = Boolean(auth.token)
  const activeAllowed = !requireActive || auth.user?.conta_ativa !== false
  const authenticated = auth.isAuthenticated ?? (hasToken && activeAllowed)

  if (!authenticated) {
    return <Navigate to={redirectTo} replace state={locationState(location)} />
  }

  if (typeof children === 'function') return children(auth)
  if (children !== undefined && children !== null) return children

  return <Outlet />
}

export const RequireAuth = ProtectedRoute
export const PrivateRoute = ProtectedRoute

export default ProtectedRoute
