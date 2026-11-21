import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { createApp } from '../../../src/app.js'
import {
  applyEnv,
  captureEnv,
  createTestDatabase,
  restoreEnv,
} from './testDb.js'

const DEFAULT_ENV = Object.freeze({
  JWT_SECRET: 'carona-integration-secret',
  JWT_EXPIRES_IN: '8h',
})

function createTestRequest(app) {
  return request.agent(app)
}

async function createTestApp(options = {}) {
  const {
    database: providedDatabase,
    databaseOptions = {},
    uploadDirectory: providedUploadDirectory,
    uploadDir: providedUploadDir,
    env = {},
    ...appOptions
  } = options

  const database = providedDatabase ?? (await createTestDatabase(databaseOptions))
  const uploadDirectory = providedUploadDirectory ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'carona-uploads-')))
  const uploadDir = providedUploadDir ?? path.join(uploadDirectory, 'perfis')

  let previousEnv
  let app
  try {
    await fs.mkdir(uploadDir, { recursive: true })
    const envValues = { ...DEFAULT_ENV, UPLOAD_DIR: uploadDir, ...env }
    previousEnv = captureEnv(Object.keys(envValues))
    applyEnv(envValues)
    app = createApp({ uploadDir, ...appOptions })
  } catch (error) {
    if (!providedDatabase) await database.close()
    if (previousEnv) restoreEnv(previousEnv)
    if (!providedUploadDirectory) {
      await fs.rm(uploadDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
    throw error
  }

  const client = createTestRequest(app)
  const context = {
    app,
    request: client,
    agent: client,
    database,
    db: database.connection,
    filePath: database.filePath,
    uploadDir,
    reset: () => database.reset(),
  }

  let closed = false
  context.close = async () => {
    if (closed) return
    closed = true

    if (!providedDatabase) await database.close()
    restoreEnv(previousEnv)
    if (!providedUploadDirectory) {
      await fs.rm(uploadDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  return context
}

export { createTestApp, createTestRequest }

export default {
  createTestApp,
  createTestRequest,
}
