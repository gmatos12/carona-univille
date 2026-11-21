import { describe, expect, it } from 'vitest'
import {
  MINUTOS_JANELA,
  buildSearchWindow,
  combineDateAndTime,
  isWithinWindow,
} from '../../src/utils/dateTime.js'
import {
  compatibilidadePercurso,
  construirPercurso,
  percursoContemSegmento,
} from '../../src/utils/percurso.js'

const DATA = '2026-11-20'
const HORARIO = '10:00'
const MILISEGUNDOS_POR_MINUTO = 60 * 1000
const PERCURSO = construirPercurso('A', ['B', 'C'], 'D')

function horarioDesejado() {
  return combineDateAndTime(DATA, HORARIO)
}

function oferta(id, deslocamentoMinutos, paradas = PERCURSO, extras = {}) {
  return {
    id,
    paradas,
    data_hora_saida: new Date(
      horarioDesejado().getTime() + deslocamentoMinutos * MILISEGUNDOS_POR_MINUTO,
    ),
    ...extras,
  }
}

function buscar(ofertas, { origem, destino, data = DATA, horario = HORARIO }) {
  const janela = buildSearchWindow(data, horario)

  return ofertas.filter((item) => (
    percursoContemSegmento(item.paradas, origem, destino)
      && isWithinWindow(item.data_hora_saida, janela.target, janela.windowMinutes)
  ))
}

describe('Busca por percurso e janela temporal (RF-010, RNF-004, RN-004, CA-003)', () => {
  it('[RF-010/RN-004] aceita exatamente -30 e +30 minutos e rejeita 31 minutos', () => {
    expect(MINUTOS_JANELA).toBe(30)

    const encontradas = buscar([
      oferta('menos-31', -31),
      oferta('menos-30', -30),
      oferta('exato', 0),
      oferta('mais-30', 30),
      oferta('mais-31', 31),
    ], { origem: 'A', destino: 'D' })

    expect(encontradas.map((item) => item.id)).toEqual(['menos-30', 'exato', 'mais-30'])
  })

  it('[RF-010/RN-004] aceita origem e destino em pontos intermediários na ordem da rota', () => {
    const ofertas = [
      oferta('inteiro', 0),
      oferta('intermediario-destino', 10),
      oferta('origem-intermediario', -10),
    ]

    expect(buscar(ofertas, { origem: 'A', destino: 'D' }).map((item) => item.id)).toEqual([
      'inteiro',
      'intermediario-destino',
      'origem-intermediario',
    ])
    expect(buscar(ofertas, { origem: 'B', destino: 'D' }).map((item) => item.id)).toHaveLength(3)
    expect(buscar(ofertas, { origem: 'A', destino: 'C' }).map((item) => item.id)).toHaveLength(3)
    expect(buscar(ofertas, { origem: 'B', destino: 'C' }).map((item) => item.id)).toHaveLength(3)
    expect(compatibilidadePercurso(PERCURSO, ' b ', 'D').compativel).toBe(true)
  })

  it('[RF-010/RN-004] rejeita origem depois do destino e pontos iguais', () => {
    expect(compatibilidadePercurso(PERCURSO, 'C', 'B')).toMatchObject({
      compativel: false,
      indiceOrigem: 2,
      indiceDestino: 1,
    })
    expect(percursoContemSegmento(PERCURSO, 'D', 'A')).toBe(false)
    expect(compatibilidadePercurso(PERCURSO, 'B', 'B').compativel).toBe(false)
    expect(buscar([oferta('invalida', 0)], { origem: 'C', destino: 'B' })).toHaveLength(0)
  })

  it('[RF-010/RN-004] não considera raio ou coordenadas geográficas', () => {
    const encontradas = buscar([
      oferta('percurso-valido', 0, PERCURSO, {
        latitude: -90,
        longitude: 180,
        raio_km: 0,
      }),
      oferta('percurso-invalido', 0, construirPercurso('D', ['C', 'B'], 'A'), {
        latitude: 0,
        longitude: 0,
        raio_km: 1,
      }),
    ], { origem: 'B', destino: 'D' })

    expect(encontradas.map((item) => item.id)).toEqual(['percurso-valido'])
  })
})
