import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { closeConnection, getConnection } from '../../../src/db/connection.js'
import { runMigrations } from '../../../src/db/migrations/run.js'
import { runSeed } from '../../../src/db/seeds/run.js'

const RESET_TABLES = Object.freeze([
  'historico_eventos',
  'penalidades',
  'avaliacoes',
  'reservas',
  'ofertas',
  'recorrencias',
  'veiculos',
  'usuarios',
  'matriculas_autorizadas',
])

const SEQUENCE_TABLES = Object.freeze([
  'historico_eventos',
  'penalidades',
  'avaliacoes',
  'reservas',
  'ofertas',
  'recorrencias',
  'veiculos',
  'usuarios',
])

function captureEnv(keys) {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined,
    ]),
  )
}

function applyEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function restoreEnv(previous) {
  applyEnv(previous)
}

async function resetTestDatabase(context) {
  const connection = context?.connection ?? context
  if (!connection || typeof connection.transaction !== 'function') {
    throw new TypeError('Conexão de teste inválida')
  }

  await connection.transaction(async (tx) => {
    for (const table of RESET_TABLES) {
      await tx.run(`DELETE FROM ${table}`)
    }
    const placeholders = SEQUENCE_TABLES.map(() => '?').join(', ')
    await tx.run(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`, [...SEQUENCE_TABLES])
  })

  return runSeed({ connection })
}

async function closeTestDatabase(context) {
  if (!context || context.closed) return

  context.closed = true
  await closeConnection()
  restoreEnv(context.previousEnv)

  if (context.ownsDirectory) {
    await fs.rm(context.directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function createTestDatabase(options = {}) {
  const {
    directory: providedDirectory,
    filePath: providedFilePath,
    fileName = 'test.db',
    env = {},
    connectionOptions = {},
    migrate = true,
    seed = true,
  } = options

  const directory = providedDirectory ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'carona-integration-')))
  const filePath = providedFilePath ?? path.join(directory, fileName)
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const envValues = { ...env, DB_PATH: filePath }
  const previousEnv = captureEnv(Object.keys(envValues))
  applyEnv(envValues)

  await closeConnection()

  let connection
  try {
    connection = await getConnection({ ...connectionOptions, filePath, test: false })
    if (migrate) await runMigrations({ connection })
    if (seed) await runSeed({ connection })
  } catch (error) {
    await closeConnection()
    restoreEnv(previousEnv)
    if (!providedDirectory) {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
    throw error
  }

  const context = {
    connection,
    db: connection,
    filePath,
    directory,
    previousEnv,
    ownsDirectory: !providedDirectory,
    closed: false,
  }
  context.reset = () => resetTestDatabase(context)
  context.close = () => closeTestDatabase(context)

  return context
}

export {
  RESET_TABLES,
  SEQUENCE_TABLES,
  applyEnv,
  captureEnv,
  closeTestDatabase,
  createTestDatabase,
  resetTestDatabase,
  restoreEnv,
}

export default {
  createTestDatabase,
  resetTestDatabase,
  closeTestDatabase,
}
