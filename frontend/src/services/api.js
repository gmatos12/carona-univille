const DEFAULT_BASE_URL = 'http://localhost:3000/api'
const DEFAULT_TOKEN_KEYS = ['token', 'access_token', 'carona_token', 'carona:token']

function environment() {
  return typeof import.meta.env === 'undefined' ? {} : import.meta.env
}

export function resolveBaseURL(value) {
  const selected = value ?? environment().VITE_API_URL ?? DEFAULT_BASE_URL
  if (selected === null || selected === undefined || String(selected).trim() === '') {
    return DEFAULT_BASE_URL
  }
  return String(selected).trim().replace(/\/+$/, '')
}

function getStorage() {
  try {
    return globalThis.localStorage || globalThis.sessionStorage || null
  } catch {
    return null
  }
}

function readStoredToken(keys) {
  const storage = getStorage()
  if (!storage) return null

  for (const key of keys) {
    try {
      const value = storage.getItem(key)
      if (value) return value
    } catch {
      return null
    }
  }

  return null
}

function writeStoredToken(value, keys) {
  const storage = getStorage()
  if (!storage) return

  for (const key of keys) {
    try {
      if (value) storage.setItem(key, value)
      else storage.removeItem(key)
    } catch {
      return
    }
  }
}

function hasHeader(headers, name) {
  const normalized = name.toLowerCase()
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized)
}

function toHeaderObject(headers) {
  if (!headers) return {}
  if (typeof headers.forEach === 'function' && typeof headers !== 'string') {
    const result = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }
  return { ...headers }
}

function isRawBody(value) {
  if (typeof value === 'string') return true
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return true
  if (ArrayBuffer.isView && ArrayBuffer.isView(value)) return true
  if (typeof FormData !== 'undefined' && value instanceof FormData) return true
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return true
  return false
}

function normalizeBody(body, headers) {
  if (body === undefined || body === null) return null
  if (isRawBody(body)) return body
  if (!hasHeader(headers, 'Content-Type')) headers['Content-Type'] = 'application/json'
  return JSON.stringify(body)
}

function appendParams(search, key, value) {
  if (value === undefined || value === null) return

  const values = Array.isArray(value) ? value : [value]
  for (const item of values) {
    if (item === undefined || item === null) continue
    const serialized = item !== null && typeof item === 'object' ? JSON.stringify(item) : String(item)
    search.append(key, serialized)
  }
}

export function buildURL(baseURL, url, params) {
  const path = url === undefined || url === null ? '' : String(url)
  let result

  if (!path) {
    result = baseURL
  } else if (/^https?:\/\//i.test(path) || path.startsWith('//')) {
    result = path
  } else if (path.startsWith('?') || path.startsWith('#')) {
    result = `${baseURL}${path}`
  } else {
    result = `${baseURL}/${path.replace(/^\/+/, '')}`
  }

  if (params && typeof params === 'object') {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) appendParams(search, key, value)
    const query = search.toString()
    if (query) result += `${result.includes('?') ? '&' : '?'}${query}`
  }

  return result
}

async function readResponseBody(response) {
  if (!response) return null

  if (typeof response.text === 'function') {
    const text = await response.text()
    if (!text) return null

    const contentType = typeof response.headers?.get === 'function'
      ? response.headers.get('content-type') || ''
      : ''
    const looksLikeJson = text.trim().startsWith('{') || text.trim().startsWith('[')

    if (contentType.includes('json') || looksLikeJson) {
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    }

    return text
  }

  if (typeof response.json === 'function') return response.json()
  return null
}

function extractMessage(payload, response) {
  if (typeof payload === 'string' && payload.trim()) return payload

  if (payload && typeof payload === 'object') {
    for (const key of ['error', 'message', 'detail']) {
      const value = payload[key]
      if (typeof value === 'string' && value.trim()) return value
    }
  }

  if (typeof response?.statusText === 'string' && response.statusText.trim()) {
    return response.statusText
  }

  return `Erro ${response?.status ?? ''.toString()}`.trim()
}

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.statusCode = options.status
    this.code = options.code || 'API_ERROR'
    if (options.details !== undefined) this.details = options.details
    if (options.response !== undefined) this.response = options.response
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError)
  }
}

function shouldAttachAuth(config, finalURL, baseURL) {
  if (config.auth === false) return false
  if (config.auth === true) return true

  const raw = typeof config.url === 'string' ? config.url : ''
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith('//')) return true

  try {
    const target = new URL(finalURL, globalThis.location?.href).origin
    const base = new URL(baseURL, globalThis.location?.href).origin
    return target === base
  } catch {
    return false
  }
}

export function createApiClient(options = {}) {
  let baseURL = resolveBaseURL(options.baseURL)
  let memoryToken = options.token ?? null
  let tokenGetter = options.getToken
  let tokenKeys = options.tokenKeys ?? DEFAULT_TOKEN_KEYS
  let onTokenChange = options.onTokenChange
  const authHeader = options.authHeader || 'Authorization'
  const authScheme = options.authScheme === null || options.authScheme === '' ? '' : options.authScheme || 'Bearer'
  const fetcher = options.fetch

  function getToken() {
    if (tokenGetter) return tokenGetter()
    return memoryToken || readStoredToken(tokenKeys)
  }

  function setToken(value) {
    const normalized = value ? String(value) : null
    memoryToken = normalized
    writeStoredToken(normalized, tokenKeys)
    if (typeof onTokenChange === 'function') onTokenChange(normalized)
    return client
  }

  function clearToken() {
    return setToken(null)
  }

  function setBaseURL(value) {
    baseURL = resolveBaseURL(value)
    return client
  }

  function configure(next = {}) {
    if (next.baseURL !== undefined) setBaseURL(next.baseURL)
    if (next.token !== undefined) setToken(next.token)
    if (next.getToken !== undefined) tokenGetter = next.getToken
    if (next.tokenKeys !== undefined) tokenKeys = next.tokenKeys
    if (next.onTokenChange !== undefined) onTokenChange = next.onTokenChange
    return client
  }

  async function request(config = {}) {
    const finalURL = buildURL(baseURL, config.url, config.params)
    const headers = toHeaderObject(config.headers)

    if (!hasHeader(headers, 'Accept')) headers.Accept = 'application/json'

    const token = shouldAttachAuth(config, finalURL, baseURL) ? await getToken() : null
    if (token && !hasHeader(headers, authHeader)) {
      headers[authHeader] = authScheme ? `${authScheme} ${token}` : String(token)
    }

    const body = normalizeBody(config.body ?? config.data, headers)
    const fetchImplementation = fetcher || globalThis.fetch

    if (typeof fetchImplementation !== 'function') {
      throw new Error('fetch não disponível neste ambiente')
    }

    const init = {
      method: (config.method || 'GET').toUpperCase(),
      headers,
    }

    if (body !== null) init.body = body
    if (config.signal !== undefined) init.signal = config.signal
    if (config.credentials !== undefined) init.credentials = config.credentials
    if (config.mode !== undefined) init.mode = config.mode
    if (config.cache !== undefined) init.cache = config.cache
    if (config.redirect !== undefined) init.redirect = config.redirect

    const response = await fetchImplementation(finalURL, init)
    const payload = await readResponseBody(response)
    const status = response?.status ?? 200
    const ok = typeof response?.ok === 'boolean'
      ? response.ok
      : status >= 200 && status < 300

    if (!ok) {
      throw new ApiError(extractMessage(payload, response), {
        status,
        code: payload?.code,
        details: payload?.details,
        response: payload,
      })
    }

    return payload
  }

  const client = {
    get baseURL() {
      return baseURL
    },
    get authHeader() {
      return authHeader
    },
    getToken,
    setToken,
    clearToken,
    getBaseURL() {
      return baseURL
    },
    setBaseURL,
    configure,
    request,
    get(url, config = {}) {
      return request({ ...config, method: 'GET', url })
    },
    post(url, body, config = {}) {
      return request({ ...config, method: 'POST', url, body })
    },
    put(url, body, config = {}) {
      return request({ ...config, method: 'PUT', url, body })
    },
    patch(url, body, config = {}) {
      return request({ ...config, method: 'PATCH', url, body })
    },
    delete(url, config = {}) {
      return request({ ...config, method: 'DELETE', url })
    },
    del(url, config = {}) {
      return client.delete(url, config)
    },
  }

  return client
}

export const api = createApiClient()
export const apiClient = api
export const setAuthToken = (token) => api.setToken(token)
export const clearAuthToken = () => api.clearToken()
export const getAuthToken = () => api.getToken()
export const configureApi = (options) => api.configure(options)

export const ApiRequestError = ApiError

export default api
