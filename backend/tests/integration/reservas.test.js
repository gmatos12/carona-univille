import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const PLACA = 'ABC1D23'
const SAIDA_FUTURA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const SAIDA_PASSADA = '2020-01-01T08:00:00.000Z'
const PERCURSO = ['Univille', 'Bairro', 'Centro']

function desembrulhar(body) {
  const resposta = body?.data ?? body ?? {}
  return resposta.reserva ?? resposta
}

describe('Integração de reservas (RF-013, RF-014, RF-022, RNF-004, RN-002, RN-009, CA-004)', () => {
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
      marca: 'Fiat',
      modelo: 'Uno',
      cor: 'Branco',
      placa: PLACA,
      ano: 2020,
      capacidade_passageiros: 4,
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
      origem: 'Univille',
      destino: 'Centro',
      paradas: [...PERCURSO],
      data_hora_saida: SAIDA_FUTURA,
      vagas_total: 2,
      valor: 0,
      estado: 'ABERTA',
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida,
        vagas_total, valor, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        motorista.id,
        veiculo.id,
        dados.origem,
        dados.destino,
        JSON.stringify(dados.paradas),
        dados.data_hora_saida,
        dados.vagas_total,
        dados.valor,
        dados.estado,
      ],
    )
    return contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [resultado.lastID])
  }

  async function reservar(usuario, ofertaId) {
    return contexto.request
      .post(`/api/ofertas/${ofertaId}/reservas`)
      .set('Authorization', auth(usuario))
      .send({})
  }

  async function contarConfirmadas(ofertaId) {
    const resultado = await contexto.db.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND status = 'CONFIRMADA'`,
      [ofertaId],
    )
    return resultado.total
  }

  it('confirma reserva automaticamente e consome exatamente uma vaga por passageiro', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 2 })

    const primeira = await reservar(passageiro, oferta.id)
    expect(primeira.status).toBe(201)
    expect(desembrulhar(primeira.body).status).toBe('CONFIRMADA')
    expect(await contarConfirmadas(oferta.id)).toBe(1)

    const segundoPassageiro = await criarUsuario(2)
    const segunda = await reservar(segundoPassageiro, oferta.id)
    expect(segunda.status).toBe(201)
    expect(desembrulhar(segunda.body).status).toBe('CONFIRMADA')
    expect(await contarConfirmadas(oferta.id)).toBe(2)
  })

  it('bloqueia segunda reserva ativa do mesmo passageiro na mesma viagem', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)

    const primeira = await reservar(passageiro, oferta.id)
    expect(primeira.status).toBe(201)

    const segunda = await reservar(passageiro, oferta.id)
    expect(segunda.status).toBe(409)
    expect(await contarConfirmadas(oferta.id)).toBe(1)
  })

  it('bloqueia reserva após o horário previsto e com viagem iniciada', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const passada = await criarOferta(motorista, veiculo, {
      data_hora_saida: SAIDA_PASSADA,
    })
    const iniciada = await criarOferta(motorista, veiculo, { estado: 'EM_ANDAMENTO' })

    const primeira = await reservar(passageiro, passada.id)
    const segunda = await reservar(passageiro, iniciada.id)

    expect(primeira.status).toBe(409)
    expect(segunda.status).toBe(409)
    expect(await contarConfirmadas(passada.id)).toBe(0)
    expect(await contarConfirmadas(iniciada.id)).toBe(0)
  })

  it('bloqueia reserva em oferta lotada', async () => {
    const motorista = await criarUsuario(0)
    const primeiroPassageiro = await criarUsuario(1)
    const segundoPassageiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 1 })

    const primeira = await reservar(primeiroPassageiro, oferta.id)
    expect(primeira.status).toBe(201)

    const segunda = await reservar(segundoPassageiro, oferta.id)
    expect(segunda.status).toBe(409)
    expect(await contarConfirmadas(oferta.id)).toBe(1)
  })

  it('permite re-reservar a mesma viagem após cancelamento quando há vaga', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 1 })

    const primeira = await reservar(passageiro, oferta.id)
    expect(primeira.status).toBe(201)
    const reserva = desembrulhar(primeira.body)

    await contexto.db.run(
      `UPDATE reservas SET status = 'CANCELADA', natureza_cancelamento = 'passageiro'
       WHERE id = ?`,
      [reserva.id],
    )
    expect(await contarConfirmadas(oferta.id)).toBe(0)

    const segunda = await reservar(passageiro, oferta.id)
    expect(segunda.status).toBe(201)
    expect(desembrulhar(segunda.body).status).toBe('CONFIRMADA')
    expect(await contarConfirmadas(oferta.id)).toBe(1)
  })
})
