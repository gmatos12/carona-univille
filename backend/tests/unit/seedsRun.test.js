import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnection } from '../../src/db/connection.js'
import { runSeed, seedMatriculasAutorizadas } from '../../src/db/seeds/run.js'

vi.mock('../../src/db/connection.js', async (importOriginal) => {
  const original = await importOriginal()
  return { ...original, createConnection: vi.fn() }
})

const CAMINHO_SEED = fileURLToPath(new URL('../../src/db/seeds/run.js', import.meta.url))
const ARGV_ORIGINAL = process.argv.slice()
const EXIT_CODE_ORIGINAL = process.exitCode

function conexaoFake(impl = {}) {
  const transacao = {
    get: vi.fn(impl.get ?? (() => ({ name: 'matriculas_autorizadas' }))),
    run: vi.fn(impl.run ?? (() => ({ changes: 1 }))),
  }
  const conexao = {
    get: transacao.get,
    run: transacao.run,
    transaction: vi.fn((callback) => callback(transacao)),
    close: vi.fn(),
  }
  return { conexao, transacao }
}

describe('Seed de matrículas autorizadas (RF-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.argv.splice(0, process.argv.length, ...ARGV_ORIGINAL)
    process.exitCode = EXIT_CODE_ORIGINAL
    vi.restoreAllMocks()
  })

  it('insere todas as matrículas na conexão informada sem fechá-la', async () => {
    const { conexao, transacao } = conexaoFake()

    expect(await runSeed({ connection: conexao })).toEqual({
      inseridas: 20,
      total: 20,
      tabela: 'matriculas_autorizadas',
    })

    expect(createConnection).not.toHaveBeenCalled()
    expect(conexao.transaction).toHaveBeenCalledWith(expect.any(Function))
    expect(transacao.get).toHaveBeenCalledWith(expect.stringContaining('sqlite_master'), [
      'matriculas_autorizadas',
    ])
    expect(transacao.run).toHaveBeenCalledTimes(20)
    expect(transacao.run.mock.calls[0][1]).toEqual(['99000001'])
    expect(transacao.run.mock.calls[19][1]).toEqual(['99000020'])
    expect(conexao.close).not.toHaveBeenCalled()
  })

  it('soma apenas linhas efetivamente alteradas', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 })
      .mockResolvedValue({ changes: 0 })
    const { conexao, transacao } = conexaoFake({ run })

    expect(await seedMatriculasAutorizadas({ connection: conexao })).toEqual({
      inseridas: 1,
      total: 20,
      tabela: 'matriculas_autorizadas',
    })
    expect(transacao.run).toHaveBeenCalledTimes(20)
  })

  it('falha quando a tabela de matrículas não existe', async () => {
    const { conexao } = conexaoFake({ get: () => null })

    await expect(seedMatriculasAutorizadas({ connection: conexao })).rejects.toThrow(
      'Tabela matriculas_autorizadas não encontrada; execute as migrations antes do seed',
    )
    expect(conexao.close).not.toHaveBeenCalled()
  })

  it('cria e fecha a própria conexão quando nenhuma é informada', async () => {
    const { conexao } = conexaoFake()
    vi.mocked(createConnection).mockResolvedValue(conexao)

    expect(await seedMatriculasAutorizadas({ filePath: ':memory:' })).toEqual({
      inseridas: 20,
      total: 20,
      tabela: 'matriculas_autorizadas',
    })

    expect(createConnection).toHaveBeenCalledWith({ filePath: ':memory:' })
    expect(conexao.close).toHaveBeenCalledTimes(1)
  })

  it('fecha a conexão própria mesmo quando o seed falha', async () => {
    const { conexao } = conexaoFake({ get: () => undefined })
    vi.mocked(createConnection).mockResolvedValue(conexao)

    await expect(runSeed()).rejects.toThrow('não encontrada')
    expect(conexao.close).toHaveBeenCalledTimes(1)
  })

  it('exibe o resultado ao ser executado como script', async () => {
    const { conexao } = conexaoFake({ run: () => ({ changes: 1 }) })
    vi.mocked(createConnection).mockResolvedValue(conexao)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.argv[1] = CAMINHO_SEED

    await import('../../src/db/seeds/run.js?cli-sucesso')

    expect(log).toHaveBeenCalledWith(
      'Seed de matrículas autorizadas concluído: 20 inseridas de 20 na tabela matriculas_autorizadas.',
    )
  })

  it('registra falha e marca exitCode ao ser executado como script', async () => {
    const { conexao } = conexaoFake({ get: () => null })
    vi.mocked(createConnection).mockResolvedValue(conexao)
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.argv[1] = CAMINHO_SEED

    await import('../../src/db/seeds/run.js?cli-falha')

    expect(erro).toHaveBeenCalledWith(
      'Falha ao aplicar seed de matrículas autorizadas:',
      expect.stringContaining('não encontrada'),
    )
    expect(process.exitCode).toBe(1)
  })
})
