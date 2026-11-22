import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { ConflictError, NotFoundError } from '../../src/middlewares/errorHandler.js'
import { ReservaService } from '../../src/services/reservaService.js'
import { createTestDatabase } from './helpers/testDb.js'

const PLACA = 'ABC1D23'
const SAIDA_FUTURA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const SAIDA_PASSADA = '2020-01-01T08:00:00.000Z'
const PERCURSO = ['Univille', 'Bairro', 'Centro']

describe('Serviço de reservas (T051, RF-013, RF-014, RNF-003, RN-002, CA-004)', () => {
  let database
  let service

  beforeAll(async () => {
    database = await createTestDatabase()
    service = new ReservaService()
  })

  afterEach(async () => {
    await database.reset()
  })

  afterAll(async () => {
    await database.close()
  })

  async function criarUsuario(indice) {
    const resultado = await database.connection.run(
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
    return database.connection.get('SELECT * FROM usuarios WHERE id = ?', [resultado.lastID])
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
    const resultado = await database.connection.run(
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
    return database.connection.get('SELECT * FROM veiculos WHERE id = ?', [resultado.lastID])
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
    const resultado = await database.connection.run(
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
    return database.connection.get('SELECT * FROM ofertas WHERE id = ?', [resultado.lastID])
  }

  async function contarStatus(ofertaId, status) {
    const resultado = await database.connection.get(
      'SELECT COUNT(*) AS total FROM reservas WHERE oferta_id = ? AND status = ?',
      [ofertaId, status],
    )
    return Number(resultado.total)
  }

  async function alterarStatusReserva(id, status, naturezaCancelamento) {
    await database.connection.run(
      'UPDATE reservas SET status = ?, natureza_cancelamento = ? WHERE id = ?',
      [status, naturezaCancelamento, id],
    )
  }

  it('confirma reserva automaticamente e consome exatamente uma vaga por passageiro', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 2 })

    const primeira = await service.reservar({ oferta_id: oferta.id, passageiro_id: passageiro.id })
    expect(primeira.status).toBe('CONFIRMADA')
    expect(await contarStatus(oferta.id, 'CONFIRMADA')).toBe(1)

    const segundoPassageiro = await criarUsuario(2)
    const segunda = await service.reservar({
      oferta_id: oferta.id,
      passageiro_id: segundoPassageiro.id,
    })
    expect(segunda.status).toBe('CONFIRMADA')
    expect(await contarStatus(oferta.id, 'CONFIRMADA')).toBe(2)
  })

  it('bloqueia segunda reserva ativa do mesmo passageiro na mesma viagem', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)

    await service.reservar({ oferta_id: oferta.id, passageiro_id: passageiro.id })

    await expect(service.reservar({
      oferta_id: oferta.id,
      passageiro_id: passageiro.id,
    })).rejects.toBeInstanceOf(ConflictError)
    expect(await contarStatus(oferta.id, 'CONFIRMADA')).toBe(1)
  })

  it('bloqueia reserva a partir do horário previsto e em viagem iniciada', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const passada = await criarOferta(motorista, veiculo, {
      data_hora_saida: SAIDA_PASSADA,
    })
    const iniciada = await criarOferta(motorista, veiculo, { estado: 'EM_ANDAMENTO' })
    const noLimite = new ReservaService({ agora: () => new Date(SAIDA_FUTURA) })
    const ofertaFutura = await criarOferta(motorista, veiculo)

    await expect(service.reservar({
      oferta_id: passada.id,
      passageiro_id: passageiro.id,
    })).rejects.toBeInstanceOf(ConflictError)
    await expect(service.reservar({
      oferta_id: iniciada.id,
      passageiro_id: passageiro.id,
    })).rejects.toBeInstanceOf(ConflictError)
    await expect(noLimite.reservar({
      oferta_id: ofertaFutura.id,
      passageiro_id: passageiro.id,
    })).rejects.toBeInstanceOf(ConflictError)
    expect(await contarStatus(passada.id, 'CONFIRMADA')).toBe(0)
    expect(await contarStatus(iniciada.id, 'CONFIRMADA')).toBe(0)
  })

  it('bloqueia reserva em oferta lotada', async () => {
    const motorista = await criarUsuario(0)
    const primeiroPassageiro = await criarUsuario(1)
    const segundoPassageiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 1 })

    await service.reservar({ oferta_id: oferta.id, passageiro_id: primeiroPassageiro.id })

    await expect(service.reservar({
      oferta_id: oferta.id,
      passageiro_id: segundoPassageiro.id,
    })).rejects.toBeInstanceOf(ConflictError)
    expect(await contarStatus(oferta.id, 'CONFIRMADA')).toBe(1)
  })

  it('mantém vaga ocupada após no-show', async () => {
    const motorista = await criarUsuario(0)
    const primeiroPassageiro = await criarUsuario(1)
    const segundoPassageiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 1 })
    const reserva = await service.reservar({
      oferta_id: oferta.id,
      passageiro_id: primeiroPassageiro.id,
    })

    await alterarStatusReserva(reserva.id, 'NO_SHOW', null)

    await expect(service.reservar({
      oferta_id: oferta.id,
      passageiro_id: segundoPassageiro.id,
    })).rejects.toBeInstanceOf(ConflictError)
    expect(await contarStatus(oferta.id, 'CONFIRMADA')).toBe(0)
    expect(await contarStatus(oferta.id, 'NO_SHOW')).toBe(1)
  })

  it('permite re-reservar a mesma viagem após cancelamento quando há vaga', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 1 })
    const reserva = await service.reservar({ oferta_id: oferta.id, passageiro_id: passageiro.id })

    await alterarStatusReserva(reserva.id, 'CANCELADA', 'passageiro')

    const nova = await service.reservar({ oferta_id: oferta.id, passageiro_id: passageiro.id })
    expect(nova.status).toBe('CONFIRMADA')
    expect(nova.id).not.toBe(reserva.id)
    expect(await contarStatus(oferta.id, 'CONFIRMADA')).toBe(1)
  })

  it('aceita apenas uma reserva quando vários passageiros disputam a última vaga', async () => {
    const motorista = await criarUsuario(0)
    const passageiros = [
      await criarUsuario(1),
      await criarUsuario(2),
      await criarUsuario(3),
      await criarUsuario(4),
    ]
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 1 })

    const resultados = await Promise.allSettled(passageiros.map((passageiro) => (
      service.reservar({ oferta_id: oferta.id, passageiro_id: passageiro.id })
    )))

    expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1)
    expect(resultados.filter((resultado) => (
      resultado.status === 'rejected' && resultado.reason instanceof ConflictError
    ))).toHaveLength(3)
    expect(await contarStatus(oferta.id, 'CONFIRMADA')).toBe(1)
  })

  it('rejeita reserva em oferta inexistente', async () => {
    const passageiro = await criarUsuario(1)

    await expect(service.reservar({ oferta_id: 999999, passageiro_id: passageiro.id }))
      .rejects.toBeInstanceOf(NotFoundError)
  })
})
