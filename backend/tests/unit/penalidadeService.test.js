import { describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  ConflictError,
  ValidationError,
} from '../../src/middlewares/errorHandler.js'
import {
  PenalidadeService,
  geraPenalidadeCancelamento,
  normalizarNaturezaCancelamento,
} from '../../src/services/penalidadeService.js'

const CONEXAO = { nome: 'conexao-fake' }
const PENALIDADE = {
  id: 10,
  usuario_id: 3,
  pontos: 2,
  motivo: 'Falta sem aviso',
  referencia: 'reserva:4',
}

function penalidadesFake(impl = {}) {
  return { criar: vi.fn(impl.criar ?? (() => PENALIDADE)) }
}

function historicoFake() {
  return { registrarPenalidade: vi.fn() }
}

describe('Natureza de cancelamento e penalidade (RF-030, RN-015)', () => {
  it('[RN-015] normaliza natureza com acento, caixa, espaço e hífen', () => {
    expect(normalizarNaturezaCancelamento('Cancelamento por Exclusão de Conta'))
      .toBe('cancelamento_por_exclusao_de_conta')
    expect(normalizarNaturezaCancelamento(' exclusao-conta ')).toBe('exclusao_conta')
    expect(normalizarNaturezaCancelamento(null)).toBe('')
  })

  it('[RN-015] só gera penalidade quando a natureza não é exclusão de conta', () => {
    for (const natureza of [
      'exclusao_conta',
      'Exclusão de Conta',
      '  exclusao_conta  ',
      'cancelamento_exclusao_conta',
      'CANCELAMENTO POR EXCLUSÃO DE CONTA',
      'conta_excluida',
    ]) {
      expect(geraPenalidadeCancelamento(natureza)).toBe(false)
    }
    expect(geraPenalidadeCancelamento('cancelamento_comum')).toBe(true)
    expect(geraPenalidadeCancelamento(undefined)).toBe(true)
  })
})

describe('PenalidadeService (RF-030, RN-015)', () => {
  it('[RF-030] registra penalidade e o evento no histórico', async () => {
    const penalidades = penalidadesFake()
    const historico = historicoFake()
    const service = new PenalidadeService({ penalidades, historico })

    expect(await service.registrar({
      tipoEvento: 'no show passageiro',
      usuarioId: '3',
      reserva_id: '4',
      atorUsuarioId: 9,
    }, CONEXAO)).toBe(PENALIDADE)

    expect(penalidades.criar).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 3,
      tipo_evento: 'NO_SHOW_PASSAGEIRO',
      referencia: 'reserva:4',
    }), CONEXAO)
    expect(historico.registrarPenalidade).toHaveBeenCalledWith({
      penalidade_id: 10,
      usuario_id: 3,
      pontos: 2,
      motivo: 'Falta sem aviso',
      referencia: 'reserva:4',
      ator_usuario_id: 9,
    }, CONEXAO)
  })

  it('[RF-030] usa o usuário penalizado como ator padrão e expõe alias de registro', async () => {
    const penalidades = penalidadesFake()
    const historico = historicoFake()
    const service = new PenalidadeService({ penalidades, historico })

    await service.registrarPenalidade({
      tipo_evento: 'OFERTA_CANCELADA',
      usuario: { id: 3 },
      ofertaId: 7,
    })

    expect(penalidades.criar.mock.calls[0][1]).toBeUndefined()
    expect(historico.registrarPenalidade.mock.calls[0][0].ator_usuario_id).toBe(3)
    expect(penalidades.criar.mock.calls[0][0].referencia).toBe('oferta:7')
  })

  it('[RN-015] rejeita dados de penalidade inválidos antes de persistir', async () => {
    const penalidades = penalidadesFake()
    const historico = historicoFake()
    const service = new PenalidadeService({ penalidades, historico })
    const casos = [
      [null, 'Dados de penalidade inválidos'],
      [[], 'Dados de penalidade inválidos'],
      [{ usuario_id: 1, oferta_id: 2 }, 'tipo_evento é obrigatório'],
      [{ tipo_evento: 'NO_SHOW_PASSAGEIRO', oferta_id: 2 }, 'usuario_id deve ser um inteiro positivo'],
      [{ tipo_evento: 'NO_SHOW_PASSAGEIRO', usuario_id: 3 }, 'referência é obrigatória'],
      [{ tipo_evento: 'NO_SHOW_PASSAGEIRO', usuario_id: 3, referencia: 'veiculo:1' }, 'referencia deve usar viagem:, oferta: ou reserva:'],
    ]

    for (const [dados, mensagem] of casos) {
      await expect(service.registrar(dados)).rejects.toBeInstanceOf(ValidationError)
      await expect(service.registrar(dados)).rejects.toThrow(mensagem)
    }
    expect(penalidades.criar).not.toHaveBeenCalled()
    expect(historico.registrarPenalidade).not.toHaveBeenCalled()
  })

  it('[RN-015] traduz erros do repositório e preserva erros da API', async () => {
    const historico = historicoFake()
    const service = new PenalidadeService({
      penalidades: penalidadesFake({ criar: () => Promise.reject(new TypeError('pontos inválidos')) }),
      historico,
    })
    await expect(service.registrar({ tipo_evento: 'NO_SHOW_PASSAGEIRO', usuario_id: 3, oferta_id: 1 }))
      .rejects.toBeInstanceOf(ValidationError)

    const erroApi = new ConflictError('Já existe penalidade')
    const serviceApi = new PenalidadeService({
      penalidades: penalidadesFake({ criar: () => Promise.reject(erroApi) }),
      historico,
    })
    await expect(serviceApi.registrar({ tipo_evento: 'NO_SHOW_PASSAGEIRO', usuario_id: 3, oferta_id: 1 }))
      .rejects.toBe(erroApi)
    expect(historico.registrarPenalidade).not.toHaveBeenCalled()
  })

  it('[RN-015] registra as quatro penalidades com seus tipos e motivos padrão', async () => {
    const casos = [
      ['registrarCancelamentoPassageiro', 'CANCELAMENTO_PASSAGEIRO_MENOS_24H', 'Cancelamento do passageiro com menos de 24 horas'],
      ['registrarCancelamentoMotorista', 'CANCELAMENTO_MOTORISTA_COM_RESERVAS', 'Cancelamento do motorista com reservas confirmadas'],
      ['registrarNoShowPassageiro', 'NO_SHOW_PASSAGEIRO', 'No-show do passageiro'],
      ['registrarAusenciaMotorista', 'AUSENCIA_MOTORISTA', 'Ausência do motorista'],
    ]
    const dados = { usuario_id: 3, viagem_id: 5 }

    for (const [metodo, tipo, motivo] of casos) {
      const penalidades = penalidadesFake()
      const historico = historicoFake()
      const service = new PenalidadeService({ penalidades, historico })

      await service[metodo](dados, CONEXAO)

      expect(penalidades.criar).toHaveBeenCalledWith(expect.objectContaining({
        tipo_evento: tipo,
        motivo,
        referencia: 'viagem:5',
      }), CONEXAO)
      expect(historico.registrarPenalidade).toHaveBeenCalledTimes(1)
    }
  })

  it('[RN-015] respeita motivo informado e não penaliza exclusão de conta', async () => {
    const penalidades = penalidadesFake()
    const historico = historicoFake()
    const service = new PenalidadeService({ penalidades, historico })

    await service.registrarNoShowPassageiro({
      usuario_id: 3,
      reserva_id: 4,
      motivo: 'Ausência confirmada',
    })
    expect(penalidades.criar.mock.calls[0][0].motivo).toBe('Ausência confirmada')

    for (const natureza of ['exclusao_de_conta', 'Cancelamento por Exclusão de Conta']) {
      expect(await service.registrarCancelamentoPassageiro({
        usuario_id: 3,
        reserva_id: 4,
        natureza,
      })).toBeNull()
      expect(await service.registrarCancelamentoMotorista({
        usuario_id: 3,
        reserva_id: 4,
        natureza,
      })).toBeNull()
      expect(await service.registrarNoShowPassageiro({
        usuario_id: 3,
        reserva_id: 4,
        natureza,
      })).toBeNull()
      expect(await service.registrarAusenciaMotorista({
        usuario_id: 3,
        reserva_id: 4,
        natureza,
      })).toBeNull()
    }
    expect(penalidades.criar).toHaveBeenCalledTimes(1)
    expect(historico.registrarPenalidade).toHaveBeenCalledTimes(1)
  })
})
