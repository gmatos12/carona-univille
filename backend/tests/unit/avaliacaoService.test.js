import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../src/middlewares/errorHandler.js'
import { closeConnection } from '../../src/db/connection.js'
import { AvaliacaoService } from '../../src/services/avaliacaoService.js'

const CONEXAO = {
  nome: 'conexao-fake',
  transaction: vi.fn((callback) => callback(CONEXAO)),
}
const OFERTA_CONCLUIDA = { id: 12, estado: 'CONCLUIDA' }
const DADOS = { avaliado_id: 8, nota: 5 }

function avaliacoesFake(impl = {}) {
  return {
    existeNoShowNaOferta: vi.fn(impl.existeNoShowNaOferta ?? (() => false)),
    buscarPorOfertaEAvaliador: vi.fn(impl.buscarPorOfertaEAvaliador ?? (() => null)),
    criar: vi.fn(impl.criar ?? (async (dados) => ({ id: 77, ...dados }))),
  }
}

function ofertasFake(impl = {}) {
  return {
    buscarPorId: vi.fn(impl.buscarPorId ?? (() => OFERTA_CONCLUIDA)),
    eParticipante: vi.fn(impl.eParticipante ?? (() => true)),
  }
}

function historicoFake() {
  return { registrarAvaliacao: vi.fn() }
}

function montarServico({ avaliacoes = avaliacoesFake(), ofertas = ofertasFake(), historico = historicoFake() } = {}) {
  return {
    service: new AvaliacaoService({ avaliacoes, ofertas, historico }),
    avaliacoes,
    ofertas,
    historico,
  }
}

describe('AvaliacaoService (RF-028)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await closeConnection()
  })

  it('rejeita identificadores, avaliado e nota inválidos antes de abrir transação', async () => {
    const { service } = montarServico()
    const casos = [
      [{ ofertaId: 0, avaliadorId: 3, dados: DADOS }, 'oferta_id inválido'],
      [{ ofertaId: 12, avaliadorId: 'abc', dados: DADOS }, 'avaliador_id inválido'],
      [{ ofertaId: 12, avaliadorId: 3, dados: { nota: 5 } }, 'avaliado_id inválido'],
      [{ ofertaId: 12, avaliadorId: 3, dados: { avaliado_id: 8, nota: 0 } }, 'nota deve ser entre 1 e 5'],
      [{ ofertaId: 12, avaliadorId: 3, dados: { avaliado_id: 8, nota: 6 } }, 'nota deve ser entre 1 e 5'],
      [{ ofertaId: 12, avaliadorId: 3, dados: { avaliado_id: 8, nota: 2.5 } }, 'nota deve ser entre 1 e 5'],
    ]

    for (const [args, mensagem] of casos) {
      await expect(service.avaliar(args.ofertaId, args.avaliadorId, args.dados))
        .rejects.toBeInstanceOf(ValidationError)
      await expect(service.avaliar(args.ofertaId, args.avaliadorId, args.dados))
        .rejects.toThrow(mensagem)
    }
  })

  it('registra avaliação com alias camelCase, registra no histórico e usa a transação informada', async () => {
    const { service, avaliacoes, ofertas, historico } = montarServico()

    const resultado = await service.avaliar('12', '3', { avaliadoId: '8', nota: '4' }, CONEXAO)

    expect(resultado).toEqual({ id: 77, oferta_id: 12, avaliador_id: 3, avaliado_id: 8, nota: 4 })
    expect(ofertas.buscarPorId).toHaveBeenCalledWith(12, CONEXAO)
    expect(avaliacoes.criar).toHaveBeenCalledWith({
      oferta_id: 12, avaliador_id: 3, avaliado_id: 8, nota: 4,
    }, CONEXAO)
    expect(historico.registrarAvaliacao).toHaveBeenCalledWith({
      avaliacao_id: 77,
      ator_usuario_id: 3,
      detalhes: { oferta_id: 12, avaliado_id: 8, nota: 4 },
    }, CONEXAO)
  })

  it('abre transação implícita e admite histórico ausente', async () => {
    const avaliacoes = avaliacoesFake()
    const ofertas = ofertasFake()
    const service = new AvaliacaoService({ avaliacoes, ofertas, historico: null })

    await expect(service.avaliar(12, 3, DADOS)).resolves.toEqual(expect.objectContaining({ id: 77 }))

    expect(avaliacoes.criar).toHaveBeenCalledWith(expect.anything(), expect.anything())

    const semMetodo = new AvaliacaoService({ avaliacoes, ofertas, historico: {} })
    await expect(semMetodo.avaliar(12, 3, DADOS)).resolves.toEqual(expect.objectContaining({ id: 77 }))
  })

  it('rejeita oferta inexistente e oferta que não está concluída', async () => {
    const semOferta = montarServico({ ofertas: ofertasFake({ buscarPorId: () => null }) })
    await expect(semOferta.service.avaliar(12, 3, DADOS)).rejects.toBeInstanceOf(NotFoundError)
    await expect(semOferta.service.avaliar(12, 3, DADOS)).rejects.toThrow('Oferta não encontrada')
    expect(semOferta.avaliacoes.criar).not.toHaveBeenCalled()

    const aberta = montarServico({ ofertas: ofertasFake({ buscarPorId: () => ({ estado: 'ABERTA' }) }) })
    await expect(aberta.service.avaliar(12, 3, DADOS)).rejects.toBeInstanceOf(ConflictError)
    await expect(aberta.service.avaliar(12, 3, DADOS)).rejects
      .toThrow('Avaliação permitida apenas para viagem concluída')
  })

  it('bloqueia viagens com no-show e participantes inválidos', async () => {
    const comNoShow = montarServico({ avaliacoes: avaliacoesFake({ existeNoShowNaOferta: () => true }) })
    await expect(comNoShow.service.avaliar(12, 3, DADOS)).rejects.toThrow(
      'Viagens com registro de no-show não permitem avaliações',
    )
    expect(comNoShow.ofertas.eParticipante).not.toHaveBeenCalled()

    const avaliadorFora = montarServico({ ofertas: ofertasFake({ eParticipante: (id, usuario) => usuario === 8 }) })
    await expect(avaliadorFora.service.avaliar(12, 3, DADOS)).rejects.toBeInstanceOf(ForbiddenError)

    const avaliadoFora = montarServico({ ofertas: ofertasFake({ eParticipante: (id, usuario) => usuario === 3 }) })
    await expect(avaliadoFora.service.avaliar(12, 3, DADOS)).rejects.toThrow(
      'Avaliador e avaliado devem ser participantes distintos da viagem',
    )

    const mesmoUsuario = montarServico({
      ofertas: ofertasFake({ eParticipante: (id, usuario) => usuario === 3 || usuario === 8 }),
    })
    await expect(mesmoUsuario.service.avaliar(12, 3, { avaliado_id: 3, nota: 4 }))
      .rejects.toBeInstanceOf(ForbiddenError)
  })

  it('impede avaliação duplicada e traduz erros de digitação e do repositório', async () => {
    const duplicada = montarServico({
      avaliacoes: avaliacoesFake({ buscarPorOfertaEAvaliador: () => ({ id: 55 }) }),
    })
    await expect(duplicada.service.avaliar(12, 3, DADOS)).rejects.toBeInstanceOf(ConflictError)
    await expect(duplicada.service.avaliar(12, 3, DADOS)).rejects.toThrow('Participante já avaliou esta viagem')
    expect(duplicada.avaliacoes.criar).not.toHaveBeenCalled()

    const erroDigitacao = montarServico({
      avaliacoes: avaliacoesFake({ criar: () => Promise.reject(new TypeError('nota inválida')) }),
    })
    await expect(erroDigitacao.service.avaliar(12, 3, DADOS)).rejects.toBeInstanceOf(ValidationError)
    await expect(erroDigitacao.service.avaliar(12, 3, DADOS)).rejects.toThrow('nota inválida')

    const erroApi = new ConflictError('conflito na gravação')
    const erroApiServico = montarServico({
      ofertas: ofertasFake({ buscarPorId: () => Promise.reject(erroApi) }),
    })
    await expect(erroApiServico.service.avaliar(12, 3, DADOS)).rejects.toBe(erroApi)

    const erroInesperado = new Error('falha não tratada')
    const inesperado = montarServico({
      avaliacoes: avaliacoesFake({ criar: () => Promise.reject(erroInesperado) }),
    })
    await expect(inesperado.service.avaliar(12, 3, DADOS)).rejects.toBe(erroInesperado)
  })

  it('calcula média com conexão explícita, arredondamento e ausência de avaliações', async () => {
    const conexaoComMedia = { get: vi.fn().mockResolvedValue({ media: '4.26', total: '3' }) }
    const service = montarServico().service

    expect(await service.mediaAvaliacoes('8', conexaoComMedia)).toBe(4.3)
    expect(conexaoComMedia.get).toHaveBeenCalledWith(
      'SELECT AVG(nota) AS media, COUNT(*) AS total FROM avaliacoes WHERE avaliado_id = ?',
      [8],
    )

    const semRegistros = { get: vi.fn().mockResolvedValue(undefined) }
    expect(await service.mediaAvaliacoes(8, semRegistros)).toBe('Sem avaliações')
    const totalZero = { get: vi.fn().mockResolvedValue({ media: null, total: 0 }) }
    expect(await service.mediaAvaliacoes(8, totalZero)).toBe('Sem avaliações')

    const comUmaAvaliacao = { get: vi.fn().mockResolvedValue({ media: '3', total: 1 }) }
    expect(await service.mediaAvaliacoes(8, comUmaAvaliacao)).toBe(3)
    expect(comUmaAvaliacao.get).toHaveBeenCalledWith(expect.any(String), [8])

    await expect(service.mediaAvaliacoes(-1)).rejects.toBeInstanceOf(ValidationError)
  })
})
