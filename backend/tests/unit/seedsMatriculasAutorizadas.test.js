import { describe, expect, it } from 'vitest'
import {
  MATRICULAS_AUTORIZADAS,
  MATRICULAS_AUTORIZADAS_TABLE,
  getMatriculasAutorizadas,
  isMatriculaAutorizada,
  validarMatriculasAutorizadas,
} from '../../src/db/seeds/matriculasAutorizadas.js'

describe('Base de matrículas autorizadas (RF-001)', () => {
  it('expõe uma lista congelada de matrículas e o nome da tabela', () => {
    expect(Object.isFrozen(MATRICULAS_AUTORIZADAS)).toBe(true)
    expect(MATRICULAS_AUTORIZADAS_TABLE).toBe('matriculas_autorizadas')
    expect(MATRICULAS_AUTORIZADAS).toHaveLength(20)
    expect(validarMatriculasAutorizadas()).toBe(MATRICULAS_AUTORIZADAS)
  })

  it('rejeita bases inválidas e matrículas duplicadas', () => {
    expect(() => validarMatriculasAutorizadas('99000001')).toThrow(TypeError)
    expect(() => validarMatriculasAutorizadas('99000001')).toThrow('deve ser um array')

    const casos = [
      [[123], 'devem ser strings não vazias'],
      [[''], 'devem ser strings não vazias'],
      [['   '], 'devem ser strings não vazias'],
      [['99000001', null], 'devem ser strings não vazias'],
      [['99000001', '99000002', '99000001'], 'Matrícula autorizada duplicada: 99000001'],
    ]

    for (const [matriculas, mensagem] of casos) {
      expect(() => validarMatriculasAutorizadas(matriculas)).toThrow(mensagem)
    }
    expect(validarMatriculasAutorizadas([])).toEqual([])
    expect(validarMatriculasAutorizadas(['99000021', '99000022'])).toEqual(['99000021', '99000022'])
  })

  it('devolve uma cópia e verifica autorização por valor', () => {
    const copia = getMatriculasAutorizadas()

    expect(copia).toEqual([...MATRICULAS_AUTORIZADAS])
    expect(copia).not.toBe(MATRICULAS_AUTORIZADAS)
    copia.push('99000999')
    expect(MATRICULAS_AUTORIZADAS).toHaveLength(20)

    expect(isMatriculaAutorizada('99000001')).toBe(true)
    expect(isMatriculaAutorizada(99000020)).toBe(true)
    expect(isMatriculaAutorizada('99000999')).toBe(false)
    expect(isMatriculaAutorizada(undefined)).toBe(false)
  })
})
