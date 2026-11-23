import { describe, expect, it } from 'vitest'
import {
  MINUTOS_JANELA,
  absoluteDifferenceInMinutes,
  buildSearchWindow,
  combineDateAndTime,
  compareByProximity,
  differenceInMinutes,
  isAfter,
  isBefore,
  isSameDay,
  isWithinWindow,
  parseDateOnly,
  parseDateTime,
  parseTimeOnly,
  requireDate,
  toISOString,
} from '../../src/utils/dateTime.js'

const DATA = '2026-11-20'
const HORARIO = '10:00'
const ALVO = combineDateAndTime(DATA, HORARIO)
const MINUTO = 60 * 1000

describe('Utilitários de data e hora (RF-010, RNF-004, RN-004)', () => {
  it('[RNF-004] parseDateOnly aceita Date e ISO, rejeita datas inexistentes', () => {
    expect(parseDateOnly(new Date(2026, 10, 20, 15, 42))).toEqual(new Date(2026, 10, 20))
    expect(parseDateOnly(' 2026-11-20 ')).toEqual(new Date(2026, 10, 20))
    expect(parseDateOnly('2026-02-30')).toBeNull()
    expect(parseDateOnly('20/11/2026')).toBeNull()
    expect(parseDateOnly(123)).toBeNull()
    expect(parseDateOnly(new Date('invalida'))).toBeNull()
  })

  it('[RNF-004] parseTimeOnly valida horas, minutos e segundos', () => {
    expect(parseTimeOnly(' 9:05:07 ')).toEqual({ hour: 9, minute: 5, second: 7 })
    expect(parseTimeOnly('23:59')).toEqual({ hour: 23, minute: 59, second: 0 })
    expect(parseTimeOnly('24:00')).toBeNull()
    expect(parseTimeOnly('12:60')).toBeNull()
    expect(parseTimeOnly('10:00:60')).toBeNull()
    expect(parseTimeOnly('1:2')).toBeNull()
    expect(parseTimeOnly(1000)).toBeNull()
  })

  it('[RNF-004] combineDateAndTime exige data e horário válidos', () => {
    expect(combineDateAndTime(DATA, '9:05')).toEqual(new Date(2026, 10, 20, 9, 5, 0))
    expect(combineDateAndTime('2026-02-30', HORARIO)).toBeNull()
    expect(combineDateAndTime(DATA, '25:00')).toBeNull()
  })

  it('[RNF-004] parseDateTime interpreta Date, dia ISO e timestamps', () => {
    const original = new Date('2026-11-20T10:00:00.000Z')
    const copia = parseDateTime(original)

    expect(copia).toEqual(original)
    expect(copia).not.toBe(original)
    expect(parseDateTime(DATA)).toEqual(new Date(2026, 10, 20))
    expect(parseDateTime(' 2026-11-20T10:00:00.000Z ')).toEqual(original)
    expect(parseDateTime('data ruim')).toBeNull()
    expect(parseDateTime(123)).toBeNull()
  })

  it('[RNF-004] requireDate e toISOString rejeitam entradas inválidas', () => {
    expect(requireDate(DATA)).toEqual(new Date(2026, 10, 20))
    expect(toISOString(ALVO)).toBe(ALVO.toISOString())
    expect(() => requireDate('invalid')).toThrow('data/hora inválida')
    expect(() => requireDate('', 'data inicial')).toThrow('data inicial inválida')
    expect(() => toISOString(undefined)).toThrow(TypeError)
  })

  it('[RN-004] calcula diferenças e compara datas', () => {
    const inicio = new Date(ALVO.getTime())
    const fim = new Date(ALVO.getTime() + 90 * MINUTO)

    expect(differenceInMinutes(inicio, fim)).toBe(90)
    expect(differenceInMinutes(fim, inicio)).toBe(-90)
    expect(absoluteDifferenceInMinutes(fim, inicio)).toBe(90)
    expect(() => differenceInMinutes('invalido', fim)).toThrow('data/hora inicial inválida')
    expect(() => differenceInMinutes(inicio, 'invalido')).toThrow('data/hora final inválida')

    expect(isBefore(inicio, fim)).toBe(true)
    expect(isAfter(inicio, fim)).toBe(false)
    expect(isSameDay(inicio, new Date(2026, 10, 20, 23, 59))).toBe(true)
    expect(isSameDay(inicio, new Date(2026, 10, 21, 0, 1))).toBe(false)
    expect(() => isBefore('invalido', fim)).toThrow(TypeError)
    expect(() => isAfter(inicio, 'invalido')).toThrow(TypeError)
    expect(() => isSameDay(inicio, 'invalido')).toThrow(TypeError)
  })

  it('[RN-004] isWithinWindow respeita limites inclusivos e janela configurada', () => {
    const dentro = new Date(ALVO.getTime() + 30 * MINUTO)
    const fora = new Date(ALVO.getTime() + 30 * MINUTO + 1)
    const dentroJanelaCurta = new Date(ALVO.getTime() + 5 * MINUTO)

    expect(MINUTOS_JANELA).toBe(30)
    expect(isWithinWindow(ALVO, ALVO)).toBe(true)
    expect(isWithinWindow(dentro, ALVO)).toBe(true)
    expect(isWithinWindow(fora, ALVO)).toBe(false)
    expect(isWithinWindow(dentroJanelaCurta, ALVO, 5)).toBe(true)
    expect(isWithinWindow(dentro, ALVO, '0')).toBe(false)
    expect(() => isWithinWindow('invalido', ALVO)).toThrow('data/hora candidata inválida')
    expect(() => isWithinWindow(ALVO, 'invalido')).toThrow('data/hora alvo inválida')
    expect(() => isWithinWindow(ALVO, ALVO, -1)).toThrow('Janela de minutos inválida')
    expect(() => isWithinWindow(ALVO, ALVO, 'abc')).toThrow('Janela de minutos inválida')
  })

  it('[RN-004] buildSearchWindow gera limites simétricos', () => {
    const janela = buildSearchWindow(DATA, HORARIO)

    expect(janela.target).toEqual(ALVO)
    expect(janela.inicio).toEqual(new Date(ALVO.getTime() - 30 * MINUTO))
    expect(janela.fim).toEqual(new Date(ALVO.getTime() + 30 * MINUTO))
    expect(janela.windowMinutes).toBe(30)
    expect(buildSearchWindow(DATA, '9:05', 15).windowMinutes).toBe(15)
    expect(() => buildSearchWindow('invalida', HORARIO)).toThrow('Data ou horário de busca inválidos')
    expect(() => buildSearchWindow(DATA, '25:00')).toThrow('Data ou horário de busca inválidos')
    expect(() => buildSearchWindow(DATA, HORARIO, -1)).toThrow('Janela de minutos inválida')
  })

  it('[RN-004] compareByProximity desempata por vagas e aceita extratores', () => {
    const maisProxima = new Date(ALVO.getTime() - 10 * MINUTO)
    const maisDistante = new Date(ALVO.getTime() + 20 * MINUTO)

    expect(compareByProximity(maisProxima, maisDistante, ALVO)).toBeLessThan(0)
    expect(compareByProximity(maisDistante, maisProxima, ALVO)).toBeGreaterThan(0)

    const esquerda = { horario: new Date(ALVO.getTime() + 10 * MINUTO), vagas_disponiveis: 1 }
    const direita = { horario: new Date(ALVO.getTime() - 10 * MINUTO), vagas_disponiveis: 5 }
    expect(compareByProximity(esquerda, direita, ALVO, {
      getValue: (item) => item.horario,
    })).toBeGreaterThan(0)
    expect(compareByProximity(esquerda, direita, ALVO, {
      getValue: (item) => item.horario,
      getVagas: (item) => item.vagas_disponiveis,
    })).toBe(4)
    expect(compareByProximity({ vagas: 2 }, { vagas: 2 }, ALVO, {
      getValue: () => ALVO,
      getVagas: (item) => item.vagas,
    })).toBe(0)
    expect(() => compareByProximity(ALVO, ALVO, 'invalido')).toThrow(TypeError)
    expect(() => compareByProximity('invalido', ALVO, ALVO)).toThrow(TypeError)
  })
})
