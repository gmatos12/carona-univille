import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp, createTestRequest } from './helpers/app.js'

const PLACA = 'ABC1D23'
const SAIDA_FUTURA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const PERCURSO = ['Univille', 'Bairro', 'Centro']

describe('Concorrência de reservas (RF-014, RNF-003, RNF-004, RN-002, CA-004)', () => {
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

  async function criarUsuario(indice) {
    const resultado = await contexto.db.run(
      `INSERT INTO usuarios (nome_completo, matricula, email_institucional, senha_hash, telefone)
       VALUES (?, ?, ?, ?, ?)`,
      [
        `Usuario ${indice}`,
        MATRICULAS_AUTORIZADAS[indice],
        `usuario${indice}@univille.br`,
        '$2b$10$hashmockadoapenasparafixture',
        `(47) 99999-${String(1000 + indice).padStart(4, '0')}`,
      ],
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

  async function criarCenario() {
    const motorista = await criarUsuario(0)
    const passageiros = [
      await criarUsuario(1),
      await criarUsuario(2),
      await criarUsuario(3),
      await criarUsuario(4),
    ]
    const veiculoResultado = await contexto.db.run(
      `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [motorista.id, 'Fiat', 'Uno', 'Branco', PLACA, 2020, 4],
    )
    const veiculo = await contexto.db.get(
      'SELECT * FROM veiculos WHERE id = ?',
      [veiculoResultado.lastID],
    )
    const ofertaResultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas,
        data_hora_saida, vagas_total, valor, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        motorista.id,
        veiculo.id,
        'Univille',
        'Centro',
        JSON.stringify(PERCURSO),
        SAIDA_FUTURA,
        1,
        0,
        'ABERTA',
      ],
    )
    const oferta = await contexto.db.get(
      'SELECT * FROM ofertas WHERE id = ?',
      [ofertaResultado.lastID],
    )
    return { oferta, passageiros }
  }

  function tentarReservar(passageiro, ofertaId) {
    return createTestRequest(contexto.app)
      .post(`/api/ofertas/${ofertaId}/reservas`)
      .set('Authorization', auth(passageiro))
      .send({})
  }

  it('aceita apenas uma reserva quando vários passageiros disputam a última vaga', async () => {
    const { oferta, passageiros } = await criarCenario()

    const respostas = await Promise.all(
      passageiros.map((passageiro) => tentarReservar(passageiro, oferta.id)),
    )
    const statuses = respostas.map((resposta) => resposta.status).sort()

    expect(statuses.filter((status) => status === 201)).toHaveLength(1)
    expect(statuses.filter((status) => status === 409)).toHaveLength(3)

    const confirmadas = await contexto.db.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND status = 'CONFIRMADA'`,
      [oferta.id],
    )
    expect(confirmadas.total).toBe(1)
    expect(confirmadas.total).toBeLessThanOrEqual(oferta.vagas_total)
    expect(oferta.vagas_total).toBeLessThanOrEqual(4)
  })
})
