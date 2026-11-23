import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ConflictError, ValidationError } from '../../src/middlewares/errorHandler.js'
import {
  HistoricoService,
  NATUREZAS,
  TIPOS_EVENTO,
} from '../../src/services/historicoService.js'

const CONEXAO = { nome: 'conexao-fake' }
const EVENTO = {
  entidadeTipo: 'oferta',
  tipoEvento: 'OFERTA_CRIADA',
  entidadeId: 12,
  atorUsuarioId: 3,
  natureza: 'CRIACAO_OFERTA',
  detalhes: { oferta_id: 12 },
}

function repositorioFake(impl = {}) {
  return {
    criar: vi.fn(impl.criar ?? ((evento) => ({ id: 1, ...evento }))),
    listar: vi.fn(impl.listar ?? (() => [{ id: 1 }])),
    contar: vi.fn(impl.contar ?? (() => 4)),
  }
}

function ultimoEvento(repositorio) {
  return repositorio.criar.mock.calls.at(-1)[0]
}

describe('HistoricoService - operações básicas (RF-027)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('valida eventos antes de persistir e traduz erros do repositório', async () => {
    const repositorio = repositorioFake()
    const service = new HistoricoService(repositorio)

    expect(await service.registrarEvento({
      entidade_tipo: 'reserva',
      tipo_evento: 'RESERVA_CRIADA',
      entidade_id: '9',
      ator_usuario_id: '2',
      detalhes: '{"passageiro":5}',
    }, CONEXAO)).toEqual(expect.objectContaining({ id: 1, entidade_tipo: 'reserva' }))
    expect(repositorio.criar).toHaveBeenCalledWith(expect.objectContaining({
      entidade_tipo: 'reserva',
      entidade_id: '9',
    }), CONEXAO)

    for (const evento of [null, [], 'texto']) {
      await expect(service.registrarEvento(evento)).rejects.toBeInstanceOf(ValidationError)
    }
    await expect(service.registrarEvento({ ...EVENTO, entidadeTipo: ' ' }))
      .rejects.toThrow('entidade_tipo é obrigatório')

    repositorio.criar.mockRejectedValueOnce(new TypeError('detalhes inválidos'))
    const falhaValidacao = service.registrarEvento(EVENTO)
    await expect(falhaValidacao).rejects.toBeInstanceOf(ValidationError)
    await expect(falhaValidacao).rejects.toThrow('detalhes inválidos')

    const erroApi = new ConflictError('conflito')
    repositorio.criar.mockRejectedValueOnce(erroApi)
    await expect(service.registrarEvento(EVENTO)).rejects.toBe(erroApi)

    const erroInesperado = new Error('falha')
    repositorio.criar.mockRejectedValueOnce(erroInesperado)
    await expect(service.registrarEvento(EVENTO)).rejects.toBe(erroInesperado)
  })

  it('registra listas de eventos e rejeita entradas que não sejam listas', async () => {
    const repositorio = repositorioFake()
    const service = new HistoricoService(repositorio)

    await expect(service.registrarEventos('evento')).rejects.toThrow('Eventos devem ser uma lista')
    expect(repositorio.criar).not.toHaveBeenCalled()

    expect(await service.registrarEventos([EVENTO, { ...EVENTO, entidadeId: 13 }], CONEXAO))
      .toEqual([
        expect.objectContaining({ id: 1, entidadeId: 12 }),
        expect.objectContaining({ id: 1, entidadeId: 13 }),
      ])
    expect(repositorio.criar).toHaveBeenCalledTimes(2)
    expect(repositorio.criar).toHaveBeenNthCalledWith(1, EVENTO, CONEXAO)

    await expect(service.registrarEventos([EVENTO, null])).rejects.toBeInstanceOf(ValidationError)
    expect(repositorio.criar).toHaveBeenCalledTimes(3)
  })

  it('lista e conta com filtros válidos, herdando filtros dos atalhos', async () => {
    const repositorio = repositorioFake()
    const service = new HistoricoService(repositorio)

    expect(await service.listar({ entidadeTipo: 'oferta', limit: 2 }, CONEXAO)).toEqual([{ id: 1 }])
    expect(repositorio.listar).toHaveBeenCalledWith({ entidadeTipo: 'oferta', limit: 2 }, CONEXAO)

    await service.listarPorEntidade('reserva', 9, { entidadeTipo: 'oferta', limit: 3 }, CONEXAO)
    expect(repositorio.listar).toHaveBeenLastCalledWith({
      entidadeTipo: 'reserva',
      entidadeId: 9,
      limit: 3,
    }, CONEXAO)

    await service.listarPorAtor(7, { atorUsuarioId: 1 }, CONEXAO)
    expect(repositorio.listar).toHaveBeenLastCalledWith({ atorUsuarioId: 7 }, CONEXAO)

    expect(await service.contar({ natureza: 'NO_SHOW_PASSAGEIRO' }, CONEXAO)).toBe(4)
    expect(repositorio.contar).toHaveBeenCalledWith({ natureza: 'NO_SHOW_PASSAGEIRO' }, CONEXAO)

    await expect(service.listar(null)).rejects.toBeInstanceOf(ValidationError)
    await expect(service.listar([])).rejects.toBeInstanceOf(ValidationError)
    await expect(service.contar({ entidadeId: 0 })).rejects.toBeInstanceOf(ValidationError)

    repositorio.listar.mockRejectedValueOnce(new TypeError('filtro inválido'))
    await expect(service.listar({})).rejects.toBeInstanceOf(ValidationError)
    repositorio.contar.mockRejectedValueOnce(new ApiError(500, 'erro'))
    await expect(service.contar({})).rejects.toBeInstanceOf(ApiError)
  })
})

describe('HistoricoService - eventos de domínio (RF-027)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registra criação e edição de oferta com aliases e alterações opcionais', async () => {
    const repositorio = repositorioFake()
    const service = new HistoricoService(repositorio)

    await service.registrarOfertaCriada({
      oferta_id: 12,
      ator_usuario_id: 3,
      detalhes: { origem: 'A', senha: 'segredo' },
    }, CONEXAO)
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.OFERTA_CRIADA,
      entidadeTipo: 'oferta',
      entidadeId: 12,
      atorUsuarioId: 3,
      natureza: NATUREZAS.CRIACAO_OFERTA,
      detalhes: { oferta_id: 12, origem: 'A', senha: 'segredo' },
    })
    expect(repositorio.criar).toHaveBeenCalledWith(expect.anything(), CONEXAO)

    await service.registrarEdicaoOferta({ ofertaId: 12, detalhes: null })
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.OFERTA_EDITADA,
      entidadeTipo: 'oferta',
      entidadeId: 12,
      atorUsuarioId: undefined,
      natureza: NATUREZAS.EDICAO_OFERTA,
      detalhes: { oferta_id: 12, alteracoes: {} },
    })

    await service.registrarEdicaoOferta({ ofertaId: 12, alteracoes: { valor: 20 }, detalhes: { ip: '1.2.3.4' } })
    expect(ultimoEvento(repositorio).detalhes).toEqual({
      oferta_id: 12,
      alteracoes: { valor: 20 },
      ip: '1.2.3.4',
    })

    await expect(service.registrarOfertaCriada({ ofertaId: 0 })).rejects.toThrow('oferta_id deve ser um inteiro positivo')
    await expect(service.registrarEdicaoOferta(null)).rejects.toBeInstanceOf(ValidationError)
  })

  it('registra criação de reserva usando o passageiro como ator padrão', async () => {
    const repositorio = repositorioFake()
    const service = new HistoricoService(repositorio)

    await service.registrarReservaCriada({
      reserva_id: 4,
      oferta_id: 12,
      passageiro_id: 8,
    }, CONEXAO)

    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.RESERVA_CRIADA,
      entidadeTipo: 'reserva',
      entidadeId: 4,
      atorUsuarioId: 8,
      natureza: NATUREZAS.RESERVA_CONFIRMADA,
      detalhes: { reserva_id: 4, oferta_id: 12, passageiro_id: 8 },
    })

    await service.registrarReservaCriada({
      reservaId: 4,
      ofertaId: 12,
      passageiroId: 8,
      ator_usuario_id: 3,
      detalhes: { origem: 'A' },
    })
    expect(ultimoEvento(repositorio).atorUsuarioId).toBe(3)
    expect(ultimoEvento(repositorio).detalhes.origem).toBe('A')

    await expect(service.registrarReservaCriada({ reservaId: 4, ofertaId: 12 }))
      .rejects.toThrow('passageiro_id deve ser um inteiro positivo')
  })

  it('registra cancelamentos com natureza padrão, explícita e por exclusão de conta', async () => {
    const repositorio = repositorioFake()
    const service = new HistoricoService(repositorio)

    await service.registrarCancelamentoOferta({ oferta_id: 12 })
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.OFERTA_CANCELADA,
      entidadeTipo: 'oferta',
      entidadeId: 12,
      atorUsuarioId: undefined,
      natureza: NATUREZAS.CANCELAMENTO_COMUM,
      detalhes: { oferta_id: 12 },
    })

    await service.registrarCancelamentoOferta({
      ofertaId: 12,
      natureza: NATUREZAS.CANCELAMENTO_COMUM,
      detalhes: { motivo: 'chuvoso' },
    })
    expect(ultimoEvento(repositorio).natureza).toBe(NATUREZAS.CANCELAMENTO_COMUM)
    expect(ultimoEvento(repositorio).detalhes).toEqual({ oferta_id: 12, motivo: 'chuvoso' })

    await service.registrarCancelamentoReserva({ reservaId: 4, detalhes: null })
    expect(ultimoEvento(repositorio).detalhes).toEqual({ reserva_id: 4 })
    expect(ultimoEvento(repositorio).natureza).toBe(NATUREZAS.CANCELAMENTO_COMUM)

    await service.registrarCancelamentoPorExclusaoConta({
      entidade_tipo: 'reserva',
      entidade_id: 4,
      detalhes: { gera_penalidade: true },
    }, CONEXAO)
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.RESERVA_CANCELADA,
      entidadeTipo: 'reserva',
      entidadeId: 4,
      atorUsuarioId: undefined,
      natureza: NATUREZAS.CANCELAMENTO_EXCLUSAO_CONTA,
      detalhes: {
        entidade_id: 4,
        natureza_cancelamento: 'exclusao_conta',
        gera_penalidade: true,
      },
    })

    await service.registrarCancelamentoPorExclusaoConta({ entidadeTipo: 'oferta', entidadeId: 12 })
    expect(ultimoEvento(repositorio).tipoEvento).toBe(TIPOS_EVENTO.OFERTA_CANCELADA)

    await expect(service.registrarCancelamentoPorExclusaoConta({ entidadeTipo: ' ', entidadeId: 1 }))
      .rejects.toThrow('entidade_tipo é obrigatório')
    await expect(service.registrarCancelamentoPorExclusaoConta({ entidadeTipo: 'oferta' }))
      .rejects.toThrow('entidade_id deve ser um inteiro positivo')
  })

  it('registra no-show, ausência, início e conclusão com pontos padrão e informados', async () => {
    const repositorio = repositorioFake()
    const service = new HistoricoService(repositorio)

    await service.registrarNoShowPassageiro({
      reserva_id: 4,
      oferta_id: 12,
      passageiro_id: 8,
    }, CONEXAO)
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.NO_SHOW_PASSAGEIRO,
      entidadeTipo: 'reserva',
      entidadeId: 4,
      atorUsuarioId: undefined,
      natureza: NATUREZAS.NO_SHOW_PASSAGEIRO,
      detalhes: {
        reserva_id: 4,
        oferta_id: 12,
        passageiro_id: 8,
        vaga_liberada: false,
        pontos: 2,
      },
    })

    await service.registrarNoShowPassageiro({
      reservaId: 4,
      ofertaId: 12,
      passageiroId: 8,
      atorUsuarioId: 3,
      pontos: 5,
      detalhes: { origem: 'A' },
    })
    expect(ultimoEvento(repositorio).detalhes.pontos).toBe(5)
    expect(ultimoEvento(repositorio).atorUsuarioId).toBe(3)

    await service.registrarAusenciaMotorista({ oferta_id: 12, motorista_id: 3 })
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.AUSENCIA_MOTORISTA,
      entidadeTipo: 'oferta',
      entidadeId: 12,
      atorUsuarioId: undefined,
      natureza: NATUREZAS.AUSENCIA_MOTORISTA,
      detalhes: {
        oferta_id: 12,
        motorista_id: 3,
        viagem_cancelada: true,
        pontos: 2,
      },
    })

    await service.registrarAusenciaMotorista({ ofertaId: 12, motoristaId: 3, pontos: 4 })
    expect(ultimoEvento(repositorio).detalhes.pontos).toBe(4)

    await service.registrarInicioViagem({ ofertaId: 12, detalhes: null })
    expect(ultimoEvento(repositorio).tipoEvento).toBe(TIPOS_EVENTO.VIAGEM_INICIADA)
    expect(ultimoEvento(repositorio).natureza).toBe(NATUREZAS.INICIO_VIAGEM)
    expect(ultimoEvento(repositorio).detalhes).toEqual({ oferta_id: 12 })

    await service.registrarConclusaoViagem({ oferta_id: 12 })
    expect(ultimoEvento(repositorio).tipoEvento).toBe(TIPOS_EVENTO.VIAGEM_CONCLUIDA)
    expect(ultimoEvento(repositorio).natureza).toBe(NATUREZAS.CONCLUSAO_VIAGEM)

    await expect(service.registrarAusenciaMotorista({ ofertaId: 12 }))
      .rejects.toThrow('motorista_id deve ser um inteiro positivo')
    await expect(service.registrarInicioViagem(null)).rejects.toBeInstanceOf(ValidationError)
  })

  it('registra penalidade, exclusão de conta e avaliação', async () => {
    const repositorio = repositorioFake()
    const service = new HistoricoService(repositorio)

    await service.registrarPenalidade({
      penalidade_id: 5,
      usuario_id: 8,
      pontos: 2,
      motivo: 'no-show',
      referencia: 'reserva:4',
    }, CONEXAO)
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.PENALIDADE_REGISTRADA,
      entidadeTipo: 'penalidade',
      entidadeId: 5,
      atorUsuarioId: undefined,
      natureza: NATUREZAS.PENALIDADE_REGISTRADA,
      detalhes: {
        penalidade_id: 5,
        usuario_id: 8,
        pontos: 2,
        motivo: 'no-show',
        referencia: 'reserva:4',
        bloqueio_automatico: false,
      },
    })

    await service.registrarPenalidade({
      penalidadeId: 5,
      usuarioId: 8,
      atorUsuarioId: 3,
      detalhes: { origem: 'A' },
    })
    expect(ultimoEvento(repositorio).atorUsuarioId).toBe(3)
    expect(ultimoEvento(repositorio).detalhes.origem).toBe('A')

    await service.registrarExclusaoConta({ usuario_id: 8 }, CONEXAO)
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.CONTA_EXCLUIDA,
      entidadeTipo: 'usuario',
      entidadeId: 8,
      atorUsuarioId: 8,
      natureza: NATUREZAS.CONTA_EXCLUIDA,
      detalhes: {
        usuario_id: 8,
        conta_ativa: false,
        dados_anonimizados: true,
        historico_preservado: true,
      },
    })

    await service.registrarExclusaoConta({ usuarioId: 8, atorUsuarioId: 3 })
    expect(ultimoEvento(repositorio).atorUsuarioId).toBe(3)

    await service.registrarAvaliacao({ avaliacao_id: 77 }, CONEXAO)
    expect(ultimoEvento(repositorio)).toEqual({
      tipoEvento: TIPOS_EVENTO.AVALIACAO_REGISTRADA,
      entidadeTipo: 'avaliacao',
      entidadeId: 77,
      atorUsuarioId: undefined,
      natureza: NATUREZAS.AVALIACAO_REGISTRADA,
      detalhes: { avaliacao_id: 77 },
    })

    await service.registrarAvaliacao({ avaliacaoId: 77, detalhes: { nota: 5 } })
    expect(ultimoEvento(repositorio).detalhes).toEqual({ avaliacao_id: 77, nota: 5 })

    await expect(service.registrarPenalidade({ penalidadeId: 5 })).rejects.toThrow('usuario_id deve ser um inteiro positivo')
    await expect(service.registrarExclusaoConta({})).rejects.toThrow('usuario_id deve ser um inteiro positivo')
    await expect(service.registrarAvaliacao(null)).rejects.toBeInstanceOf(ValidationError)
  })
})
