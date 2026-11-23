import { describe, expect, it, vi } from 'vitest'
import {
  MATRICULAS_AUTORIZADAS_TABLE,
  MatriculaRepository,
  normalizarMatricula,
} from '../../src/repositories/matriculaRepository.js'

function conexaoFake(impl = {}) {
  return {
    get: vi.fn(impl.get ?? (() => undefined)),
    all: vi.fn(impl.all ?? (() => [])),
    run: vi.fn(impl.run ?? (() => ({ lastID: 0, changes: 1 }))),
  }
}

describe('Normalização de matrículas autorizadas (RF-002, RN-002)', () => {
  it('[RF-002] normalizarMatricula remove espaços e exige texto', () => {
    expect(normalizarMatricula('  20260001  ')).toBe('20260001')
    expect(() => normalizarMatricula(123, 'matricula do aluno')).toThrow('matricula do aluno é obrigatória')
    expect(() => normalizarMatricula('   ', 'matricula')).toThrow('matricula é obrigatória')
  })

  it('[RF-002] expõe o nome da tabela de matrículas', () => {
    expect(MATRICULAS_AUTORIZADAS_TABLE).toBeTruthy()
    expect(typeof MATRICULAS_AUTORIZADAS_TABLE).toBe('string')
  })
})

describe('MatriculaRepository com conexão fake (RF-002, RN-002)', () => {
  it('[RF-002] busca por matrícula normalizada e retorna nulo quando ausente', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce({ matricula: '20260001', utilizada: 0 })
        .mockResolvedValueOnce(undefined),
    })
    const repositorio = new MatriculaRepository(conn)

    expect(await repositorio.buscarPorMatricula(' 20260001 ', conn)).toEqual({
      matricula: '20260001',
      utilizada: 0,
    })
    expect(conn.get.mock.calls[0][0]).toContain(`FROM ${MATRICULAS_AUTORIZADAS_TABLE}`)
    expect(conn.get.mock.calls[0][1]).toEqual(['20260001'])
    expect(await repositorio.buscarPorMatricula('20260002', conn)).toBeNull()
    await expect(repositorio.buscarPorMatricula(null, conn)).rejects.toThrow('matricula é obrigatória')
  })

  it('[RF-002] existe, estaDisponivel e validarDisponivel refletem o estado da matrícula', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce({ matricula: 'A', utilizada: 1 })
        .mockResolvedValueOnce({ matricula: 'A', utilizada: 1 })
        .mockResolvedValueOnce({ matricula: 'A', utilizada: 0 })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ matricula: 'A', utilizada: 0 })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ matricula: 'A', utilizada: '1' }),
    })
    const repositorio = new MatriculaRepository(conn)

    expect(await repositorio.existe('A', conn)).toBe(true)
    expect(await repositorio.estaDisponivel('A', conn)).toBe(false)
    expect(await repositorio.estaDisponivel('A', conn)).toBe(true)
    expect(await repositorio.existe('B', conn)).toBe(false)
    expect(await repositorio.validarDisponivel(' A ', conn)).toBe('A')
    await expect(repositorio.validarDisponivel('A', conn)).rejects.toThrow('matricula não autorizada')
    await expect(repositorio.validarDisponivel('A', conn)).rejects.toThrow('matricula já utilizada')
  })

  it('[RF-002] lista matrículas disponíveis com filtros e limites', async () => {
    const conn = conexaoFake({ all: () => [{ matricula: 'A', utilizada: 0 }] })
    const repositorio = new MatriculaRepository(conn)

    expect(await repositorio.listarDisponiveis(conn)).toEqual([{ matricula: 'A', utilizada: 0 }])
    expect(conn.all.mock.calls[0][0]).toContain('WHERE utilizada = ?')
    expect(conn.all.mock.calls[0][1]).toEqual([0, 100, 0])

    await repositorio.listar({ matricula: ' A ', utilizada: true, limite: 900, offset: '3' }, conn)
    expect(conn.all.mock.calls[1][1]).toEqual(['A', 1, 500, 3])

    await repositorio.listar({ disponivel: false }, conn)
    expect(conn.all.mock.calls[2][1]).toEqual([1, 100, 0])

    await expect(repositorio.listar(null, conn)).rejects.toThrow('Filtros inválidos')
    await expect(repositorio.listar({ utilizada: 'talvez' }, conn)).rejects.toThrow('utilizada deve ser booleano ou 0/1')
    await expect(repositorio.listar({ limit: -1 }, conn)).rejects.toThrow('limit deve ser um inteiro não negativo')
    await expect(repositorio.listar({ matricula: 10 }, conn)).rejects.toThrow('matricula deve ser texto')
  })

  it('[RN-002] marca matrícula como utilizada ou disponível conforme linhas alteradas', async () => {
    const conn = conexaoFake({
      run: vi.fn()
        .mockResolvedValueOnce({ changes: 1 })
        .mockResolvedValueOnce({ changes: 0 })
        .mockResolvedValueOnce({ changes: 1 })
        .mockResolvedValueOnce({ changes: 0 }),
    })
    const repositorio = new MatriculaRepository(conn)

    expect(await repositorio.marcarUtilizada(' 20260001 ', conn)).toBe(true)
    expect(conn.run.mock.calls[0][0]).toContain('SET utilizada = 1')
    expect(conn.run.mock.calls[0][0]).toContain('WHERE matricula = ? AND utilizada = 0')
    expect(conn.run.mock.calls[0][1]).toEqual(['20260001'])
    expect(await repositorio.marcarUtilizada('20260001', conn)).toBe(false)

    expect(await repositorio.marcarDisponivel(' 20260001 ', conn)).toBe(true)
    expect(conn.run.mock.calls[2][0]).toContain('SET utilizada = 0 WHERE matricula = ?')
    expect(await repositorio.marcarDisponivel('20260001', conn)).toBe(false)
  })

  it('[RF-002] conta matrículas com e sem filtro', async () => {
    const conn = conexaoFake({
      get: vi.fn().mockResolvedValueOnce({ total: '7' }).mockResolvedValueOnce(undefined),
    })
    const repositorio = new MatriculaRepository(conn)

    expect(await repositorio.contar({ disponivel: true }, conn)).toBe(7)
    expect(conn.get.mock.calls[0][1]).toEqual([0])
    expect(await repositorio.contar({}, conn)).toBe(0)
    expect(conn.get.mock.calls[1][1]).toEqual([])
  })
})
