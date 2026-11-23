import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const PLACA = 'ABC1D23'
const PERCURSO = ['Univille', 'Bairro', 'Centro']
const UMA_HORA = 60 * 60 * 1000

function saidaEm(horas) {
  return new Date(Date.now() + horas * UMA_HORA).toISOString()
}

function extrairReserva(body) {
  const resposta = body?.data ?? body ?? {}
  return resposta.reserva ?? resposta.cancelamento?.reserva ?? resposta
}

describe('Integração de cancelamentos (RF-015, RF-016, RF-025, RNF-004, RN-005, CA-005)', () => {
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
      [
        usuario.id,
        dados.marca,
        dados.modelo,
        dados.cor,
        dados.placa,
        dados.ano,
        dados.capacidade_passageiros,
      ],
    )
    return contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [resultado.lastID])
  }

  async function criarOferta(motorista, veiculo, overrides = {}) {
    const dados = {
      origem: 'Univille',
      destino: 'Centro',
      paradas: [...PERCURSO],
      data_hora_saida: saidaEm(25),
      vagas_total: 2,
      valor: 0,
      estado: 'ABERTA',
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas,
        data_hora_saida, vagas_total, valor, estado)
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
    const resposta = await contexto.request
      .post(`/api/ofertas/${ofertaId}/reservas`)
      .set('Authorization', auth(usuario))
      .send({})
    expect(resposta.status).toBe(201)
    return extrairReserva(resposta.body)
  }

  async function inserirReserva(ofertaId, passageiroId) {
    const resultado = await contexto.db.run(
      `INSERT INTO reservas (oferta_id, passageiro_id, status)
       VALUES (?, ?, 'CONFIRMADA')`,
      [ofertaId, passageiroId],
    )
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [resultado.lastID])
  }

  async function cancelarReserva(usuario, reservaId) {
    return contexto.request
      .post(`/api/reservas/${reservaId}/cancelar`)
      .set('Authorization', auth(usuario))
      .send({})
  }

  async function cancelarOferta(usuario, ofertaId) {
    return contexto.request
      .post(`/api/ofertas/${ofertaId}/cancelar`)
      .set('Authorization', auth(usuario))
      .send({})
  }

  async function contarConfirmadas(ofertaId) {
    const resultado = await contexto.db.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND status = 'CONFIRMADA'`,
      [ofertaId],
    )
    return Number(resultado.total)
  }

  async function penalidades(usuarioId) {
    return contexto.db.all('SELECT * FROM penalidades WHERE usuario_id = ?', [usuarioId])
  }

  async function eventos(entidadeTipo, entidadeId) {
    const linhas = await contexto.db.all(
      `SELECT * FROM historico_eventos
       WHERE entidade_tipo = ? AND entidade_id = ? ORDER BY id ASC`,
      [entidadeTipo, entidadeId],
    )
    return linhas.map((linha) => ({
      ...linha,
      detalhes: JSON.parse(linha.detalhes || '{}'),
    }))
  }

  async function contaAtiva(usuarioId) {
    const usuario = await contexto.db.get('SELECT conta_ativa FROM usuarios WHERE id = ?', [usuarioId])
    return Number(usuario.conta_ativa)
  }

  it('[RF-015/RN-005] passageiro cancela com 24h ou mais sem penalidade e libera a vaga', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const outroPassageiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, {
      data_hora_saida: saidaEm(25),
      vagas_total: 1,
    })
    const reserva = await reservar(passageiro, oferta.id)

    const resposta = await cancelarReserva(passageiro, reserva.id)
    expect(resposta.status).toBe(200)

    const cancelada = await contexto.db.get(
      'SELECT status, natureza_cancelamento FROM reservas WHERE id = ?',
      [reserva.id],
    )
    expect(cancelada.status).toBe('CANCELADA')
    expect(cancelada.natureza_cancelamento).toBe('passageiro')
    expect(await contarConfirmadas(oferta.id)).toBe(0)
    expect(await penalidades(passageiro.id)).toHaveLength(0)
    expect(await contaAtiva(passageiro.id)).toBe(1)

    const cancelamentos = await eventos('reserva', reserva.id)
    expect(cancelamentos.some((evento) => (
      evento.tipo_evento === 'RESERVA_CANCELADA' && evento.natureza === 'CANCELAMENTO_COMUM'
    ))).toBe(true)

    await reservar(outroPassageiro, oferta.id)
    expect(await contarConfirmadas(oferta.id)).toBe(1)
  })

  it('[RF-015/RN-005] passageiro cancela com menos de 24h com 1 ponto, vaga liberada e conta ativa', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const outroPassageiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, {
      data_hora_saida: saidaEm(2),
      vagas_total: 1,
    })
    const reserva = await reservar(passageiro, oferta.id)

    const resposta = await cancelarReserva(passageiro, reserva.id)
    expect(resposta.status).toBe(200)

    const registradas = await penalidades(passageiro.id)
    expect(registradas).toHaveLength(1)
    expect(Number(registradas[0].pontos)).toBe(1)
    expect(registradas[0].referencia).toMatch(/^(reserva|viagem|oferta):/)
    expect(await contarConfirmadas(oferta.id)).toBe(0)
    expect(await contaAtiva(passageiro.id)).toBe(1)

    const eventoPenalidade = await eventos('penalidade', registradas[0].id)
    expect(eventoPenalidade.some((evento) => evento.tipo_evento === 'PENALIDADE_REGISTRADA')).toBe(true)

    await reservar(outroPassageiro, oferta.id)
    expect(await contarConfirmadas(oferta.id)).toBe(1)
  })

  it('[RF-015/CA-005] passageiro não cancela após o horário previsto', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, {
      data_hora_saida: saidaEm(2),
      vagas_total: 1,
    })
    const reserva = await inserirReserva(oferta.id, passageiro.id)

    await contexto.db.run(
      'UPDATE ofertas SET data_hora_saida = ? WHERE id = ?',
      [saidaEm(-1), oferta.id],
    )

    const resposta = await cancelarReserva(passageiro, reserva.id)
    expect(resposta.status).toBe(409)

    const mantida = await contexto.db.get('SELECT status FROM reservas WHERE id = ?', [reserva.id])
    expect(mantida.status).toBe('CONFIRMADA')
    expect(await contarConfirmadas(oferta.id)).toBe(1)
    expect(await penalidades(passageiro.id)).toHaveLength(0)
  })

  it('[RF-016/RF-025/RN-005] motorista cancela oferta com reservas, cancela todas e recebe 1 ponto sem bloqueio', async () => {
    const motorista = await criarUsuario(0)
    const primeiroPassageiro = await criarUsuario(1)
    const segundoPassageiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, {
      data_hora_saida: saidaEm(3),
      vagas_total: 2,
    })
    const primeiraReserva = await reservar(primeiroPassageiro, oferta.id)
    const segundaReserva = await reservar(segundoPassageiro, oferta.id)

    const resposta = await cancelarOferta(motorista, oferta.id)
    expect(resposta.status).toBe(200)

    const ofertaCancelada = await contexto.db.get(
      'SELECT estado, natureza_cancelamento FROM ofertas WHERE id = ?',
      [oferta.id],
    )
    expect(ofertaCancelada.estado).toBe('CANCELADA')
    expect(ofertaCancelada.natureza_cancelamento).toBe('comum_motorista')

    const reservas = await contexto.db.all(
      'SELECT status, natureza_cancelamento FROM reservas WHERE oferta_id = ? ORDER BY id ASC',
      [oferta.id],
    )
    expect(reservas).toHaveLength(2)
    for (const reserva of reservas) {
      expect(reserva.status).toBe('CANCELADA')
      expect(reserva.natureza_cancelamento).toBe('motorista')
    }

    const registradas = await penalidades(motorista.id)
    expect(registradas).toHaveLength(1)
    expect(Number(registradas[0].pontos)).toBe(1)
    expect(await penalidades(primeiroPassageiro.id)).toHaveLength(0)
    expect(await penalidades(segundoPassageiro.id)).toHaveLength(0)
    expect(await contaAtiva(motorista.id)).toBe(1)

    const eventosOferta = await eventos('oferta', oferta.id)
    expect(eventosOferta.some((evento) => evento.tipo_evento === 'OFERTA_CANCELADA')).toBe(true)

    const reservasAfetadas = [primeiraReserva, segundaReserva].filter(Boolean)
    for (const reserva of reservasAfetadas) {
      const eventosReserva = await eventos('reserva', reserva.id)
      expect(eventosReserva.some((evento) => evento.tipo_evento === 'RESERVA_CANCELADA')).toBe(true)
    }

    const eventoPenalidade = await eventos('penalidade', registradas[0].id)
    expect(eventoPenalidade.some((evento) => evento.tipo_evento === 'PENALIDADE_REGISTRADA')).toBe(true)
  })

  it('[RNF-002/RN-008] terceiros não cancelam reserva ou oferta alheia', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const terceiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { data_hora_saida: saidaEm(25) })
    const reserva = await inserirReserva(oferta.id, passageiro.id)

    const reservaAlheia = await cancelarReserva(terceiro, reserva.id)
    const ofertaAlheia = await cancelarOferta(terceiro, oferta.id)

    expect([401, 403, 404]).toContain(reservaAlheia.status)
    expect([401, 403, 404]).toContain(ofertaAlheia.status)
    expect((await contexto.db.get('SELECT status FROM reservas WHERE id = ?', [reserva.id])).status).toBe('CONFIRMADA')
    expect((await contexto.db.get('SELECT estado FROM ofertas WHERE id = ?', [oferta.id])).estado).toBe('ABERTA')

    const reservaPropria = await cancelarReserva(passageiro, reserva.id)
    const ofertaPropria = await cancelarOferta(motorista, oferta.id)
    expect(reservaPropria.status).toBe(200)
    expect(ofertaPropria.status).toBe(200)
  })
})
