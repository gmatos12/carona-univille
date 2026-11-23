import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const PERCURSO = ['Univille', 'Bairro', 'Centro']
function iso(horasOffset) { return new Date(Date.now() + horasOffset * 60 * 60 * 1000).toISOString() }
function auth(u) { return `Bearer ${signToken({ sub: String(u.id), matricula: u.matricula, email_institucional: u.email_institucional })}` }
function corpo(resp) { return resp.body?.data ?? resp.body ?? {} }
function ids(lista) { return (Array.isArray(lista) ? lista : []).map((i) => Number(i.id ?? i.oferta_id ?? i.reserva_id)).filter(Boolean) }

describe('Integração Minhas Viagens e visibilidade (RF-022, RF-023, RNF-004, RN-009, CA-008)', () => {
  let ctx
  beforeAll(async () => { ctx = await createTestApp() })
  afterEach(async () => { await ctx.reset() })
  afterAll(async () => { await ctx.close() })

  async function criarUsuario(indice) {
    const r = await ctx.db.run(
      `INSERT INTO usuarios (nome_completo, matricula, email_institucional, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
      [`Usuario ${indice}`, MATRICULAS_AUTORIZADAS[indice], `u${indice}@univille.br`, '$2b$10$hashmockadoapenasparafixture', `(47) 99999-${3000 + indice}`],
    )
    return ctx.db.get('SELECT * FROM usuarios WHERE id = ?', [r.lastID])
  }
  async function criarVeiculo(usuario) {
    const r = await ctx.db.run(
      `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros) VALUES (?, 'Fiat','Uno','Branco', ?, 2020, 4)`,
      [usuario.id, `MV${1000 + usuario.id}`],
    )
    return ctx.db.get('SELECT * FROM veiculos WHERE id = ?', [r.lastID])
  }
  async function criarOferta(motorista, veiculo, overrides = {}) {
    const d = { origem: 'Univille', destino: 'Centro', paradas: PERCURSO, data_hora_saida: iso(2), vagas_total: 2, valor: 0, estado: 'ABERTA', ...overrides }
    const r = await ctx.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida, vagas_total, valor, estado, natureza_cancelamento, iniciada_em, concluida_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [motorista.id, veiculo.id, d.origem, d.destino, JSON.stringify(d.paradas), d.data_hora_saida, d.vagas_total, d.valor, d.estado, d.natureza_cancelamento ?? null, d.iniciada_em ?? null, d.concluida_em ?? null],
    )
    return ctx.db.get('SELECT * FROM ofertas WHERE id = ?', [r.lastID])
  }
  async function criarReserva(ofertaId, passageiroId, status = 'CONFIRMADA') {
    const natureza = status === 'CANCELADA' ? 'passageiro' : null
    const r = await ctx.db.run(
      'INSERT INTO reservas (oferta_id, passageiro_id, status, natureza_cancelamento) VALUES (?, ?, ?, ?)',
      [ofertaId, passageiroId, 'CONFIRMADA', null],
    )
    if (status !== 'CONFIRMADA') {
      await ctx.db.run('UPDATE reservas SET status = ?, natureza_cancelamento = ? WHERE id = ?', [status, natureza, r.lastID])
    }
    return ctx.db.get('SELECT * FROM reservas WHERE id = ?', [r.lastID])
  }

  it('[RF-022/RF-023/RN-009/CA-008] lista oferecidas/reservadas/concluidas/canceladas e aplica visibilidade por horário', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const terceiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)

    const oferecidaFutura = await criarOferta(motorista, veiculo, { data_hora_saida: iso(3), estado: 'ABERTA' })
    const reservadaFutura = await criarOferta(motorista, veiculo, { data_hora_saida: iso(4), estado: 'ABERTA' })
    await criarReserva(reservadaFutura.id, passageiro.id, 'CONFIRMADA')
    const concluida = await criarOferta(motorista, veiculo, { data_hora_saida: iso(-4), estado: 'CONCLUIDA', iniciada_em: iso(-4), concluida_em: iso(-3) })
    await criarReserva(concluida.id, passageiro.id, 'CONFIRMADA')
    const cancelada = await criarOferta(motorista, veiculo, { data_hora_saida: iso(-2), estado: 'CANCELADA', natureza_cancelamento: 'comum_motorista' })
    await criarReserva(cancelada.id, passageiro.id, 'CANCELADA')

    // Visibilidade: após horário, fora da busca e só participantes
    const iniciadaPassada = await criarOferta(motorista, veiculo, { data_hora_saida: iso(-1), estado: 'ABERTA' })
    await criarReserva(iniciadaPassada.id, passageiro.id, 'CONFIRMADA')

    const busca = await ctx.request.get('/api/ofertas/busca').set('Authorization', auth(terceiro)).query({ origem: 'Univille', destino: 'Centro', data: iso(-1).slice(0, 10), horario: iso(-1).slice(11, 16) })
    const buscaIds = ids(corpo(busca).resultados ?? corpo(busca).ofertas ?? corpo(busca))
    expect(buscaIds).not.toContain(Number(iniciadaPassada.id))
    expect(buscaIds).not.toContain(Number(concluida.id))
    expect(buscaIds).not.toContain(Number(cancelada.id))

    const detalheTerceiro = await ctx.request.get(`/api/ofertas/${iniciadaPassada.id}`).set('Authorization', auth(terceiro))
    expect([403, 404]).toContain(detalheTerceiro.status)
    const detalhePassageiro = await ctx.request.get(`/api/ofertas/${iniciadaPassada.id}`).set('Authorization', auth(passageiro))
    expect(detalhePassageiro.status).toBe(200)

    // Minhas viagens por tipo
    const oferecidas = await ctx.request.get('/api/minhas-viagens').set('Authorization', auth(motorista)).query({ tipo: 'oferecidas' })
    expect(oferecidas.status).toBe(200)
    const oferecidasIds = ids(corpo(oferecidas).ofertas ?? corpo(oferecidas).resultados ?? corpo(oferecidas))
    expect(oferecidasIds).toContain(Number(oferecidaFutura.id))

    const reservadas = await ctx.request.get('/api/minhas-viagens').set('Authorization', auth(passageiro)).query({ tipo: 'reservadas' })
    expect(reservadas.status).toBe(200)
    const reservadasIds = ids(corpo(reservadas).reservas ?? corpo(reservadas).ofertas ?? corpo(reservadas).resultados ?? corpo(reservadas))
    expect(reservadasIds).toContain(Number(reservadaFutura.id))

    const concluidasResp = await ctx.request.get('/api/minhas-viagens').set('Authorization', auth(passageiro)).query({ tipo: 'concluidas' })
    expect(concluidasResp.status).toBe(200)
    const concluidasIds = ids(corpo(concluidasResp).reservas ?? corpo(concluidasResp).ofertas ?? corpo(concluidasResp).resultados ?? corpo(concluidasResp))
    expect(concluidasIds).toContain(Number(concluida.id))

    const canceladasResp = await ctx.request.get('/api/minhas-viagens').set('Authorization', auth(passageiro)).query({ tipo: 'canceladas' })
    expect(canceladasResp.status).toBe(200)
    const canceladasIds = ids(corpo(canceladasResp).reservas ?? corpo(canceladasResp).ofertas ?? corpo(canceladasResp).resultados ?? corpo(canceladasResp))
    expect(canceladasIds).toContain(Number(cancelada.id))
  })
})
