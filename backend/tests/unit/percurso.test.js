import { describe, expect, it } from 'vitest'
import {
  PARADAS_MINIMAS,
  chavePonto,
  compatibilidadePercurso,
  construirPercurso,
  filtrarPorPercurso,
  indicePonto,
  mesmoPonto,
  normalizarPercurso,
  normalizarPonto,
  obterDestino,
  obterOrigem,
  obterParadasIntermediarias,
  percursoContemSegmento,
  validarPercurso,
} from '../../src/utils/percurso.js'

const PERCURSO = construirPercurso(' A ', [' B ', 'C'], 'D')

describe('Utilitários de percurso (RF-010, RN-004)', () => {
  it('[RN-004] normaliza pontos e percursos em array ou JSON', () => {
    expect(PARADAS_MINIMAS).toBe(2)
    expect(normalizarPonto(' A ')).toBe('A')
    expect(normalizarPonto('   ')).toBeNull()
    expect(normalizarPonto(42)).toBeNull()
    expect(chavePonto(' B ')).toBe('b')
    expect(chavePonto('SÃO PAULO')).toBe('são paulo')
    expect(chavePonto(null)).toBeNull()

    expect(PERCURSO).toEqual(['A', 'B', 'C', 'D'])
    expect(normalizarPercurso('["A","B"]')).toEqual(['A', 'B'])
    expect(validarPercurso(PERCURSO)).toBe(true)
  })

  it('[RN-004] rejeita percurso curto, inválido ou mal formatado', () => {
    expect(() => normalizarPercurso(null)).toThrow('Percurso deve ser uma lista ordenada de pontos')
    expect(() => normalizarPercurso('{invalido')).toThrow('Percurso deve ser uma lista ordenada de pontos')
    expect(() => normalizarPercurso('{"origem":"A"}')).toThrow('Percurso deve ser uma lista ordenada de pontos')
    expect(() => normalizarPercurso(['A'])).toThrow('Percurso deve conter origem e destino')
    expect(() => normalizarPercurso(['A', 2])).toThrow('Percurso contém ponto inválido')
    expect(() => normalizarPercurso(['A', '  '])).toThrow('Percurso contém ponto inválido')
    expect(() => validarPercurso([])).toThrow('Percurso deve conter origem e destino')
    expect(() => construirPercurso('A', 10, 'B')).toThrow('Percurso deve ser uma lista ordenada de pontos')
  })

  it('[RN-004] constrói percurso com paradas em JSON', () => {
    expect(construirPercurso('Origem', '["Parada 1","Parada 2"]', 'Destino')).toEqual([
      'Origem',
      'Parada 1',
      'Parada 2',
      'Destino',
    ])
    expect(obterOrigem(PERCURSO)).toBe('A')
    expect(obterDestino(PERCURSO)).toBe('D')
    expect(obterParadasIntermediarias(PERCURSO)).toEqual(['B', 'C'])
    expect(obterParadasIntermediarias(['A', 'B'])).toEqual([])
  })

  it('[RF-010] localiza pontos e verifica compatibilidade de segmento', () => {
    expect(indicePonto(PERCURSO, ' b ')).toBe(1)
    expect(indicePonto(PERCURSO, 'Z')).toBe(-1)
    expect(indicePonto(PERCURSO, '')).toBe(-1)
    expect(mesmoPonto(' A ', 'a')).toBe(true)
    expect(mesmoPonto(null, 'A')).toBe(false)
    expect(mesmoPonto('', '')).toBe(false)

    expect(compatibilidadePercurso(PERCURSO, 'B', 'D')).toEqual({
      compativel: true,
      indiceOrigem: 1,
      indiceDestino: 3,
    })
    expect(compatibilidadePercurso(PERCURSO, 'D', 'A').compativel).toBe(false)
    expect(compatibilidadePercurso(PERCURSO, 'B', 'B').compativel).toBe(false)
    expect(compatibilidadePercurso(PERCURSO, 'Z', 'A').compativel).toBe(false)
    expect(percursoContemSegmento(PERCURSO, 'C', 'D')).toBe(true)
    expect(percursoContemSegmento(PERCURSO, 'C', 'B')).toBe(false)
  })

  it('[RF-010] filtra ofertas pelo percurso com extrator customizado', () => {
    const ofertas = [
      { id: 1, rota: PERCURSO },
      { id: 2, rota: ['D', 'C', 'B', 'A'] },
      { id: 3, rota: ['A', 'B'] },
    ]

    expect(filtrarPorPercurso(ofertas, 'B', 'D', {
      extrairPercurso: (oferta) => oferta.rota,
    }).map((oferta) => oferta.id)).toEqual([1])
    expect(filtrarPorPercurso(ofertas, 'A', 'B', {
      extrairPercurso: (oferta) => oferta.rota,
    }).map((oferta) => oferta.id)).toEqual([1, 3])
    expect(() => filtrarPorPercurso({}, 'A', 'B')).toThrow('Ofertas devem ser uma lista')
    expect(() => filtrarPorPercurso([{ id: 4 }], 'A', 'B')).toThrow('Percurso deve ser uma lista ordenada de pontos')
  })
})
