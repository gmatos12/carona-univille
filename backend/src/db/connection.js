import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sqlite3 from 'sqlite3'

const DEFAULT_DB_PATH = './carona.db'
const BUSY_TIMEOUT_MS = 5000

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function resolveDatabasePath(value) {
  const selected = value || process.env.DB_PATH || DEFAULT_DB_PATH
  return selected === ':memory:' ? selected : path.resolve(selected)
}

async function ensureDatabaseDirectory(filePath) {
  if (filePath === ':memory:') return
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

function runStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function handleRun(error) {
      if (error) reject(error)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function getStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error)
      else resolve(row)
    })
  })
}

function allStatements(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error)
      else resolve(rows)
    })
  })
}

function execStatements(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function createQueue() {
  let tail = Promise.resolve()
  return (task) => {
    const result = tail.then(task, task)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

export async function createConnection(options = {}) {
  const isTest = parseBoolean(options.test, process.env.NODE_ENV === 'test')
  const filePath = resolveDatabasePath(options.filePath)
  await ensureDatabaseDirectory(filePath)

  const db = new sqlite3.Database(filePath)
  const enqueue = createQueue()
  let closed = false

  try {
    await execStatements(db, 'PRAGMA foreign_keys = ON')
    await execStatements(db, `PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  } catch (error) {
    await closeDatabase(db).catch(() => undefined)
    throw error
  }

  const connection = {
    db,
    filePath,
    isTest,
    run(sql, params = []) {
      if (closed) return Promise.reject(new Error('Database connection is closed'))
      return runStatement(db, sql, params)
    },
    get(sql, params = []) {
      if (closed) return Promise.reject(new Error('Database connection is closed'))
      return getStatement(db, sql, params)
    },
    all(sql, params = []) {
      if (closed) return Promise.reject(new Error('Database connection is closed'))
      return allStatements(db, sql, params)
    },
    exec(sql) {
      if (closed) return Promise.reject(new Error('Database connection is closed'))
      return execStatements(db, sql)
    },
    transaction(callback) {
      if (typeof callback !== 'function') {
        return Promise.reject(new TypeError('Transaction callback must be a function'))
      }
      if (closed) return Promise.reject(new Error('Database connection is closed'))

      return enqueue(async () => {
        await execStatements(db, 'BEGIN IMMEDIATE')
        let committed = false
        try {
          const result = await callback(connection)
          await execStatements(db, 'COMMIT')
          committed = true
          return result
        } catch (error) {
          if (!committed) {
            await execStatements(db, 'ROLLBACK').catch(() => undefined)
          }
          throw error
        }
      })
    },
    close() {
      return enqueue(async () => {
        if (closed) return
        await closeDatabase(db)
        closed = true
      })
    },
  }

  return connection
}

export async function createTestConnection(options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'carona-test-'))
  const filePath = path.join(directory, options.fileName || 'test.db')
  let connection

  try {
    connection = await createConnection({ ...options, filePath, test: true })
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }

  let cleanupPromise
  connection.cleanup = () => {
    if (!cleanupPromise) {
      cleanupPromise = connection.close().finally(() =>
        fs.rm(directory, { recursive: true, force: true }).catch(() => undefined),
      )
    }
    return cleanupPromise
  }

  return connection
}

let sharedConnectionPromise

export async function getConnection(options = {}) {
  if (!sharedConnectionPromise) {
    const factory = parseBoolean(options.test, process.env.NODE_ENV === 'test')
      ? createTestConnection
      : createConnection
    sharedConnectionPromise = factory(options).catch((error) => {
      sharedConnectionPromise = undefined
      throw error
    })
  }
  return sharedConnectionPromise
}

export async function closeConnection() {
  if (!sharedConnectionPromise) return
  const connection = await sharedConnectionPromise.catch(() => undefined)
  sharedConnectionPromise = undefined
  if (!connection) return
  if (typeof connection.cleanup === 'function') await connection.cleanup()
  else await connection.close()
}

export function withImmediateTransaction(connectionOrCallback, callback) {
  if (typeof connectionOrCallback === 'function') {
    return getConnection().then((connection) => connection.transaction(connectionOrCallback))
  }
  if (!connectionOrCallback || typeof connectionOrCallback.transaction !== 'function') {
    return Promise.reject(new TypeError('Invalid database connection'))
  }
  return connectionOrCallback.transaction(callback)
}

export const createDb = createConnection
export const createTestDb = createTestConnection
export const getDb = getConnection
export const closeDb = closeConnection

export default {
  createConnection,
  createTestConnection,
  getConnection,
  closeConnection,
  withImmediateTransaction,
  createDb,
  createTestDb,
  getDb,
  closeDb,
}
