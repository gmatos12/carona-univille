import { describe, expect, it } from 'vitest'
import { ConflictError } from '../../src/middlewares/errorHandler.js'
import {
  LIMIAR_PENALIDADE_HORAS,
  geraPenalidadeCancelamento,
  pontosCancelamentoMotorista,
  pontosCancelamentoPassageiro,
  podeCancelarPassageiro,
} from '../../src/services/cancelamentoService.js'

const HORA_SAIDA = new Date('2026-11-22T12:00:00.000Z')
const HORA_POR_HORAS = (horas) => new Date(HORA_SAIDA.getTime() - horas * 60 * 60 * 1000)

describe('Regras de cancelamento e pontuação (RF-015, RF-016, RF-025, RN-005, CA-005)', () => {
  it('[RF-015/RN-005] cancelamento do passageiro com 24h ou mais não gera pontos', () => {
    expect(LIMIAR_PENALIDADE_HORAS).toBe(24)
    expect(podeCancelarPassageiro(HORA_SAIDA, HORA_POR_HORAS(24))).toBe(true)
    expect(pontosCancelamentoPassageiro(HORA_SAIDA, HORA_POR_HORAS(24))).toBe(0)
    expect(pontosCancelamentoPassageiro(HORA_SAIDA, HORA_POR_HORAS(48))).toBe(0)
  })

  it('[RF-015/RN-005] cancelamento do passageiro com menos de 24h gera 1 ponto', () => {
    expect(podeCancelarPassageiro(HORA_SAIDA, HORA_POR_HORAS(23.999))).toBe(true)
    expect(pontosCancelamentoPassageiro(HORA_SAIDA, HORA_POR_HORAS(23.999))).toBe(1)
    expect(pontosCancelamentoPassageiro(HORA_SAIDA, HORA_POR_HORAS(1))).toBe(1)
  })

  it('[RF-015/CA-005] cancelamento do passageiro a partir do horário previsto é bloqueado', () => {
    expect(podeCancelarPassageiro(HORA_SAIDA, HORA_SAIDA)).toBe(false)
    expect(() => pontosCancelamentoPassageiro(HORA_SAIDA, HORA_SAIDA)).toThrow(ConflictError)
    expect(() => pontosCancelamentoPassageiro(HORA_SAIDA, HORA_POR_HORAS(-1))).toThrow(ConflictError)
  })

  it('[RF-016/RN-005] motorista com reservas recebe 1 ponto e sem reservas não recebe pontos', () => {
    expect(pontosCancelamentoMotorista(0)).toBe(0)
    expect(pontosCancelamentoMotorista(1)).toBe(1)
    expect(pontosCancelamentoMotorista(4)).toBe(1)
  })

  it('[RF-025/RN-005] cancelamento por exclusão de conta não gera penalidade nem bloqueio', () => {
    expect(geraPenalidadeCancelamento('exclusao_conta')).toBe(false)
    expect(geraPenalidadeCancelamento('CANCELAMENTO_EXCLUSAO_CONTA')).toBe(false)
    expect(geraPenalidadeCancelamento('passageiro')).toBe(true)
    expect(geraPenalidadeCancelamento('comum_motorista')).toBe(true)
  })
})
