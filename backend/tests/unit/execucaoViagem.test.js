import { describe, expect, it } from 'vitest'
import { ConflictError } from '../../src/middlewares/errorHandler.js'
import { ESTADOS, SITUACOES } from '../../src/repositories/ofertaRepository.js'
import {
  concluirViagem,
  iniciarViagem,
  podeIniciar,
  situacaoViagem,
} from '../../src/services/execucaoViagemService.js'

const HORA_SAIDA = new Date('2026-11-22T12:00:00.000Z')
const HORA_COM_DESLOCAMENTO = (horas) => new Date(HORA_SAIDA.getTime() + horas * 60 * 60 * 1000)

function oferta(extras = {}) {
  return {
    id: 7,
    estado: ESTADOS.ABERTA,
    data_hora_saida: HORA_SAIDA.toISOString(),
    iniciada_em: null,
    concluida_em: null,
    ...extras,
  }
}

describe('Execução da viagem (RF-017, RF-022, RNF-004, RN-009, CA-008)', () => {
  it('[RF-017] transita de ABERTA para EM_ANDAMENTO e depois para CONCLUIDA', () => {
    const original = oferta()
    const iniciada = iniciarViagem(original, HORA_COM_DESLOCAMENTO(0))

    expect(iniciada).toMatchObject({
      id: 7,
      estado: ESTADOS.EM_ANDAMENTO,
      situacao: SITUACOES.EM_ANDAMENTO,
    })
    expect(new Date(iniciada.iniciada_em).getTime()).toBe(HORA_SAIDA.getTime())
    expect(original).toMatchObject({ estado: ESTADOS.ABERTA, iniciada_em: null })

    const concluida = concluirViagem(iniciada, HORA_COM_DESLOCAMENTO(1))

    expect(concluida).toMatchObject({
      id: 7,
      estado: ESTADOS.CONCLUIDA,
      situacao: SITUACOES.CONCLUIDA,
    })
    expect(new Date(concluida.concluida_em).getTime()).toBe(HORA_COM_DESLOCAMENTO(1).getTime())
    expect(iniciada).toMatchObject({ estado: ESTADOS.EM_ANDAMENTO, concluida_em: null })
  })

  it('[RF-017/RN-009] bloqueia início antes do horário previsto', () => {
    const antesDoHorario = HORA_COM_DESLOCAMENTO(-1)

    expect(podeIniciar(oferta(), antesDoHorario)).toBe(false)
    expect(() => iniciarViagem(oferta(), antesDoHorario)).toThrow(ConflictError)
  })

  it('[RF-017] permite início no horário previsto e após ele', () => {
    expect(podeIniciar(oferta(), HORA_COM_DESLOCAMENTO(0))).toBe(true)
    expect(podeIniciar(oferta(), HORA_COM_DESLOCAMENTO(1))).toBe(true)
    expect(iniciarViagem(oferta(), HORA_COM_DESLOCAMENTO(1)).estado).toBe(ESTADOS.EM_ANDAMENTO)
  })

  it('[RF-017] conclui somente uma viagem em andamento', () => {
    expect(() => concluirViagem(oferta(), HORA_COM_DESLOCAMENTO(1))).toThrow(ConflictError)
  })

  it('[RN-009/RF-022] deriva AGUARDANDO_INICIO ao atingir o horário sem início', () => {
    expect(situacaoViagem(oferta(), HORA_COM_DESLOCAMENTO(-1 / 60))).toBe(SITUACOES.ABERTA)
    expect(situacaoViagem(oferta(), HORA_COM_DESLOCAMENTO(0))).toBe(SITUACOES.AGUARDANDO_INICIO)
    expect(situacaoViagem(oferta(), HORA_COM_DESLOCAMENTO(1))).toBe(SITUACOES.AGUARDANDO_INICIO)
  })

  it('[RN-009] preserva a situação dos estados já persistidos', () => {
    const depoisDoHorario = HORA_COM_DESLOCAMENTO(2)

    expect(situacaoViagem(oferta({ estado: ESTADOS.EM_ANDAMENTO }), depoisDoHorario))
      .toBe(SITUACOES.EM_ANDAMENTO)
    expect(situacaoViagem(oferta({ estado: ESTADOS.CONCLUIDA }), depoisDoHorario))
      .toBe(SITUACOES.CONCLUIDA)
    expect(situacaoViagem(oferta({ estado: ESTADOS.CANCELADA }), depoisDoHorario))
      .toBe(SITUACOES.CANCELADA)
  })
})
