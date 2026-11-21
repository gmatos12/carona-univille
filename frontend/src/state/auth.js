import { useEffect, useMemo, useSyncExternalStore } from 'react'
import api from '../services/api.js'

const USER_STORAGE_KEY = 'carona:user'
const listeners = new Set()

function getStorage() {
  try {
    return globalThis.localStorage || globalThis.sessionStorage || null
  } catch {
    return null
  }
}

function normalizeUser(value) {
  if (!value || typeof value !== 'object') return null

  const normalized = {}
  const id = value.id ?? value.sub ?? value.usuario_id
  const name = value.nome_completo ?? value.nome
  const active = value.conta_ativa ?? value.ativo

  if (id !== undefined && id !== null) normalized.id = id
  if (name !== undefined && name !== null) normalized.nome_completo = String(name)
  if (active !== undefined && active !== null) normalized.conta_ativa = Boolean(active)

  return Object.keys(normalized).length > 0 ? normalized : null
}

function readStoredUser() {
  const storage = getStorage()
  if (!storage) return null

  try {
    return normalizeUser(JSON.parse(storage.getItem(USER_STORAGE_KEY)))
  } catch {
    return null
  }
}

function writeStoredUser(user) {
  const storage = getStorage()
  if (!storage) return

  try {
    if (user) storage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
    else storage.removeItem(USER_STORAGE_KEY)
  } catch {
    return
  }
}

function readToken() {
  try {
    const token = api.getToken?.()
    if (token && typeof token.then !== 'function') return token
  } catch {
    return null
  }
  return null
}

function makeSnapshot(token, user) {
  const active = user?.conta_ativa
  return Object.freeze({
    token: token || null,
    user: user || null,
    isAuthenticated: Boolean(token) && active !== false,
    status: 'ready',
  })
}

let snapshot = makeSnapshot(readToken(), readStoredUser())

function setSnapshot(next) {
  snapshot = makeSnapshot(next.token, next.user)
  for (const listener of listeners) listener()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

function refresh() {
  const token = readToken()
  const user = token ? readStoredUser() : null
  if (!token) writeStoredUser(null)
  setSnapshot({ token, user })
  return getSession()
}

function getSession() {
  return {
    token: snapshot.token,
    user: snapshot.user,
    isAuthenticated: snapshot.isAuthenticated,
  }
}

function isAuthenticated() {
  return snapshot.isAuthenticated
}

function getCurrentUser() {
  return snapshot.user
}

function login(session) {
  const input = typeof session === 'string' ? { token: session } : session || {}
  const token = input.token ?? input.accessToken ?? input.access_token ?? null
  const hasUser = input.user !== undefined || input.usuario !== undefined
  const user = hasUser ? normalizeUser(input.user ?? input.usuario) : snapshot.user

  if (token) api.setToken(token)
  else api.clearToken()

  if (hasUser || !token) writeStoredUser(user)

  setSnapshot({ token: token || readToken(), user })
  return getSession()
}

function logout() {
  api.clearToken()
  writeStoredUser(null)
  setSnapshot({ token: null, user: null })
  return getSession()
}

function setUser(value) {
  const user = normalizeUser(value)
  writeStoredUser(user)
  setSnapshot({ token: snapshot.token, user })
  return getSession()
}

function signIn(session) {
  return login(session)
}

function signOut() {
  return logout()
}

export function useAuth() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return useMemo(() => ({
    ...state,
    login,
    logout,
    setUser,
    refresh,
    signIn,
    signOut,
  }), [state])
}

export function AuthProvider({ children }) {
  useEffect(() => {
    refresh()
  }, [])

  return children ?? null
}

export {
  getSession,
  getCurrentUser,
  isAuthenticated,
  login,
  logout,
  setUser,
  refresh,
  subscribe,
  getSnapshot,
  signIn,
  signOut,
}

export const sessionStorageHelpers = {
  getSession,
  isAuthenticated,
  login,
  logout,
  setUser,
  refresh,
}

export default {
  AuthProvider,
  useAuth,
  getSession,
  getCurrentUser,
  isAuthenticated,
  login,
  logout,
  setUser,
  refresh,
  subscribe,
  getSnapshot,
  signIn,
  signOut,
}
