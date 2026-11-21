import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { closeConnection } from './db/connection.js'
import { createApp } from './app.js'

dotenv.config({ quiet: true })

const DEFAULT_PORT = 3000

function parsePort(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PORT
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return DEFAULT_PORT
  return parsed
}

export function startServer(options = {}) {
  const app = options.app ?? createApp(options)
  const port = options.port ?? parsePort(process.env.PORT)

  const server = app.listen(port)

  server.once('listening', () => {
    const address = server.address()
    const activePort = address && typeof address === 'object' ? address.port : port
    console.log(`Carona Univille API pronta na porta ${activePort}`)
  })

  return server
}

export async function shutdownServer(server) {
  if (!server || !server.listening) return

  await new Promise((resolve) => {
    server.close(resolve)
  })
  await closeConnection().catch(() => undefined)
}

const entryPoint = process.argv[1] ? path.resolve(process.argv[1]) : ''
const modulePath = fileURLToPath(import.meta.url)

if (entryPoint && entryPoint === modulePath) {
  const server = startServer()
  let shuttingDown = false

  const handleSignal = () => {
    if (shuttingDown) return
    shuttingDown = true
    shutdownServer(server).finally(() => {
      process.exitCode = 0
    })
  }

  process.once('SIGINT', handleSignal)
  process.once('SIGTERM', handleSignal)
}

export default startServer
