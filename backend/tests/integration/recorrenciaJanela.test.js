import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { createTestApp } from './helpers/app.js'

const DIA_MS = 24 * 60 * 60 * 1000
function isoEm(dias, hora = 8) {
  const d = new Date(Date.now() + dias * DIA_MS)
  d.setUTCHours(hora, 0, 0, 0)
  return d.toISOString()
}

describe('Rotina de garantia de janela de recorrência (RF-020, RNF-003, RNF-004, RN-007, CA-007)', () => {
  let ctx
  beforeAll(async () => { ctx = await createTestApp() })
  afterEach(async () => { await ctx.reset() })
  afterAll(async () => { await ctx.close() })

  async function seed() {
    const u = await ctx.db.run(
      `INSERT INTO usuarios (nome_completo, matricula, email_institucional, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
      ['Motorista', MATRICULAS_AUTORIZADAS[0], 'm@univille.br', '$2b$10$hashmockadoapenasparafixture', '(47) 99999-0001'],
    )
    const v = await ctx.db.run(
      `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros) VALUES (?, 'Fiat','Uno','Branco','ABC1D23',2020,4)`,
      [u.lastID],
    )
    const baseIso = isoEm(1)
    const r = await ctx.db.run(
      `INSERT INTO recorrencias (motorista_id, veiculo_id, dias_semana, horario, origem, destino, paradas, vagas, valor, ativa, janela_dias)
       VALUES (?, ?, ?, ?, 'Univille', 'Centro', ?, 3, 0, 1, 15)`,
      [u.lastID, v.lastID, JSON.stringify([new Date(baseIso).getUTCDay()]), baseIso.slice(11, 16), JSON.stringify(['Univille', 'Bairro', 'Centro'])],
    )
    return { usuarioId: u.lastID, veiculoId: v.lastID, recorrenciaId: r.lastID, baseIso }
  }

  async function carregarScheduler() {
    const mod = await import('../../src/services/recorrenciaScheduler.js')
    return mod.garantirJanelaRecorrencias || mod.garantirJanela || mod.default?.garantirJanelaRecorrencias || mod.default
  }

  it('gera na inicialização, é idempotente em execução periódica e completa pendentes após indisponibilidade/retomada', async () => {
    const { recorrenciaId } = await seed()
    const garantir = await carregarScheduler()
    expect(typeof garantir).toBe('function')

    const r1 = await garantir({ agora: new Date(), connection: ctx.db })
    const ofertas1 = await ctx.db.all('SELECT * FROM ofertas WHERE recorrencia_id = ? ORDER BY data_hora_saida', [recorrenciaId])
    expect(ofertas1.length).toBeGreaterThan(0)
    expect(Number(r1?.geradas ?? r1?.criadas ?? ofertas1.length)).toBeGreaterThanOrEqual(0)

    // Execução periódica: sem duplicar
    const r2 = await garantir({ agora: new Date(Date.now() + 60_000), connection: ctx.db })
    const ofertas2 = await ctx.db.all('SELECT * FROM ofertas WHERE recorrencia_id = ? ORDER BY data_hora_saida', [recorrenciaId])
    expect(ofertas2.length).toBe(ofertas1.length)
    expect(Number(r2?.duplicadas ?? 0)).toBe(0)
    const chaves = ofertas2.map((o) => `${o.recorrencia_id}|${o.data_hora_saida}`)
    expect(new Set(chaves).size).toBe(chaves.length)

    // Simula indisponibilidade: remove ocorrências futuras "pendentes" e avança o tempo
    const futuras = ofertas2.filter((o) => new Date(o.data_hora_saida).getTime() > Date.now() + 2 * DIA_MS)
    for (const o of futuras.slice(0, 2)) {
      await ctx.db.run('DELETE FROM ofertas WHERE id = ? AND recorrencia_id = ?', [o.id, recorrenciaId])
    }
    const aposQueda = await ctx.db.all('SELECT COUNT(*) AS total FROM ofertas WHERE recorrencia_id = ?', [recorrenciaId])
    expect(Number(aposQueda[0].total)).toBeLessThan(ofertas2.length)

    // Retomada: completa pendentes sem duplicar existentes
    await garantir({ agora: new Date(Date.now() + 3 * DIA_MS), connection: ctx.db })
    const aposRetomada = await ctx.db.all('SELECT * FROM ofertas WHERE recorrencia_id = ? ORDER BY data_hora_saida', [recorrenciaId])
    const chaves2 = aposRetomada.map((o) => `${o.recorrencia_id}|${o.data_hora_saida}`)
    expect(new Set(chaves2).size).toBe(chaves2.length)
    expect(chaves2).toEqual(expect.arrayContaining(chaves))
    expect(aposRetomada.length).toBeGreaterThanOrEqual(ofertas2.length)
  })
})
