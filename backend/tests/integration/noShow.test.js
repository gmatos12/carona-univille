import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const UMA_HORA = 60 * 60 * 1000
const PERCURSO = ['Univille', 'Bairro', 'Centro']

function saidaEm(horas) {
  return new Date(Date.now() + horas * UMA_HORA).toISOString()
}

describe('Integração de no-show e ausência do motorista (RF-018, RF-019, RNF-004, RN-005, RN-006, CA-005, CA-006)', () => {
  let contexto

  beforeAll(async () => {
    contexto = await createTestApp()
  })

  afterEach(async () => {
    await contexto.reset()
  })

  afterAll(async () => {
    await contexto.close()
  })

  async function criarUsuario(indice, overrides = {}) {
    const dados = {
      nome_completo: `Usuario ${indice}`,
      matricula: MATRICULAS_AUTORIZADAS[indice],
      email_institucional: `usuario${indice}@univille.br`,
      senha_hash: '$2b$10$hashmockadoapenasparafixture',
      telefone: `(47) 99999-${String(1000 + indice).padStart(4, '0')}`,
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO usuarios (nome_completo, matricula, email_institucional, senha_hash, telefone)
       VALUES (?, ?, ?, ?, ?)`,
      [dados.nome_completo, dados.matricula, dados.email_institucional, dados.senha_hash, dados.telefone],
    )
    return contexto.db.get('SELECT * FROM usuarios WHERE id = ?', [resultado.lastID])
  }

  function auth(usuario) {
    return `Bearer ${signToken({
      sub: String(usuario.id),
      matricula: usuario.matricula,
      email_institucional: usuario.email_institucional,
    })}`
  }

  async function criarVeiculo(usuario, overrides = {}) {
    const dados = {
      marca: 'Fiat', modelo: 'Uno', cor: 'Branco', placa: 'ABC1D23', ano: 2020, capacidade_passageiros: 4,
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario.id, dados.marca, dados.modelo, dados.cor, dados.placa, dados.ano, dados.capacidade_passageiros],
    )
    return contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [resultado.lastID])
  }

  async function criarOferta(motorista, veiculo, overrides = {}) {
    const dados = {
      origem: 'Univille', destino: 'Centro', paradas: [...PERCURSO], data_hora_saida: saidaEm(-1),
      vagas_total: 2, valor: 0, estado: 'ABERTA', ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida, vagas_total, valor, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [motorista.id, veiculo.id, dados.origem, dados.destino, JSON.stringify(dados.paradas), dados.data_hora_saida, dados.vagas_total, dados.valor, dados.estado],
    )
    return contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [resultado.lastID])
  }

  async function inserirReserva(ofertaId, passageiroId, status = 'CONFIRMADA') {
    const resultado = await contexto.db.run(
      'INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)',
      [ofertaId, passageiroId, status],
    )
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [resultado.lastID])
  }

  async function eventos(entidadeTipo, entidadeId) {
    const linhas = await contexto.db.all(
      `SELECT * FROM historico_eventos WHERE entidade_tipo = ? AND entidade_id = ? ORDER BY id ASC`,
      [entidadeTipo, entidadeId],
    )
    return linhas.map((l) => ({ ...l, detalhes: JSON.parse(l.detalhes || '{}') }))
  }

  it('[RF-018/RN-005/RN-006] motorista registra no-show do passageiro: status NO_SHOW, 2 pontos, vaga não liberada e histórico', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const outro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { data_hora_saida: saidaEm(-1), vagas_total: 1 })
    const reserva = await inserirReserva(oferta.id, passageiro.id)

    const resposta = await contexto.request
      .post(`/api/reservas/${reserva.id}/no-show`)
      .set('Authorization', auth(motorista))
      .send({})

    expect(resposta.status).toBe(200)

    const salva = await contexto.db.get('SELECT status, natureza_cancelamento FROM reservas WHERE id = ?', [reserva.id])
    expect(salva.status).toBe('NO_SHOW')
    expect(salva.natureza_cancelamento == null).toBe(true)

    const ocupantes = await contexto.db.get(
      `SELECT COUNT(*) AS total FROM reservas WHERE oferta_id = ? AND status IN ('CONFIRMADA','NO_SHOW')`,
      [oferta.id],
    )
    expect(ocupantes.total).toBe(1)

    const penalidades = await contexto.db.all('SELECT * FROM penalidades WHERE usuario_id = ?', [passageiro.id])
    expect(penalidades).toHaveLength(1)
    expect(Number(penalidades[0].pontos)).toBe(2)
    expect(String(penalidades[0].tipo_evento)).toMatch(/NO_SHOW_PASSAGEIRO/)

    const histReserva = await eventos('reserva', reserva.id)
    expect(histReserva.some((e) => e.tipo_evento === 'NO_SHOW_PASSAGEIRO')).toBe(true)

    const reservaOutro = await contexto.request
      .post(`/api/ofertas/${oferta.id}/reservas`)
      .set('Authorization', auth(outro))
      .send({})
    expect(reservaOutro.status).toBe(409)
  })

  it('[RF-018/RN-005] passageiro informa ausência do motorista: cancela viagem/reservas, 2 pontos ao motorista e histórico', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const passageiro2 = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { data_hora_saida: saidaEm(-1), vagas_total: 3 })
    const r1 = await inserirReserva(oferta.id, passageiro.id)
    const r2 = await inserirReserva(oferta.id, passageiro2.id)

    const resposta = await contexto.request
      .post(`/api/ofertas/${oferta.id}/ausencia-motorista`)
      .set('Authorization', auth(passageiro))
      .send({})

    expect(resposta.status).toBe(200)

    const ofertaSalva = await contexto.db.get('SELECT estado, natureza_cancelamento FROM ofertas WHERE id = ?', [oferta.id])
    expect(ofertaSalva.estado).toBe('CANCELADA')
    expect(String(ofertaSalva.natureza_cancelamento)).toMatch(/ausencia_motorista/i)

    const reservas = await contexto.db.all('SELECT status, natureza_cancelamento FROM reservas WHERE oferta_id = ? ORDER BY id', [oferta.id])
    expect(reservas).toHaveLength(2)
    for (const r of reservas) {
      expect(r.status).toBe('CANCELADA')
      expect(String(r.natureza_cancelamento)).toMatch(/ausencia_motorista/i)
    }

    const penalidadesMotorista = await contexto.db.all('SELECT * FROM penalidades WHERE usuario_id = ?', [motorista.id])
    expect(penalidadesMotorista).toHaveLength(1)
    expect(Number(penalidadesMotorista[0].pontos)).toBe(2)
    expect(String(penalidadesMotorista[0].tipo_evento)).toMatch(/AUSENCIA_MOTORISTA/)

    expect(await contexto.db.all('SELECT * FROM penalidades WHERE usuario_id = ?', [passageiro.id])).toHaveLength(0)
    expect(await contexto.db.all('SELECT * FROM penalidades WHERE usuario_id = ?', [passageiro2.id])).toHaveLength(0)

    const histOferta = await eventos('oferta', oferta.id)
    expect(histOferta.some((e) => e.tipo_evento === 'AUSENCIA_MOTORISTA' || e.natureza === 'AUSENCIA_MOTORISTA')).toBe(true)
    const histR1 = await eventos('reserva', r1.id)
    const histR2 = await eventos('reserva', r2.id)
    expect(histR1.length + histR2.length).toBeGreaterThan(0)
  })

  it('[RNF-002/RN-008] somente participantes registram no-show e ausência do motorista', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const terceiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { data_hora_saida: saidaEm(-1) })
    const reserva = await inserirReserva(oferta.id, passageiro.id)

    const noShowTerceiro = await contexto.request
      .post(`/api/reservas/${reserva.id}/no-show`)
      .set('Authorization', auth(terceiro))
      .send({})
    const ausenciaTerceiro = await contexto.request
      .post(`/api/ofertas/${oferta.id}/ausencia-motorista`)
      .set('Authorization', auth(terceiro))
      .send({})

    expect([401, 403, 404]).toContain(noShowTerceiro.status)
    expect([401, 403, 404]).toContain(ausenciaTerceiro.status)
    expect((await contexto.db.get('SELECT status FROM reservas WHERE id = ?', [reserva.id])).status).toBe('CONFIRMADA')
    expect((await contexto.db.get('SELECT estado FROM ofertas WHERE id = ?', [oferta.id])).estado).toBe('ABERTA')

    const noShowMotorista = await contexto.request
      .post(`/api/reservas/${reserva.id}/no-show`)
      .set('Authorization', auth(motorista))
      .send({})
    expect(noShowMotorista.status).toBe(200)
  })
})
