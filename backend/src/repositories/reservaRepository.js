import { getConnection } from '../db/connection.js'
import { ConflictError, NotFoundError } from '../middlewares/errorHandler.js'

export const STATUS = Object.freeze({
  CONFIRMADA: 'CONFIRMADA',
  CANCELADA: 'CANCELADA',
  NO_SHOW: 'NO_SHOW',
})

export const NATUREZAS_CANCELAMENTO = Object.freeze({
  PASSAGEIRO: 'passageiro',
  MOTORISTA: 'motorista',
  EXCLUSAO_CONTA: 'exclusao_conta',
  AUSENCIA_MOTORISTA: 'ausencia_motorista',
})

export const TRANSICOES_PERMITIDAS = Object.freeze({
  [STATUS.CONFIRMADA]: Object.freeze([STATUS.CANCELADA, STATUS.NO_SHOW]),
  [STATUS.CANCELADA]: Object.freeze([]),
  [STATUS.NO_SHOW]: Object.freeze([]),
})

const CAMPOS_ATUALIZAVEIS = Object.freeze(['status', 'natureza_cancelamento'])

function resolverConexao(connection) {
  return connection || getConnection()
}

function inteiroObrigatorio(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new TypeError(`${nome} deve ser um inteiro positivo`)
  }
  return numero
}

function textoOpcional(value, nome) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new TypeError(`${nome} deve ser texto`)
  return value.trim() || null
}

function normalizarStatus(value) {
  const status = String(value ?? STATUS.CONFIRMADA).toUpperCase()
  if (!Object.values(STATUS).includes(status)) throw new TypeError('status inválido')
  return status
}

function validarTransicao(statusAtual, statusNovo) {
  if (statusAtual === statusNovo && statusAtual === STATUS.CONFIRMADA) return
  const permitidas = TRANSICOES_PERMITIDAS[statusAtual] ?? []
  if (!permitidas.includes(statusNovo)) {
    throw new ConflictError(`Transição de reserva ${statusAtual} para ${statusNovo} não é permitida`)
  }
}

export function normalizarReserva(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new TypeError('Reserva inválida')
  }

  const status = normalizarStatus(dados.status ?? STATUS.CONFIRMADA)
  if (status !== STATUS.CONFIRMADA) {
    throw new TypeError('reserva só pode ser criada como CONFIRMADA')
  }

  const naturezaCancelamento = textoOpcional(
    dados.natureza_cancelamento ?? dados.naturezaCancelamento,
    'natureza_cancelamento',
  )
  if (naturezaCancelamento !== null) {
    throw new TypeError('reserva não pode ser criada com natureza_cancelamento')
  }

  return {
    oferta_id: inteiroObrigatorio(dados.oferta_id ?? dados.ofertaId, 'oferta_id'),
    passageiro_id: inteiroObrigatorio(
      dados.passageiro_id ?? dados.passageiroId,
      'passageiro_id',
    ),
    status,
    natureza_cancelamento: null,
  }
}

export function normalizarAtualizacaoReserva(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new TypeError('Atualização de reserva inválida')
  }

  const normalizados = {}
  for (const [chave, valor] of Object.entries(dados)) {
    if (!CAMPOS_ATUALIZAVEIS.includes(chave)) continue
    if (chave === 'status') normalizados.status = normalizarStatus(valor)
    else normalizados.natureza_cancelamento = textoOpcional(valor, chave)
  }

  if (normalizados.status === STATUS.NO_SHOW
    && normalizados.natureza_cancelamento !== undefined
    && normalizados.natureza_cancelamento !== null) {
    throw new ConflictError('NO_SHOW não admite natureza_cancelamento')
  }

  return normalizados
}

function mapearLinha(row) {
  return row ? { ...row } : null
}

function converterErroEscrita(error) {
  const mensagem = String(error?.message ?? '').toLowerCase()
  if (mensagem.includes('idx_reservas_ativa_por_passageiro') || mensagem.includes('unique')) {
    return new ConflictError('Passageiro já possui reserva ativa nesta viagem')
  }
  if (mensagem.includes('capacidade da oferta excedida')) {
    return new ConflictError('Não há vagas disponíveis nesta oferta')
  }
  if (mensagem.includes('transicao de status de reserva invalida')) {
    return new ConflictError('Transição de reserva não é permitida')
  }
  if (mensagem.includes('natureza_cancelamento')) {
    return new ConflictError('natureza_cancelamento inválida para o status da reserva')
  }
  if (mensagem.includes('reserva so pode ser criada')) {
    return new ConflictError('Reserva só pode ser criada como CONFIRMADA')
  }
  if (mensagem.includes('foreign key')) {
    return new NotFoundError('Oferta ou passageiro não encontrado')
  }
  return error
}

export class ReservaRepository {
  constructor(connection) {
    this.connection = connection
  }

  async criar(dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const reserva = normalizarReserva(dados)

    try {
      const resultado = await conn.run(
        `INSERT INTO reservas (oferta_id, passageiro_id, status, natureza_cancelamento)
         VALUES (?, ?, ?, ?)`,
        [
          reserva.oferta_id,
          reserva.passageiro_id,
          reserva.status,
          reserva.natureza_cancelamento,
        ],
      )
      return await this.buscarPorId(resultado.lastID, conn)
    } catch (error) {
      throw converterErroEscrita(error)
    }
  }

  async buscarPorId(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get('SELECT * FROM reservas WHERE id = ?', [
      inteiroObrigatorio(id, 'id'),
    ])
    return mapearLinha(row)
  }

  async buscarAtivaPorPassageiro(ofertaId, passageiroId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT * FROM reservas
       WHERE oferta_id = ? AND passageiro_id = ? AND status = 'CONFIRMADA'
       ORDER BY id DESC LIMIT 1`,
      [
        inteiroObrigatorio(ofertaId, 'oferta_id'),
        inteiroObrigatorio(passageiroId, 'passageiro_id'),
      ],
    )
    return mapearLinha(row)
  }

  async contarAtivasPorPassageiro(ofertaId, passageiroId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND passageiro_id = ? AND status = 'CONFIRMADA'`,
      [
        inteiroObrigatorio(ofertaId, 'oferta_id'),
        inteiroObrigatorio(passageiroId, 'passageiro_id'),
      ],
    )
    return Number(row?.total ?? 0)
  }

  async contarConfirmadas(ofertaId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND status = 'CONFIRMADA'`,
      [inteiroObrigatorio(ofertaId, 'oferta_id')],
    )
    return Number(row?.total ?? 0)
  }

  async contarOcupantes(ofertaId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND status IN ('CONFIRMADA', 'NO_SHOW')`,
      [inteiroObrigatorio(ofertaId, 'oferta_id')],
    )
    return Number(row?.total ?? 0)
  }

  async vagasDisponiveis(ofertaId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const ofertaIdNormalizado = inteiroObrigatorio(ofertaId, 'oferta_id')
    const oferta = await conn.get(
      'SELECT vagas_total FROM ofertas WHERE id = ?',
      [ofertaIdNormalizado],
    )
    if (!oferta) throw new NotFoundError('Oferta não encontrada')

    return Number(oferta.vagas_total) - await this.contarOcupantes(ofertaIdNormalizado, conn)
  }

  async listarPorOferta(ofertaId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const rows = await conn.all(
      `SELECT * FROM reservas WHERE oferta_id = ? ORDER BY id ASC`,
      [inteiroObrigatorio(ofertaId, 'oferta_id')],
    )
    return rows.map(mapearLinha)
  }

  async listarPorPassageiro(passageiroId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const rows = await conn.all(
      `SELECT * FROM reservas WHERE passageiro_id = ? ORDER BY id DESC`,
      [inteiroObrigatorio(passageiroId, 'passageiro_id')],
    )
    return rows.map(mapearLinha)
  }

  async atualizar(id, dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const atualizacao = normalizarAtualizacaoReserva(dados)
    const campos = Object.keys(atualizacao)

    if (campos.length === 0) return this.buscarPorId(id, conn)

    const reservaAtual = await this.buscarPorId(id, conn)
    if (!reservaAtual) return null
    if (atualizacao.status !== undefined) {
      validarTransicao(reservaAtual.status, atualizacao.status)
    }

    const atualizacoes = campos.map((campo) => `${campo} = ?`).join(', ')
    const valores = campos.map((campo) => atualizacao[campo])

    try {
      await conn.run(
        `UPDATE reservas SET ${atualizacoes} WHERE id = ?`,
        [...valores, inteiroObrigatorio(id, 'id')],
      )
    } catch (error) {
      throw converterErroEscrita(error)
    }

    return this.buscarPorId(id, conn)
  }

  async cancelar(id, natureza = NATUREZAS_CANCELAMENTO.PASSAGEIRO, connection) {
    return this.atualizar(id, {
      status: STATUS.CANCELADA,
      natureza_cancelamento: natureza,
    }, connection)
  }

  async marcarNoShow(id, connection) {
    return this.atualizar(id, {
      status: STATUS.NO_SHOW,
      natureza_cancelamento: null,
    }, connection)
  }
}

export const reservaRepository = new ReservaRepository()
export default ReservaRepository
