import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  createApp,
  discoverRouters,
  getDiscoveredRouters,
  healthcheck,
  mountRouters,
  resolveCorsOrigin,
  resolveUploadDirectory,
} from '../../src/app.js'

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ROTA_AUTENTICACAO = path.resolve(BACKEND_ROOT, 'src/routes/authRoutes.js')
const MODULO_SEM_ROTA = path.resolve(BACKEND_ROOT, 'src/utils/percurso.js')

function respostaFake() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
}

describe('Configuração da aplicação (RNF-001, RNF-004, RNF-005)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('[RNF-004] resolve diretório de upload absoluto, relativo e por variável de ambiente', () => {
    const absoluto = path.resolve(os.tmpdir(), 'uploads')
    expect(resolveUploadDirectory(absoluto)).toBe(absoluto)
    expect(resolveUploadDirectory('src/uploads/perfis')).toBe(
      path.resolve(BACKEND_ROOT, 'src/uploads/perfis'),
    )

    vi.stubEnv('UPLOAD_DIR', './uploads-ambiente')
    expect(resolveUploadDirectory('')).toBe(path.resolve(BACKEND_ROOT, 'uploads-ambiente'))
    expect(resolveUploadDirectory('src/outro')).toBe(path.resolve(BACKEND_ROOT, 'src/outro'))
  })

  it('[RNF-005] resolve origem CORS para curinga, vazio, uma ou várias origens', () => {
    expect(resolveCorsOrigin()).not.toBeInstanceOf(Array)
    expect(resolveCorsOrigin('')).toBe(true)
    expect(resolveCorsOrigin('   ')).toBe(true)
    expect(resolveCorsOrigin('*')).toBe(true)
    expect(resolveCorsOrigin(' , ')).toBe(true)
    expect(resolveCorsOrigin(' http://localhost:3000 ')).toBe('http://localhost:3000')
    expect(resolveCorsOrigin('http://a.test, http://b.test')).toEqual([
      'http://a.test',
      'http://b.test',
    ])
  })

  it('[RNF-004] monta roteadores a partir de definições em texto ou objeto', () => {
    const app = { use: vi.fn() }
    const roteador = { use: vi.fn() }

    expect(mountRouters(app, [
      { router: roteador },
      { path: '/customizado', router: roteador },
      { mountPath: '/alias', handler: roteador },
    ])).toBe(app)

    expect(app.use.mock.calls).toEqual([
      ['/api', roteador],
      ['/customizado', roteador],
      ['/alias', roteador],
    ])
    expect(() => mountRouters(app, [null])).toThrow('Definição de roteador inválida')
    expect(() => mountRouters(app, [{ path: '/sem-rota', router: {} }]))
      .toThrow('Roteador inválido para /sem-rota')
  })

  it('[RNF-004] descobre roteadores reais, ignora arquivos ausentes e valida exports', async () => {
    const descobertos = await discoverRouters({
      definitions: [
        { path: '/api/auth', file: ROTA_AUTENTICACAO, exportName: 'routes' },
        { path: '/api/texto', file: ROTA_AUTENTICACAO },
        ROTA_AUTENTICACAO,
        { path: '/api/ausente', file: path.resolve(BACKEND_ROOT, 'src/routes/naoExiste.js') },
      ],
    })

    expect(descobertos).toHaveLength(3)
    expect(descobertos.map((item) => item.path)).toEqual(['/api/auth', '/api/texto', '/api'])
    expect(typeof descobertos[0].router.use).toBe('function')
    expect(await discoverRouters({ definitions: [] })).toEqual([])
    await expect(discoverRouters({
      definitions: [{ path: '/api/invalido', file: MODULO_SEM_ROTA }],
    })).rejects.toThrow('Roteador inválido em')
  })

  it('[RNF-004] expõe uma cópia dos roteadores descobertos por padrão', () => {
    const roteadores = getDiscoveredRouters()

    expect(roteadores.length).toBeGreaterThan(0)
    expect(roteadores.every((item) => typeof item.router.use === 'function')).toBe(true)
    roteadores.pop()
    expect(getDiscoveredRouters()).toHaveLength(roteadores.length + 1)
  })

  it('[RNF-005] healthcheck responde com status do serviço', () => {
    const res = respostaFake()

    healthcheck({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ok',
      service: 'carona-univille-api',
    }))
  })
})

describe('Aplicação Express (RNF-001, RNF-004, RNF-005)', () => {
  let diretorio

  beforeAll(async () => {
    diretorio = await fs.mkdtemp(path.join(os.tmpdir(), 'carona-app-unit-'))
  })

  afterAll(async () => {
    await fs.rm(diretorio, { recursive: true, force: true })
  })

  it('[RNF-004] configura diretório de upload sem criá-lo quando solicitado', async () => {
    const caminho = path.join(diretorio, 'nao-criado')
    const app = createApp({ uploadDir: caminho, createUploadDir: false, routers: [] })

    expect(app.get('uploadDir')).toBe(caminho)
    expect(app.locals.uploadDir).toBe(caminho)
    expect(app.disabled('x-powered-by')).toBe(true)
    await expect(fs.stat(caminho)).rejects.toThrow()
  })

  it('[RNF-004] cria o diretório de upload por padrão', async () => {
    const caminho = path.join(diretorio, 'criado')
    createApp({ uploadDir: caminho, routers: [] })

    expect((await fs.stat(caminho)).isDirectory()).toBe(true)
  })

  it('[RNF-001] responde health, 404 e arquivos estáticos com cabeçalhos seguros', async () => {
    const caminho = path.join(diretorio, 'estaticos')
    await fs.mkdir(caminho, { recursive: true })
    await fs.writeFile(path.join(caminho, 'perfil.txt'), 'conteudo')
    const app = createApp({
      uploadDir: caminho,
      createUploadDir: false,
      routers: [],
      cors: { origin: 'http://permitido' },
    })

    const health = await request(app).get('/health').set('Origin', 'http://permitido')
    expect(health.status).toBe(200)
    expect(health.body.status).toBe('ok')
    expect(health.headers['access-control-allow-origin']).toBe('http://permitido')

    const healthApi = await request(app).get('/api/health')
    expect(healthApi.status).toBe(200)
    expect(healthApi.body.service).toBe('carona-univille-api')

    const ausente = await request(app).get('/rota-inexistente')
    expect(ausente.status).toBe(404)
    expect(ausente.body).toMatchObject({ code: 'NOT_FOUND' })

    const estatico = await request(app).get('/uploads/perfil.txt')
    expect(estatico.status).toBe(200)
    expect(estatico.text).toBe('conteudo')
    expect(estatico.headers['cache-control']).toBe('no-store')
    expect(estatico.headers['x-content-type-options']).toBe('nosniff')
  })
})
