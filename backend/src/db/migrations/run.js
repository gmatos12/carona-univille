import fs from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { createConnection, withImmediateTransaction } from '../connection.js'

const MIGRATIONS_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION_TABLE = 'schema_migrations'
const SQL_CRIAR_TABELA_CONTROLE = `
  CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`
const SQL_INSERIR_MIGRATION = `
  INSERT INTO ${MIGRATION_TABLE} (name) VALUES (?)
`
const SQL_LISTAR_APLICADAS = `
  SELECT name FROM ${MIGRATION_TABLE}
`

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'))
}

async function ensureMigrationTable(connection) {
  await connection.run(SQL_CRIAR_TABELA_CONTROLE)
}

async function getAppliedMigrationNames(connection) {
  const rows = await connection.all(SQL_LISTAR_APLICADAS)
  return new Set(rows.map((row) => row.name))
}

async function applyMigration(connection, name) {
  const sql = await fs.readFile(path.join(MIGRATIONS_DIRECTORY, name), 'utf8')
  await connection.exec(sql)
  await connection.run(SQL_INSERIR_MIGRATION, [name])
}

async function runMigrations(options = {}) {
  const { connection: providedConnection, ...connectionOptions } = options
  const connection = providedConnection ?? (await createConnection(connectionOptions))
  let ownsConnection = !providedConnection

  try {
    return await withImmediateTransaction(connection, async (tx) => {
      await ensureMigrationTable(tx)
      const aplicadas = await getAppliedMigrationNames(tx)
      const arquivos = await listMigrationFiles()
      const applied = []
      const skipped = []

      for (const name of arquivos) {
        if (aplicadas.has(name)) {
          skipped.push(name)
          continue
        }
        await applyMigration(tx, name)
        applied.push(name)
      }

      return {
        applied,
        skipped,
        total: arquivos.length,
      }
    })
  } finally {
    if (ownsConnection) await connection.close()
  }
}

const arquivoAtual = process.argv[1] ? path.resolve(process.argv[1]) : ''
const executandoComoScript = arquivoAtual === fileURLToPath(import.meta.url)

if (executandoComoScript) {
  const diretorioBackend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  dotenv.config({ path: path.join(diretorioBackend, '.env') })

  try {
    const resultado = await runMigrations()
    console.log(
      `Migrations concluídas: ${resultado.applied.length} aplicadas, ${resultado.skipped.length} já aplicadas de ${resultado.total}.`,
    )
  } catch (error) {
    console.error('Falha ao aplicar migrations:', error.message)
    process.exitCode = 1
  }
}

export {
  MIGRATIONS_DIRECTORY,
  MIGRATION_TABLE,
  applyMigration,
  getAppliedMigrationNames,
  listMigrationFiles,
  runMigrations,
}

export default {
  runMigrations,
  listMigrationFiles,
}
