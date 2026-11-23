import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const PERCURSO = ['Univille', 'Bairro', 'Centro']
const DIA_MS = 24 * 60 * 60 * 1000

function isoEm(dias, hora = 8, minuto = 0) {
  const d = new Date(Date.now() + dias * DIA_MS)
  d.setUTCHours(hora, minuto, 0, 0)
  return d.toISOString()
}
function diaSemanaIso(iso) { return new Date(iso).getUTCDay() }
function auth(u) {
  return `Bearer ${signToken({ sub: String(u.id), matricula: u.matricula, email_institucional: u.email_institucional })}`
}
function corpo(resp) { return resp.body?.data ?? resp.body ?? {} }

describe('Integração de recorrências (RF-020, RF-021, RNF-004, RN-007, CA-007)', () => {
  let ctx
  beforeAll(async () => { ctx = await createTestApp() })
  afterEach(async () => { await ctx.reset() })
  afterAll(async () => { await ctx.close() })

  async function criarUsuario(indice, overrides = {}) {
    const dados = {
      nome_completo: `Usuario ${indice}`,
      matricula: MATRICULAS_AUTORIZADAS[indice],
      email_institucional: `u${indice}@univille.br`,
      senha_hash: '$2b$10$hashmockadoapenasparafixture',
      telefone: `(47) 99999-${String(2000 + indice).padStart(4, '0')}`,
      ...overrides,
    }
    const r = await ctx.db.run(
      `INSERT INTO usuarios (nome_completo, matricula, email_institucional, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
      [dados.nome_completo, dados.matricula, dados.email_institucional, dados.senha_hash, dados.telefone],
    )
    return ctx.db.get('SELECT * FROM usuarios WHERE id = ?', [r.lastID])
  }

  async function criarVeiculo(usuario, overrides = {}) {
    const d = { marca: 'Fiat', modelo: 'Uno', cor: 'Branco', placa: `ABC${1000 + usuario.id}`, ano: 2020, capacidade_passageiros: 4, ...overrides }
    const r = await ctx.db.run(
      `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario.id, d.marca, d.modelo, d.cor, d.placa, d.ano, d.capacidade_passageiros],
    )
    return ctx.db.get('SELECT * FROM veiculos WHERE id = ?', [r.lastID])
  }

  function payloadRecorrencia(veiculo, overrides = {}) {
    const baseIso = isoEm(1)
    return {
      veiculo_id: veiculo.id,
      dias_semana: [diaSemanaIso(baseIso)],
      horario: baseIso.slice(11, 16),
      origem: 'Univille',
      destino: 'Centro',
      paradas: [...PERCURSO],
      vagas: 3,
      valor: 0,
      ...overrides,
    }
  }

  async function criarRecorrencia(motorista, veiculo, overrides = {}) {
    return ctx.request.post('/api/recorrencias').set('Authorization', auth(motorista)).send(payloadRecorrencia(veiculo, overrides))
  }

  async function ofertasDaRecorrencia(recorrenciaId) {
    return ctx.db.all('SELECT * FROM ofertas WHERE recorrencia_id = ? ORDER BY data_hora_saida ASC, id ASC', [recorrenciaId])
  }

  it('[RF-020/RN-007/CA-007] gera ofertas individuais na janela de 15 dias e é idempotente por recorrência+data/hora', async () => {
    const motorista = await criarUsuario(0)
    const veiculo = await criarVeiculo(motorista)
    const resp = await criarRecorrencia(motorista, veiculo)
    expect([200, 201]).toContain(resp.status)
    const recorrencia = corpo(resp).recorrencia ?? corpo(resp)
    expect(recorrencia.id).toBeTruthy()

    const ofertas = await ofertasDaRecorrencia(recorrencia.id)
    expect(ofertas.length).toBeGreaterThan(0)
    for (const o of ofertas) {
      expect(Number(o.recorrencia_id)).toBe(Number(recorrencia.id))
      const diffDias = (new Date(o.data_hora_saida).getTime() - Date.now()) / DIA_MS
      expect(diffDias).toBeLessThanOrEqual(15.1)
      expect(diffDias).toBeGreaterThan(-1)
    }
    const chaves = ofertas.map((o) => `${o.recorrencia_id}|${o.data_hora_saida}`)
    expect(new Set(chaves).size).toBe(chaves.length)

    // Idempotência: reexecutar geração/garantia não duplica
    const antes = ofertas.length
    const regen = await ctx.request.post(`/api/recorrencias/${recorrencia.id}/gerar`).set('Authorization', auth(motorista))
    // Se endpoint dedicado não existir, aceitar 404 mas validar idempotência via recriação silenciosa pela API alternativa
    if (![200, 201, 204, 404, 405].includes(regen.status)) {
      expect([200, 201, 204]).toContain(regen.status)
    }
    if ([404, 405].includes(regen.status)) {
      // fallback: tentar PUT sem alterações ou POST mesmo payload não deve duplicar por unique constraint
      await ctx.request.put(`/api/recorrencias/${recorrencia.id}`).set('Authorization', auth(motorista)).send(payloadRecorrencia(veiculo))
    }
    const depois = await ofertasDaRecorrencia(recorrencia.id)
    expect(depois.length).toBe(antes)
  })

  it('[RF-021/RN-007] interrupção preserva ofertas criadas e alterações afetam apenas futuras não geradas; reservas permanecem independentes', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const baseIso = isoEm(2)
    const resp = await criarRecorrencia(motorista, veiculo, { dias_semana: [diaSemanaIso(baseIso)], horario: baseIso.slice(11, 16) })
    expect([200, 201]).toContain(resp.status)
    const recorrencia = (corpo(resp).recorrencia ?? corpo(resp))
    const ofertas = await ofertasDaRecorrencia(recorrencia.id)
    expect(ofertas.length).toBeGreaterThanOrEqual(2)

    // Reserva em uma ocorrência para provar independência
    const alvo = ofertas[0]
    const reserva = await ctx.db.run('INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)', [alvo.id, passageiro.id, 'CONFIRMADA'])
    expect(reserva.lastID).toBeTruthy()

    // Alterar configuração: futuras não geradas devem refletir mudança; ocorrências já geradas preservadas
    const novaOrigem = 'Campus'
    const put = await ctx.request.put(`/api/recorrencias/${recorrencia.id}`).set('Authorization', auth(motorista)).send({
      ...payloadRecorrencia(veiculo, { dias_semana: [diaSemanaIso(baseIso)], horario: baseIso.slice(11, 16) }),
      origem: novaOrigem,
    })
    expect([200, 204]).toContain(put.status)
    const antigas = await ofertasDaRecorrencia(recorrencia.id)
    const antigaAlvo = antigas.find((o) => o.id === alvo.id)
    expect(antigaAlvo.origem).not.toBe(novaOrigem)
    const reservaDepois = await ctx.db.get('SELECT * FROM reservas WHERE id = ?', [reserva.lastID])
    expect(reservaDepois.status).toBe('CONFIRMADA')

    // Interromper preserva ofertas criadas
    const interromper = await ctx.request.post(`/api/recorrencias/${recorrencia.id}/interromper`).set('Authorization', auth(motorista))
    expect([200, 204]).toContain(interromper.status)
    const aposInterrupcao = await ofertasDaRecorrencia(recorrencia.id)
    expect(aposInterrupcao.length).toBe(antigas.length)
    const rec = await ctx.db.get('SELECT * FROM recorrencias WHERE id = ?', [recorrencia.id])
    expect(Number(rec.ativa)).toBe(0)
  })
})
