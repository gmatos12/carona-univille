import { getConnection } from '../db/connection.js'
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../middlewares/errorHandler.js'

export const PONTOS = Object.freeze({
  UM: 1,
  DOIS: 2,
})

export const PONTOS_EVENTO = Object.freeze({
  CANCELAMENTO_COMUM: 1,
  CANCELAMENTO_MOTORISTA: 1,
  CANCELAMENTO_PASSAGEIRO_MENOS_24H: 1,
  CANCELAMENTO_MOTORISTA_COM_RESERVAS: 1,
  RESERVA_CANCELADA: 1,
  OFERTA_CANCELADA: 1,
  NO_SHOW_PASSAGEIRO: 2,
  AUSENCIA_MOTORISTA: 2,
})

export const TIPOS_EVENTO = Object.freeze({
  RESERVA_CANCELADA: 'RESERVA_CANCELADA',
  OFERTA_CANCELADA: 'OFERTA_CANCELADA',
  CANCELAMENTO_COMUM: 'CANCELAMENTO_COMUM',
  NO_SHOW_PASSAGEIRO: 'NO_SHOW_PASSAGEIRO',
  AUSENCIA_MOTORISTA: 'AUSENCIA_MOTORISTA',
})

export const SEM_BLOQUEIO_AUTOMATICO = true

const REFERENCIAS_PERMITIDAS = Object.freeze(['viagem', 'oferta', 'reserva'])

const NATUREZAS_EXCLUSAO_CONTA = new Set([
  'exclusao_conta',
  'exclusao_de_conta',
  'cancelamento_exclusao_conta',
  'cancelamento_de_exclusao_conta',
  'cancelamento_por_exclusao_conta',
  'cancelamento_por_exclusao_de_conta',
  'conta_excluida',
])

function resolverConexao(connection) {
  return connection || getConnection()
}

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

function inteiroObrigatorio(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new TypeError(`${nome} deve ser um inteiro positivo`)
  }
  return numero
}

function textoObrigatorio(value, nome) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${nome} é obrigatório`)
  }
  return value.trim()
}

function tipoEventoObrigatorio(value) {
  const texto = textoObrigatorio(value, 'tipo_evento').toUpperCase()
  return texto.replace(/[\s-]+/g, '_')
}

function textoParaComparacao(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function ehExclusaoDeConta(value) {
  return NATUREZAS_EXCLUSAO_CONTA.has(textoParaComparacao(value))
}

function validarNaoExclusaoDeConta(dados, tipoEvento, motivo) {
  const valores = [
    dados?.natureza,
    dados?.natureza_cancelamento,
    dados?.naturezaCancelamento,
    dados?.tipo_evento,
    dados?.tipoEvento,
    tipoEvento,
    motivo,
  ]

  if (valores.some(ehExclusaoDeConta)) {
    throw new UnprocessableError('Cancelamento por exclusão de conta não gera penalidade')
  }
}

function pontosObrigatorios(tipoEvento) {
  if (!Object.prototype.hasOwnProperty.call(PONTOS_EVENTO, tipoEvento)) {
    throw new TypeError('tipo_evento sem pontuação mapeada')
  }

  const pontos = PONTOS_EVENTO[tipoEvento]
  if (!Object.values(PONTOS).includes(pontos)) {
    throw new TypeError('pontos deve ser 1 ou 2')
  }
  return pontos
}

export function normalizarReferencia(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new TypeError('Penalidade inválida')
  }

  const referenciaDireta = primeiroDefinido(dados.referencia, dados.referencia_id, dados.referenciaId)
  if (referenciaDireta !== undefined) {
    const texto = textoObrigatorio(String(referenciaDireta), 'referencia')
    const partes = texto.split(':')
    if (partes.length !== 2 || !REFERENCIAS_PERMITIDAS.includes(partes[0])) {
      throw new TypeError('referencia deve usar viagem:, oferta: ou reserva:')
    }
    return `${partes[0]}:${inteiroObrigatorio(partes[1], 'referencia')}`
  }

  const reservaId = primeiroDefinido(dados.reserva_id, dados.reservaId)
  if (reservaId !== undefined) return `reserva:${inteiroObrigatorio(reservaId, 'reserva_id')}`

  const ofertaId = primeiroDefinido(dados.oferta_id, dados.ofertaId)
  if (ofertaId !== undefined) return `oferta:${inteiroObrigatorio(ofertaId, 'oferta_id')}`

  const viagemId = primeiroDefinido(dados.viagem_id, dados.viagemId, dados.ofertaId)
  if (viagemId !== undefined) return `viagem:${inteiroObrigatorio(viagemId, 'viagem_id')}`

  throw new TypeError('referencia é obrigatória')
}

export function normalizarPenalidade(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new TypeError('Penalidade inválida')
  }

  const tipoEvento = tipoEventoObrigatorio(
    primeiroDefinido(dados.tipo_evento, dados.tipoEvento, dados.evento),
  )
  const motivo = textoObrigatorio(
    primeiroDefinido(dados.motivo, dados.motivo_cancelamento, dados.motivoCancelamento, tipoEvento),
    'motivo',
  )

  validarNaoExclusaoDeConta(dados, tipoEvento, motivo)

  return {
    usuario_id: inteiroObrigatorio(
      primeiroDefinido(dados.usuario_id, dados.usuarioId, dados.usuario?.id),
      'usuario_id',
    ),
    pontos: pontosObrigatorios(tipoEvento),
    motivo,
    tipo_evento: tipoEvento,
    referencia: normalizarReferencia(dados),
  }
}

function mapearLinha(row) {
  return row ? { ...row } : null
}

function converterErroEscrita(error) {
  const mensagem = String(error?.message ?? '').toLowerCase()

  if (mensagem.includes('cancelamento por exclusao de conta nao gera penalidade')) {
    return new UnprocessableError('Cancelamento por exclusão de conta não gera penalidade')
  }
  if (mensagem.includes('foreign key')) {
    return new NotFoundError('Usuário não encontrado')
  }
  if (mensagem.includes('unique')) {
    return new ConflictError('Já existe penalidade com esses dados')
  }
  if (mensagem.includes('check constraint') || mensagem.includes('not null')) {
    return new ValidationError('Penalidade não atende às regras de negócio')
  }
  return error
}

export class PenalidadeRepository {
  constructor(connection) {
    this.connection = connection
  }

  async criar(dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const penalidade = normalizarPenalidade(dados)

    try {
      const resultado = await conn.run(
        `INSERT INTO penalidades (usuario_id, pontos, motivo, tipo_evento, referencia)
         VALUES (?, ?, ?, ?, ?)`,
        [
          penalidade.usuario_id,
          penalidade.pontos,
          penalidade.motivo,
          penalidade.tipo_evento,
          penalidade.referencia,
        ],
      )
      return await this.buscarPorId(resultado.lastID, conn)
    } catch (error) {
      throw converterErroEscrita(error)
    }
  }

  async buscarPorId(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get('SELECT * FROM penalidades WHERE id = ?', [
      inteiroObrigatorio(id, 'id'),
    ])
    return mapearLinha(row)
  }

  async listarPorUsuario(usuarioId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const rows = await conn.all(
      'SELECT * FROM penalidades WHERE usuario_id = ? ORDER BY criado_em DESC, id DESC',
      [inteiroObrigatorio(usuarioId, 'usuario_id')],
    )
    return rows.map(mapearLinha)
  }

  async listarPorReferencia(referencia, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const texto = textoObrigatorio(String(referencia), 'referencia')
    const partes = texto.split(':')
    if (partes.length !== 2 || !REFERENCIAS_PERMITIDAS.includes(partes[0])) {
      throw new TypeError('referencia deve usar viagem:, oferta: ou reserva:')
    }

    const rows = await conn.all(
      'SELECT * FROM penalidades WHERE referencia = ? ORDER BY criado_em DESC, id DESC',
      [`${partes[0]}:${inteiroObrigatorio(partes[1], 'referencia')}`],
    )
    return rows.map(mapearLinha)
  }

  async totalPontos(usuarioId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      'SELECT COALESCE(SUM(pontos), 0) AS total FROM penalidades WHERE usuario_id = ?',
      [inteiroObrigatorio(usuarioId, 'usuario_id')],
    )
    return Number(row?.total ?? 0)
  }
}

export const penalidadeRepository = new PenalidadeRepository()
export default PenalidadeRepository
