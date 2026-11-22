import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import cors from 'cors'
import express from 'express'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'

const SRC_ROOT = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(SRC_ROOT, '..')
const DEFAULT_UPLOAD_DIR = './src/uploads/perfis'
const JSON_LIMIT = '1mb'
const UPLOADS_MOUNT_PATH = '/uploads'

const DEFAULT_ROUTER_DEFINITIONS = [
  { path: '/api/auth', file: 'routes/authRoutes.js' },
  { path: '/api', file: 'routes/usuarioRoutes.js' },
  { path: '/api/veiculos', file: 'routes/veiculoRoutes.js' },
  { path: '/api/ofertas', file: 'routes/ofertaRoutes.js' },
  { path: '/api', file: 'routes/reservaRoutes.js' },
  { path: '/api/recorrencias', file: 'routes/recorrenciaRoutes.js' },
  { path: '/api/minhas-viagens', file: 'routes/minhasViagensRoutes.js' },
]

function normalizeDefinition(definition) {
  if (typeof definition === 'string') {
    return { path: '/api', file: definition }
  }
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Definição de roteador inválida')
  }
  return definition
}

function mountPathOf(definition) {
  return definition.path || definition.mountPath || '/api'
}

function resolveRouterValue(value, seen = new Set()) {
  if (!value || seen.has(value)) return null
  seen.add(value)

  if (typeof value === 'function' && typeof value.use === 'function') return value
  if (typeof value !== 'function' && typeof value.use === 'function') return value

  if (typeof value === 'function') {
    return resolveRouterValue(value(), seen)
  }

  for (const key of ['router', 'routes', 'default']) {
    const router = resolveRouterValue(value[key], seen)
    if (router) return router
  }

  return null
}

function routerFromModule(moduleNamespace, definition) {
  const candidates = [definition.exportName, 'default', 'router', 'routes'].filter(Boolean)

  for (const candidate of candidates) {
    const router = resolveRouterValue(moduleNamespace[candidate])
    if (router) return router
  }

  return null
}

export function resolveUploadDirectory(value) {
  const selected = value || process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR
  return path.isAbsolute(selected) ? path.resolve(selected) : path.resolve(BACKEND_ROOT, selected)
}

export function resolveCorsOrigin(value = process.env.CORS_ORIGIN) {
  if (!value || value.trim() === '' || value.trim() === '*') return true

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.length === 0) return true
  return origins.length === 1 ? origins[0] : origins
}

export function mountRouters(app, routers = []) {
  for (const definition of routers) {
    const normalized = normalizeDefinition(definition)
    const router = resolveRouterValue(normalized.router ?? normalized.handler)

    if (!router) {
      throw new TypeError(`Roteador inválido para ${mountPathOf(normalized)}`)
    }

    app.use(mountPathOf(normalized), router)
  }

  return app
}

export async function discoverRouters(options = {}) {
  const definitions = options.definitions ?? DEFAULT_ROUTER_DEFINITIONS
  const baseDir = options.baseDir ?? SRC_ROOT
  const discovered = []

  for (const definition of definitions) {
    const normalized = normalizeDefinition(definition)
    const absolutePath = path.isAbsolute(normalized.file)
      ? normalized.file
      : path.resolve(baseDir, normalized.file)

    if (!fs.existsSync(absolutePath)) continue

    const moduleNamespace = await import(pathToFileURL(absolutePath).href)
    const router = routerFromModule(moduleNamespace, normalized)

    if (!router) {
      throw new TypeError(`Roteador inválido em ${absolutePath}`)
    }

    discovered.push({ ...normalized, router })
  }

  return discovered
}

const DISCOVERED_ROUTERS = await discoverRouters()

export function getDiscoveredRouters() {
  return [...DISCOVERED_ROUTERS]
}

export function healthcheck(req, res) {
  return res.status(200).json({
    status: 'ok',
    service: 'carona-univille-api',
    uptime: Number(process.uptime().toFixed(3)),
    timestamp: new Date().toISOString(),
  })
}

export function createApp(options = {}) {
  const app = express()
  const uploadDir = resolveUploadDirectory(options.uploadDir)

  if (options.createUploadDir !== false) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  app.disable('x-powered-by')
  app.set('uploadDir', uploadDir)
  app.locals.uploadDir = uploadDir

  app.use(cors(options.cors ?? { origin: resolveCorsOrigin() }))
  app.use(express.json({ limit: options.jsonLimit ?? JSON_LIMIT }))

  app.get('/health', healthcheck)
  app.get('/api/health', healthcheck)

  app.use(
    UPLOADS_MOUNT_PATH,
    express.static(uploadDir, {
      dotfiles: 'deny',
      fallthrough: true,
      index: false,
      maxAge: 0,
      redirect: false,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
      },
    }),
  )

  mountRouters(app, options.routers ?? getDiscoveredRouters())

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export const app = createApp()

export default app
