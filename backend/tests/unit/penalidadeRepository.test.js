import { describe, expect, it, vi } from 'vitest'
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../../src/middlewares/errorHandler.js'
import {
  PONTOS,
  PONTOS_EVENTO,
  PenalidadeRepository,
  normalizarPenalidade,
  normalizarReferencia,
} from '../../src/repositories/penalidadeRepository.js'

function conexaoFake(impl = {}) {
  return {
    get: vi.fn(impl.get ?? (() => undefined)),
    all: vi.fn(impl.all ?? (() => [])),
    run: vi.fn(impl.run ?? (() => ({ lastID: 1, changes: 1 }))),
  }
}

describe('Normalização de penalidades (RF-030, RN-015)', () => {
  it('[RN-015] normaliza referências diretas e por id', () => {
    expect(normalizarReferencia({ referencia: ' oferta: 12 ' })).toBe('oferta:12')
    expect(normalizarReferencia({ referencia_id: 'reserva:7' })).toBe('reserva:7')
    expect(normalizarReferencia({ referenciaId: 'viagem:3' })).toBe('viagem:3')
    expect(normalizarReferencia({ reservaId: '2' })).toBe('reserva:2')
    expect(normalizarReferencia({ oferta_id: 4 })).toBe('oferta:4')
    expect(normalizarReferencia({ viagemId: 5 })).toBe('viagem:5')
  })

  it('[RN-015] rejeita referências inválidas', () => {
    expect(() => normalizarReferencia(null)).toThrow('Penalidade inválida')
    expect(() => normalizarReferencia([])).toThrow('Penalidade inválida')
    expect(() => normalizarReferencia({})).toThrow('referencia é obrigatória')
    expect(() => normalizarReferencia({ referencia: 'usuario:1' })).toThrow('referencia deve usar viagem:, oferta: ou reserva:')
    expect(() => normalizarReferencia({ referencia: 'oferta' })).toThrow('referencia deve usar viagem:, oferta: ou reserva:')
    expect(() => normalizarReferencia({ referencia: 'oferta:0' })).toThrow('referencia deve ser um inteiro positivo')
    expect(() => normalizarReferencia({ reserva_id: -1 })).toThrow('reserva_id deve ser um inteiro positivo')
  })

  it('[RN-015] normaliza tipo, motivo, pontos e usuário', () => {
    expect(normalizarPenalidade({
      tipoEvento: 'no-show passageiro',
      usuarioId: '8',
      reserva_id: 9,
      motivo: ' Falta sem aviso ',
    })).toEqual({
      usuario_id: 8,
      pontos: 2,
      motivo: 'Falta sem aviso',
      tipo_evento: 'NO_SHOW_PASSAGEIRO',
      referencia: 'reserva:9',
    })
    expect(normalizarPenalidade({
      evento: 'ausencia-motorista',
      usuario: { id: 3 },
      viagem_id: 4,
    })).toEqual({
      usuario_id: 3,
      pontos: 2,
      motivo: 'AUSENCIA_MOTORISTA',
      tipo_evento: 'AUSENCIA_MOTORISTA',
      referencia: 'viagem:4',
    })
    expect(Object.isFrozen(PONTOS)).toBe(true)
    expect(Object.isFrozen(PONTOS_EVENTO)).toBe(true)
    expect(PONTOS_EVENTO.NO_SHOW_PASSAGEIRO).toBe(PONTOS.DOIS)
  })

  it('[RN-015] não gera penalidade para cancelamento por exclusão de conta', () => {
    for (const natureza of [
      'exclusao_de_conta',
      'Cancelamento por Exclusão de Conta',
      '  exclusao_de_conta  ',
      'conta_excluida',
      { naturezaCancelamento: 'CANCELAMENTO_EXCLUSAO_CONTA' },
    ]) {
      const dados = typeof natureza === 'string'
        ? { tipo_evento: 'CANCELAMENTO_COMUM', usuario_id: 1, oferta_id: 2, natureza_cancelamento: natureza }
        : { tipo_evento: 'CANCELAMENTO_COMUM', usuario_id: 1, oferta_id: 2, ...natureza }

      expect(() => normalizarPenalidade(dados)).toThrow(UnprocessableError)
    }
  })

  it('[RN-015] rejeita penalidades inválidas', () => {
    expect(() => normalizarPenalidade([])).toThrow('Penalidade inválida')
    expect(() => normalizarPenalidade({ usuario_id: 1, oferta_id: 2 })).toThrow('tipo_evento é obrigatório')
    expect(() => normalizarPenalidade({ tipo_evento: 'DESCONHECIDO', usuario_id: 1, oferta_id: 2 }))
      .toThrow('tipo_evento sem pontuação mapeada')
    expect(() => normalizarPenalidade({ tipo_evento: 'CANCELAMENTO_COMUM', oferta_id: 2 }))
      .toThrow('usuario_id deve ser um inteiro positivo')
    expect(() => normalizarPenalidade({ tipo_evento: 'CANCELAMENTO_COMUM', usuario_id: 1 }))
      .toThrow('referencia é obrigatória')
  })
})

describe('PenalidadeRepository com conexão fake (RF-030, RN-015)', () => {
  it('[RF-030] cria penalidade e retorna o registro inserido', async () => {
    const conn = conexaoFake({
      run: () => ({ lastID: 11, changes: 1 }),
      get: () => ({ id: 11, pontos: 1 }),
    })
    const repositorio = new PenalidadeRepository(conn)

    expect(await repositorio.criar({
      tipoEvento: 'cancelamento comum',
      usuarioId: 4,
      oferta_id: 8,
    }, conn)).toEqual({ id: 11, pontos: 1 })
    expect(conn.run.mock.calls[0][1]).toEqual([
      4, 1, 'CANCELAMENTO_COMUM', 'CANCELAMENTO_COMUM', 'oferta:8',
    ])
    expect(conn.get.mock.calls[0][1]).toEqual([11])
  })

  it('[RN-015] traduz erros de escrita do banco', async () => {
    const casos = [
      ['cancelamento por exclusao de conta nao gera penalidade', UnprocessableError],
      ['FOREIGN KEY constraint failed', NotFoundError],
      ['UNIQUE constraint failed', ConflictError],
      ['CHECK constraint failed', ValidationError],
      ['NOT NULL constraint failed', ValidationError],
    ]
    const dados = { tipo_evento: 'NO_SHOW_PASSAGEIRO', usuario_id: 1, reserva_id: 2 }

    for (const [mensagem, TipoErro] of casos) {
      const conn = conexaoFake({ run: () => Promise.reject(new Error(mensagem)) })
      const repositorio = new PenalidadeRepository(conn)
      await expect(repositorio.criar(dados, conn)).rejects.toBeInstanceOf(TipoErro)
    }

    const erroInesperado = new Error('falha de conexão')
    const conn = conexaoFake({ run: () => Promise.reject(erroInesperado) })
    const repositorio = new PenalidadeRepository(conn)
    await expect(repositorio.criar(dados, conn)).rejects.toBe(erroInesperado)
  })

  it('[RF-030] busca, lista e soma pontos', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ total: '5' })
        .mockResolvedValueOnce(undefined),
      all: vi.fn()
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([{ id: 2 }]),
    })
    const repositorio = new PenalidadeRepository(conn)

    expect(await repositorio.buscarPorId(1, conn)).toEqual({ id: 1 })
    expect(await repositorio.buscarPorId(2, conn)).toBeNull()
    await expect(repositorio.buscarPorId(0, conn)).rejects.toThrow('id deve ser um inteiro positivo')

    expect(await repositorio.listarPorUsuario(3, conn)).toEqual([{ id: 1 }])
    expect(conn.all.mock.calls[0][1]).toEqual([3])
    expect(conn.all.mock.calls[0][0]).toContain('ORDER BY criado_em DESC, id DESC')

    expect(await repositorio.listarPorReferencia(' oferta: 4 ', conn)).toEqual([{ id: 2 }])
    expect(conn.all.mock.calls[1][1]).toEqual(['oferta:4'])
    await expect(repositorio.listarPorReferencia('usuario:1', conn)).rejects.toThrow('referencia deve usar viagem:, oferta: ou reserva:')
    await expect(repositorio.listarPorReferencia('', conn)).rejects.toThrow('referencia é obrigatório')

    expect(await repositorio.totalPontos(3, conn)).toBe(5)
    expect(await repositorio.totalPontos(4, conn)).toBe(0)
  })
})
