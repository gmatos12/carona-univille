import { describe, expect, it, vi } from 'vitest'
import { HistoricoRepository, NATUREZAS, TIPOS_EVENTO, normalizarEvento, normalizarFiltros } from '../../src/repositories/historicoRepository.js'

function conexaoFake(impl = {}) {
  return {
    get: vi.fn(impl.get ?? (() => undefined)),
    all: vi.fn(impl.all ?? (() => [])),
    run: vi.fn(impl.run ?? (() => ({ lastID: 1, changes: 1 }))),
  }
}

const EVENTO = {
  entidadeTipo: 'oferta',
  tipoEvento: 'OFERTA_CRIADA',
  entidadeId: '12',
  atorUsuarioId: 3,
  natureza: ' CRIACAO_OFERTA ',
  detalhes: { origem: 'A', senha: 'segredo', aninhado: [{ token: 'abc', texto: 'B' }] },
}

describe('Normalização de eventos e filtros do histórico (RF-027, RNF-004)', () => {
  it('[RF-027] normaliza aliases, textos, inteiros e remove dados sensíveis', () => {
    const resultado = normalizarEvento(EVENTO)

    expect(resultado).toEqual({
      tipo_evento: 'OFERTA_CRIADA',
      entidade_tipo: 'oferta',
      entidade_id: 12,
      ator_usuario_id: 3,
      natureza: 'CRIACAO_OFERTA',
      detalhes: JSON.stringify({ origem: 'A', aninhado: [{ texto: 'B' }] }),
    })

    const emSnake = normalizarEvento({
      entidade_tipo: 'reserva',
      tipo_evento: 'RESERVA_CRIADA',
      entidade_id: 4,
      ator_usuario_id: null,
      detalhes: '{"passageiro":5,"Password":"x"}',
    })

    expect(emSnake).toEqual({
      tipo_evento: 'RESERVA_CRIADA',
      entidade_tipo: 'reserva',
      entidade_id: 4,
      ator_usuario_id: null,
      natureza: null,
      detalhes: '{"passageiro":5}',
    })
    expect(Object.isFrozen(NATUREZAS)).toBe(true)
    expect(Object.isFrozen(TIPOS_EVENTO)).toBe(true)
  })

  it('[RF-027] rejeita eventos inválidos', () => {
    expect(() => normalizarEvento(null)).toThrow(TypeError)
    expect(() => normalizarEvento([])).toThrow(TypeError)
    expect(() => normalizarEvento({ ...EVENTO, entidadeTipo: ' ' })).toThrow('entidade_tipo é obrigatório')
    expect(() => normalizarEvento({ ...EVENTO, entidadeTipo: 'desconhecida' })).toThrow('entidade_tipo inválido')
    expect(() => normalizarEvento({ ...EVENTO, tipoEvento: '' })).toThrow('tipo_evento é obrigatório')
    expect(() => normalizarEvento({ ...EVENTO, entidadeId: 0 })).toThrow('entidade_id deve ser um inteiro positivo')
    expect(() => normalizarEvento({ ...EVENTO, atorUsuarioId: -1 })).toThrow('ator_usuario_id deve ser um inteiro positivo')
    expect(() => normalizarEvento({ ...EVENTO, natureza: 7 })).toThrow('natureza deve ser texto')
    expect(() => normalizarEvento({ ...EVENTO, detalhes: '[]' })).toThrow('detalhes devem ser um objeto JSON válido')
    expect(() => normalizarEvento({ ...EVENTO, detalhes: '{' })).toThrow('detalhes devem ser um objeto JSON válido')
    expect(() => normalizarEvento({ ...EVENTO, detalhes: ['a'] })).toThrow('detalhes devem ser um objeto')
    expect(() => normalizarEvento({ ...EVENTO, detalhes: 42 })).toThrow('detalhes devem ser um objeto')
  })

  it('[RF-027] aplica limites e aliases nos filtros', () => {
    expect(normalizarFiltros()).toEqual({ limit: 100, offset: 0 })
    expect(normalizarFiltros({
      entidade_tipo: 'penalidade',
      entidade_id: '9',
      ator_usuario_id: 2,
      tipo_evento: 'PENALIDADE_REGISTRADA',
      natureza: 'PENALIDADE_REGISTRADA',
      data_inicio: '2026-01-01',
      data_fim: '2026-01-31',
      limite: 999,
      offset: '5',
    })).toEqual({
      entidadeTipo: 'penalidade',
      entidadeId: 9,
      atorUsuarioId: 2,
      tipoEvento: 'PENALIDADE_REGISTRADA',
      natureza: 'PENALIDADE_REGISTRADA',
      dataInicio: '2026-01-01',
      dataFim: '2026-01-31',
      limit: 500,
      offset: 5,
    })
    expect(normalizarFiltros({ limit: 0, offset: 0 })).toEqual({ limit: 0, offset: 0 })
  })

  it('[RF-027] rejeita filtros inválidos', () => {
    expect(() => normalizarFiltros(null)).toThrow('Filtros inválidos')
    expect(() => normalizarFiltros([])).toThrow('Filtros inválidos')
    expect(() => normalizarFiltros({ entidadeTipo: 'outro' })).toThrow('entidade_tipo inválido')
    expect(() => normalizarFiltros({ entidadeId: 0 })).toThrow('entidade_id deve ser um inteiro positivo')
    expect(() => normalizarFiltros({ limit: -1 })).toThrow('limit deve ser um inteiro não negativo')
    expect(() => normalizarFiltros({ offset: 1.5 })).toThrow('offset deve ser um inteiro não negativo')
    expect(() => normalizarFiltros({ dataInicio: 10 })).toThrow('data_inicio deve ser texto')
  })
})

describe('HistoricoRepository com conexão fake (RF-027, RNF-004)', () => {
  it('[RF-027] cria evento e recupera o registro inserido na mesma conexão', async () => {
    const conn = conexaoFake({
      run: () => ({ lastID: 15, changes: 1 }),
      get: () => ({ id: 15, tipo_evento: 'OFERTA_CRIADA', detalhes: '{"origem":"A"}' }),
    })
    const repositorio = new HistoricoRepository(conn)

    const evento = await repositorio.criar(EVENTO)

    expect(conn.run).toHaveBeenCalledTimes(1)
    expect(conn.run.mock.calls[0][0]).toContain('INSERT INTO historico_eventos')
    expect(conn.run.mock.calls[0][1]).toEqual([
      'OFERTA_CRIADA', 'oferta', 12, 3, 'CRIACAO_OFERTA',
      JSON.stringify({ origem: 'A', aninhado: [{ texto: 'B' }] }),
    ])
    expect(conn.get).toHaveBeenCalledWith('SELECT * FROM historico_eventos WHERE id = ?', [15])
    expect(evento.detalhes).toEqual({ origem: 'A' })
  })

  it('[RF-027] retorna nulo quando não há registro e normaliza detalhes inválidos', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, detalhes: '{invalido' })
        .mockResolvedValueOnce({ id: 2, detalhes: '[1,2]' }),
    })
    const repositorio = new HistoricoRepository(conn)

    expect(await repositorio.buscarPorId(1, conn)).toBeNull()
    expect((await repositorio.buscarPorId(1, conn)).detalhes).toEqual({})
    expect((await repositorio.buscarPorId(1, conn)).detalhes).toEqual({})
    await expect(repositorio.buscarPorId('abc', conn)).rejects.toThrow('id deve ser um inteiro positivo')
  })

  it('[RF-027] monta cláusulas e parâmetros para listagem e contagem', async () => {
    const conn = conexaoFake({ all: () => [{ id: 1, detalhes: '{"ok":true}' }], get: () => ({ total: '4' }) })
    const repositorio = new HistoricoRepository(conn)
    const filtros = {
      entidadeTipo: 'reserva',
      entidadeId: 8,
      atorUsuarioId: 2,
      tipoEvento: 'RESERVA_CRIADA',
      natureza: 'RESERVA_CONFIRMADA',
      dataInicio: '2026-01-01',
      dataFim: '2026-01-31',
      limit: 10,
      offset: 20,
    }

    const eventos = await repositorio.listar(filtros, conn)

    expect(conn.all.mock.calls[0][0]).toContain('WHERE entidade_tipo = ? AND entidade_id = ? AND ator_usuario_id = ?')
    expect(conn.all.mock.calls[0][0]).toContain('criado_em >= ? AND criado_em <= ?')
    expect(conn.all.mock.calls[0][1]).toEqual([
      'reserva', 8, 2, 'RESERVA_CRIADA', 'RESERVA_CONFIRMADA', '2026-01-01', '2026-01-31', 10, 20,
    ])
    expect(eventos[0].detalhes).toEqual({ ok: true })

    expect(await repositorio.contar(filtros, conn)).toBe(4)
    expect(conn.get.mock.calls[0][0]).toContain('SELECT COUNT(*) AS total')
    expect(conn.get.mock.calls[0][1]).toHaveLength(7)
  })

  it('[RF-027] listarPorEntidade, listarPorAtor e listarPorTipo sobrescrevem o filtro correspondente', async () => {
    const conn = conexaoFake()
    const repositorio = new HistoricoRepository(conn)

    await repositorio.listarPorEntidade('oferta', 3, { entidadeTipo: 'reserva', limit: 2 }, conn)
    await repositorio.listarPorAtor(9, { atorUsuarioId: 1 }, conn)
    await repositorio.listarPorTipo('VIAGEM_INICIADA', {}, conn)

    expect(conn.all.mock.calls[0][1]).toEqual(['oferta', 3, 2, 0])
    expect(conn.all.mock.calls[1][1]).toEqual([9, 100, 0])
    expect(conn.all.mock.calls[2][1]).toEqual(['VIAGEM_INICIADA', 100, 0])
  })

  it('[RF-027] contagem sem resultado retorna zero', async () => {
    const conn = conexaoFake({ get: () => undefined })
    const repositorio = new HistoricoRepository(conn)

    expect(await repositorio.contar({}, conn)).toBe(0)
    expect(conn.get.mock.calls[0][1]).toEqual([])
  })
})
