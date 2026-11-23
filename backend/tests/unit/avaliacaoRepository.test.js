import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, NotFoundError, ValidationError } from '../../src/middlewares/errorHandler.js'
import { getConnection } from '../../src/db/connection.js'
import {
  AvaliacaoRepository,
  normalizarAvaliacao,
} from '../../src/repositories/avaliacaoRepository.js'

vi.mock('../../src/db/connection.js', () => ({ getConnection: vi.fn() }))

const CONEXAO = { nome: 'conexao-fake' }

function conexaoFake(impl = {}) {
  return {
    get: vi.fn(impl.get ?? (() => undefined)),
    run: vi.fn(impl.run ?? (() => ({ lastID: 33, changes: 1 }))),
  }
}

describe('Normalização de avaliações (RF-028)', () => {
  it('aceita chaves snake_case e camelCase', () => {
    const avaliacao = {
      oferta_id: 12,
      avaliador_id: 3,
      avaliado_id: 8,
      nota: 4,
    }

    expect(normalizarAvaliacao(avaliacao)).toEqual(avaliacao)
    expect(normalizarAvaliacao({
      ofertaId: '12',
      avaliadorId: '3',
      avaliadoId: '8',
      nota: '5',
    })).toEqual({ ...avaliacao, nota: 5 })
    expect(normalizarAvaliacao({ ...avaliacao, nota: 5 })).toEqual({ ...avaliacao, nota: 5 })
  })

  it('rejeita entradas inválidas', () => {
    const casos = [
      [null, 'Avaliação inválida'],
      [[], 'Avaliação inválida'],
      ['texto', 'Avaliação inválida'],
      [{ avaliador_id: 3, avaliado_id: 8, nota: 4 }, 'oferta_id deve ser inteiro positivo'],
      [{ oferta_id: 0, avaliador_id: 3, avaliado_id: 8, nota: 4 }, 'oferta_id deve ser inteiro positivo'],
      [{ oferta_id: 12, avaliado_id: 8, nota: 4 }, 'avaliador_id deve ser inteiro positivo'],
      [{ oferta_id: 12, avaliador_id: 3, nota: 4 }, 'avaliado_id deve ser inteiro positivo'],
      [{ oferta_id: 12, avaliador_id: 3, avaliado_id: 8 }, 'nota deve ser inteiro entre 1 e 5'],
      [{ oferta_id: 12, avaliador_id: 3, avaliado_id: 8, nota: 6 }, 'nota deve ser inteiro entre 1 e 5'],
      [{ oferta_id: 12, avaliador_id: 3, avaliado_id: 8, nota: 2.5 }, 'nota deve ser inteiro entre 1 e 5'],
    ]

    for (const [dados, mensagem] of casos) {
      expect(() => normalizarAvaliacao(dados)).toThrow(TypeError)
      expect(() => normalizarAvaliacao(dados)).toThrow(mensagem)
    }
  })
})

describe('AvaliacaoRepository com conexão fake (RF-028)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConnection).mockResolvedValue(CONEXAO)
  })

  it('usa a conexão do construtor, a conexão da chamada e a conexão padrão', async () => {
    const conexaoConstrutor = conexaoFake({ get: () => ({ id: 33, nota: 4 }) })
    const repositorio = new AvaliacaoRepository(conexaoConstrutor)

    await repositorio.buscarPorId(33)
    expect(conexaoConstrutor.get).toHaveBeenCalledWith(
      'SELECT * FROM avaliacoes WHERE id = ?',
      [33],
    )

    const conexaoChamada = conexaoFake({ get: () => ({ id: 33, nota: 5 }) })
    expect(await repositorio.buscarPorId('33', conexaoChamada)).toEqual({ id: 33, nota: 5 })
    expect(conexaoConstrutor.get).toHaveBeenCalledTimes(1)

    const padrao = conexaoFake({ get: () => ({ id: 33, nota: 3 }) })
    vi.mocked(getConnection).mockResolvedValue(padrao)
    expect(await new AvaliacaoRepository().buscarPorId(33)).toEqual({ id: 33, nota: 3 })
    expect(getConnection).toHaveBeenCalledTimes(1)
    await expect(repositorio.buscarPorId('abc')).rejects.toThrow('id deve ser inteiro positivo')
  })

  it('insere avaliação normalizada e retorna o registro criado', async () => {
    const registro = { id: 33, oferta_id: 12, avaliador_id: 3, avaliado_id: 8, nota: 4 }
    const conn = conexaoFake({
      run: () => ({ lastID: 33, changes: 1 }),
      get: () => registro,
    })
    const repositorio = new AvaliacaoRepository(conn)

    expect(await repositorio.criar({
      ofertaId: '12',
      avaliadorId: '3',
      avaliadoId: '8',
      nota: '4',
    })).toEqual(registro)

    expect(conn.run.mock.calls[0][0]).toContain('INSERT INTO avaliacoes')
    expect(conn.run.mock.calls[0][1]).toEqual([12, 3, 8, 4])
    expect(conn.get).toHaveBeenCalledWith('SELECT * FROM avaliacoes WHERE id = ?', [33])
  })

  it('traduz erros de banco ao criar avaliação', async () => {
    const casos = [
      ['UNIQUE constraint failed: avaliacoes.oferta_id', ConflictError, 'Avaliação já registrada para este participante'],
      ['avaliacao permitida apenas em viagem concluida sem no-show', ConflictError, 'Avaliação permitida apenas para viagem concluída sem registro de no-show'],
      ['FOREIGN KEY constraint failed', NotFoundError, 'Oferta ou usuário não encontrado'],
      ['CHECK constraint failed: nota', ValidationError, 'Avaliação inválida'],
    ]

    for (const [mensagem, TipoErro, texto] of casos) {
      const conn = conexaoFake({ run: () => Promise.reject(new Error(mensagem)) })
      await expect(new AvaliacaoRepository(conn).criar({
        oferta_id: 12,
        avaliador_id: 3,
        avaliado_id: 8,
        nota: 4,
      })).rejects.toBeInstanceOf(TipoErro)
      await expect(new AvaliacaoRepository(conn).criar({
        oferta_id: 12,
        avaliador_id: 3,
        avaliado_id: 8,
        nota: 4,
      })).rejects.toThrow(texto)
    }

    const erroInesperado = new Error('falha de disco')
    const conn = conexaoFake({ run: () => Promise.reject(erroInesperado) })
    await expect(new AvaliacaoRepository(conn).criar({
      oferta_id: 12,
      avaliador_id: 3,
      avaliado_id: 8,
      nota: 4,
    })).rejects.toBe(erroInesperado)
  })

  it('busca por oferta e avaliador e detecta no-show na oferta', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce({ id: 55, nota: 5 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ existe: 1 })
        .mockResolvedValueOnce(undefined),
    })
    const repositorio = new AvaliacaoRepository(conn)

    expect(await repositorio.buscarPorOfertaEAvaliador('12', '3')).toEqual({ id: 55, nota: 5 })
    expect(conn.get.mock.calls[0][1]).toEqual([12, 3])
    expect(await repositorio.buscarPorOfertaEAvaliador(12, 3)).toBeNull()

    expect(await repositorio.existeNoShowNaOferta('12')).toBe(true)
    expect(conn.get.mock.calls[2][0]).toContain("status = 'NO_SHOW'")
    expect(await repositorio.existeNoShowNaOferta(12)).toBe(false)

    await expect(repositorio.buscarPorOfertaEAvaliador(0, 3)).rejects.toThrow('oferta_id deve ser inteiro positivo')
    await expect(repositorio.buscarPorOfertaEAvaliador(12, 0)).rejects.toThrow('avaliador_id deve ser inteiro positivo')
    await expect(repositorio.existeNoShowNaOferta(-1)).rejects.toThrow('oferta_id deve ser inteiro positivo')
  })
})
