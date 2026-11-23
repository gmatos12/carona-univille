import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const PERCURSO = ['Univille', 'Bairro', 'Centro']
function saidaPassada(horas = 2) { return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString() }

describe('Integração de avaliações e reputação (RF-019, RNF-004, RN-006, CA-006)', () => {
  let contexto
  beforeAll(async () => { contexto = await createTestApp() })
  afterEach(async () => { await contexto.reset() })
  afterAll(async () => { await contexto.close() })

  async function criarUsuario(indice, overrides = {}) {
    const dados = {
      nome_completo: `Usuario ${indice}`, matricula: MATRICULAS_AUTORIZADAS[indice],
      email_institucional: `usuario${indice}@univille.br`, senha_hash: '$2b$10$hashmockadoapenasparafixture',
      telefone: `(47) 99999-${String(1000 + indice).padStart(4, '0')}`, ...overrides,
    }
    const r = await contexto.db.run(
      `INSERT INTO usuarios (nome_completo, matricula, email_institucional, senha_hash, telefone) VALUES (?, ?, ?, ?, ?)`,
      [dados.nome_completo, dados.matricula, dados.email_institucional, dados.senha_hash, dados.telefone],
    )
    return contexto.db.get('SELECT * FROM usuarios WHERE id = ?', [r.lastID])
  }
  function auth(usuario) {
    return `Bearer ${signToken({ sub: String(usuario.id), matricula: usuario.matricula, email_institucional: usuario.email_institucional })}`
  }
  async function criarVeiculo(usuario) {
    const r = await contexto.db.run(
      `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros) VALUES (?, 'Fiat', 'Uno', 'Branco', 'ABC1D23', 2020, 4)`,
      [usuario.id],
    )
    return contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [r.lastID])
  }
  async function criarOferta(motorista, veiculo, overrides = {}) {
    const dados = {
      origem: 'Univille', destino: 'Centro', paradas: [...PERCURSO], data_hora_saida: saidaPassada(),
      vagas_total: 3, valor: 0, estado: 'CONCLUIDA', iniciada_em: saidaPassada(2), concluida_em: saidaPassada(1), ...overrides,
    }
    const r = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida, vagas_total, valor, estado, iniciada_em, concluida_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [motorista.id, veiculo.id, dados.origem, dados.destino, JSON.stringify(dados.paradas), dados.data_hora_saida, dados.vagas_total, dados.valor, dados.estado, dados.iniciada_em, dados.concluida_em],
    )
    return contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [r.lastID])
  }
  async function inserirReserva(ofertaId, passageiroId, status = 'CONFIRMADA') {
    const r = await contexto.db.run(
      'INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)',
      [ofertaId, passageiroId, status],
    )
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [r.lastID])
  }
  async function avaliar(usuario, ofertaId, body) {
    return contexto.request.post(`/api/ofertas/${ofertaId}/avaliacoes`).set('Authorization', auth(usuario)).send(body)
  }

  it('[RF-019/CA-006] aceita nota 1-5 sem comentários, apenas viagem concluída sem no-show, uma por participante por viagem', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)
    await inserirReserva(oferta.id, passageiro.id, 'CONFIRMADA')

    const ok = await avaliar(passageiro, oferta.id, { avaliado_id: motorista.id, nota: 5 })
    expect(ok.status).toBe(201)

    const salvo = await contexto.db.get('SELECT * FROM avaliacoes WHERE oferta_id = ? AND avaliador_id = ?', [oferta.id, passageiro.id])
    expect(salvo).toBeTruthy()
    expect(Number(salvo.nota)).toBe(5)
    expect(salvo.comentario === undefined || salvo.comentario === null).toBe(true)

    const duplicada = await avaliar(passageiro, oferta.id, { avaliado_id: motorista.id, nota: 4 })
    expect(duplicada.status).toBe(409)

    const invalida = await avaliar(motorista, oferta.id, { avaliado_id: passageiro.id, nota: 0 })
    expect([400, 422]).toContain(invalida.status)
  })

  it('[RF-019/RN-006] bloqueia avaliação em viagem com registro de no-show', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)
    const reserva = await inserirReserva(oferta.id, passageiro.id, 'CONFIRMADA')
    await contexto.db.run("UPDATE reservas SET status = 'NO_SHOW', natureza_cancelamento = NULL WHERE id = ?", [reserva.id])

    const resp = await avaliar(motorista, oferta.id, { avaliado_id: passageiro.id, nota: 3 })
    expect([403, 409, 422]).toContain(resp.status)

    const total = await contexto.db.get('SELECT COUNT(*) AS total FROM avaliacoes WHERE oferta_id = ?', [oferta.id])
    expect(Number(total.total)).toBe(0)
  })

  it('[RF-019/CA-006] reputação retorna média com uma casa decimal e "Sem avaliações"', async () => {
    const motorista = await criarUsuario(0)
    const p1 = await criarUsuario(1)
    const p2 = await criarUsuario(2)
    const p3 = await criarUsuario(3)
    const veiculo = await criarVeiculo(motorista)

    const perfilSem = await contexto.request.get(`/api/usuarios/${motorista.id}/perfil-publico`).set('Authorization', auth(p1))
    expect(perfilSem.status).toBe(200)
    const bodySem = perfilSem.body?.data ?? perfilSem.body ?? {}
    const perfilSemObj = bodySem.perfil ?? bodySem.usuario ?? bodySem
    expect(perfilSemObj.media_avaliacoes ?? perfilSemObj.mediaAvaliacoes).toBe('Sem avaliações')

    const o1 = await criarOferta(motorista, veiculo); await inserirReserva(o1.id, p1.id, 'CONFIRMADA')
    const o2 = await criarOferta(motorista, veiculo); await inserirReserva(o2.id, p2.id, 'CONFIRMADA')
    const o3 = await criarOferta(motorista, veiculo); await inserirReserva(o3.id, p3.id, 'CONFIRMADA')

    await avaliar(p1, o1.id, { avaliado_id: motorista.id, nota: 5 })
    await avaliar(p2, o2.id, { avaliado_id: motorista.id, nota: 4 })
    await avaliar(p3, o3.id, { avaliado_id: motorista.id, nota: 4 })

    const perfil = await contexto.request.get(`/api/usuarios/${motorista.id}/perfil-publico`).set('Authorization', auth(p1))
    expect(perfil.status).toBe(200)
    const body = perfil.body?.data ?? perfil.body ?? {}
    const perfilObj = body.perfil ?? body.usuario ?? body
    expect(Number(perfilObj.media_avaliacoes ?? perfilObj.mediaAvaliacoes)).toBe(4.3)
  })
})
