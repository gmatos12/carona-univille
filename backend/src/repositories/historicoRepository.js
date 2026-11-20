import { getConnection } from '../db/connection.js'

export const ENTIDADES_PERMITIDAS = Object.freeze([
  'usuario',
  'veiculo',
  'recorrencia',
  'oferta',
  'reserva',
  'penalidade',
  'avaliacao',
])

export const NATUREZAS = Object.freeze({
  CRIACAO_OFERTA: 'CRIACAO_OFERTA',
  EDICAO_OFERTA: 'EDICAO_OFERTA',
  RESERVA_CONFIRMADA: 'RESERVA_CONFIRMADA',
  CANCELAMENTO_COMUM: 'CANCELAMENTO_COMUM',
  CANCELAMENTO_EXCLUSAO_CONTA: 'CANCELAMENTO_EXCLUSAO_CONTA',
  NO_SHOW_PASSAGEIRO: 'NO_SHOW_PASSAGEIRO',
  AUSENCIA_MOTORISTA: 'AUSENCIA_MOTORISTA',
  INICIO_VIAGEM: 'INICIO_VIAGEM',
  CONCLUSAO_VIAGEM: 'CONCLUSAO_VIAGEM',
  CONTA_EXCLUIDA: 'CONTA_EXCLUIDA',
  PENALIDADE_REGISTRADA: 'PENALIDADE_REGISTRADA',
  AVALIACAO_REGISTRADA: 'AVALIACAO_REGISTRADA',
})

export const TIPOS_EVENTO = Object.freeze({
  OFERTA_CRIADA: 'OFERTA_CRIADA',
  OFERTA_EDITADA: 'OFERTA_EDITADA',
  OFERTA_CANCELADA: 'OFERTA_CANCELADA',
  RESERVA_CRIADA: 'RESERVA_CRIADA',
  RESERVA_CANCELADA: 'RESERVA_CANCELADA',
  NO_SHOW_PASSAGEIRO: 'NO_SHOW_PASSAGEIRO',
  AUSENCIA_MOTORISTA: 'AUSENCIA_MOTORISTA',
  VIAGEM_INICIADA: 'VIAGEM_INICIADA',
  VIAGEM_CONCLUIDA: 'VIAGEM_CONCLUIDA',
  CONTA_EXCLUIDA: 'CONTA_EXCLUIDA',
  PENALIDADE_REGISTRADA: 'PENALIDADE_REGISTRADA',
  AVALIACAO_REGISTRADA: 'AVALIACAO_REGISTRADA',
})

const CHAVES_SENSIVEIS = new Set([
  'senha',
  'password',
  'passwd',
  'token',
  'access_token',
  'refresh_token',
  'jwt',
  'authorization',
])

function textoObrigatorio(value, nome) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${nome} é obrigatório`)
  }
  return value.trim()
}

function textoOpcional(value, nome) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new TypeError(`${nome} deve ser texto`)
  return value.trim() || null
}

function inteiroObrigatorio(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new TypeError(`${nome} deve ser um inteiro positivo`)
  }
  return numero
}

function inteiroOpcional(value, nome) {
  if (value === undefined || value === null || value === '') return null
  return inteiroObrigatorio(value, nome)
}

function naoNegativoOpcional(value, nome) {
  if (value === undefined || value === null || value === '') return null
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero < 0) {
    throw new TypeError(`${nome} deve ser um inteiro não negativo`)
  }
  return numero
}

function sanitizarDetalhes(value) {
  if (Array.isArray(value)) return value.map(sanitizarDetalhes)
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [chave, item]) => {
      if (CHAVES_SENSIVEIS.has(chave.toLowerCase())) return acc
      acc[chave] = sanitizarDetalhes(item)
      return acc
    }, {})
  }
  return value
}

function normalizarDetalhes(detalhes) {
  if (detalhes === undefined || detalhes === null) return {}

  if (typeof detalhes === 'string') {
    try {
      const parsed = JSON.parse(detalhes)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TypeError('detalhes devem ser um objeto')
      }
      return parsed
    } catch {
      throw new TypeError('detalhes devem ser um objeto JSON válido')
    }
  }

  if (typeof detalhes !== 'object' || Array.isArray(detalhes)) {
    throw new TypeError('detalhes devem ser um objeto')
  }
  return detalhes
}

export function normalizarEvento(evento) {
  if (!evento || typeof evento !== 'object' || Array.isArray(evento)) {
    throw new TypeError('Evento de histórico inválido')
  }

  const entidadeTipo = textoObrigatorio(evento.entidadeTipo ?? evento.entidade_tipo, 'entidade_tipo')
  if (!ENTIDADES_PERMITIDAS.includes(entidadeTipo)) {
    throw new TypeError('entidade_tipo inválido')
  }

  return {
    tipo_evento: textoObrigatorio(evento.tipoEvento ?? evento.tipo_evento, 'tipo_evento'),
    entidade_tipo: entidadeTipo,
    entidade_id: inteiroObrigatorio(evento.entidadeId ?? evento.entidade_id, 'entidade_id'),
    ator_usuario_id: inteiroOpcional(evento.atorUsuarioId ?? evento.ator_usuario_id, 'ator_usuario_id'),
    natureza: textoOpcional(evento.natureza, 'natureza'),
    detalhes: JSON.stringify(sanitizarDetalhes(normalizarDetalhes(evento.detalhes))),
  }
}

export function normalizarFiltros(filtros = {}) {
  if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) {
    throw new TypeError('Filtros inválidos')
  }

  const normalizados = {}
  const entidadeTipo = textoOpcional(filtros.entidadeTipo ?? filtros.entidade_tipo, 'entidade_tipo')
  if (entidadeTipo !== null) {
    if (!ENTIDADES_PERMITIDAS.includes(entidadeTipo)) throw new TypeError('entidade_tipo inválido')
    normalizados.entidadeTipo = entidadeTipo
  }

  const entidadeId = inteiroOpcional(filtros.entidadeId ?? filtros.entidade_id, 'entidade_id')
  if (entidadeId !== null) normalizados.entidadeId = entidadeId

  const atorUsuarioId = inteiroOpcional(filtros.atorUsuarioId ?? filtros.ator_usuario_id, 'ator_usuario_id')
  if (atorUsuarioId !== null) normalizados.atorUsuarioId = atorUsuarioId

  const tipoEvento = textoOpcional(filtros.tipoEvento ?? filtros.tipo_evento, 'tipo_evento')
  if (tipoEvento !== null) normalizados.tipoEvento = tipoEvento

  const natureza = textoOpcional(filtros.natureza, 'natureza')
  if (natureza !== null) normalizados.natureza = natureza

  const dataInicio = textoOpcional(filtros.dataInicio ?? filtros.data_inicio, 'data_inicio')
  if (dataInicio !== null) normalizados.dataInicio = dataInicio

  const dataFim = textoOpcional(filtros.dataFim ?? filtros.data_fim, 'data_fim')
  if (dataFim !== null) normalizados.dataFim = dataFim

  const limite = naoNegativoOpcional(filtros.limit ?? filtros.limite, 'limit')
  normalizados.limit = limite === null ? 100 : Math.min(limite, 500)

  const offset = naoNegativoOpcional(filtros.offset, 'offset')
  normalizados.offset = offset === null ? 0 : offset

  return normalizados
}

function mapearLinha(row) {
  if (!row) return null
  let detalhes = {}

  try {
    const parsed = JSON.parse(row.detalhes || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) detalhes = parsed
  } catch {
    detalhes = {}
  }

  return { ...row, detalhes }
}

function construirWhere(filtros) {
  const clauses = []
  const params = []

  if (filtros.entidadeTipo) {
    clauses.push('entidade_tipo = ?')
    params.push(filtros.entidadeTipo)
  }
  if (filtros.entidadeId !== undefined) {
    clauses.push('entidade_id = ?')
    params.push(filtros.entidadeId)
  }
  if (filtros.atorUsuarioId !== undefined) {
    clauses.push('ator_usuario_id = ?')
    params.push(filtros.atorUsuarioId)
  }
  if (filtros.tipoEvento) {
    clauses.push('tipo_evento = ?')
    params.push(filtros.tipoEvento)
  }
  if (filtros.natureza) {
    clauses.push('natureza = ?')
    params.push(filtros.natureza)
  }
  if (filtros.dataInicio) {
    clauses.push('criado_em >= ?')
    params.push(filtros.dataInicio)
  }
  if (filtros.dataFim) {
    clauses.push('criado_em <= ?')
    params.push(filtros.dataFim)
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

async function resolverConexao(connection) {
  return connection || getConnection()
}

export class HistoricoRepository {
  constructor(connection) {
    this.connection = connection
  }

  async criar(evento, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const dados = normalizarEvento(evento)
    const resultado = await conn.run(
      `INSERT INTO historico_eventos
        (tipo_evento, entidade_tipo, entidade_id, ator_usuario_id, natureza, detalhes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        dados.tipo_evento,
        dados.entidade_tipo,
        dados.entidade_id,
        dados.ator_usuario_id,
        dados.natureza,
        dados.detalhes,
      ],
    )
    return this.buscarPorId(resultado.lastID, conn)
  }

  async buscarPorId(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get('SELECT * FROM historico_eventos WHERE id = ?', [
      inteiroObrigatorio(id, 'id'),
    ])
    return mapearLinha(row)
  }

  async listar(filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const normalizados = normalizarFiltros(filtros)
    const { where, params } = construirWhere(normalizados)
    const rows = await conn.all(
      `SELECT * FROM historico_eventos
       ${where}
       ORDER BY criado_em DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, normalizados.limit, normalizados.offset],
    )
    return rows.map(mapearLinha)
  }

  async listarPorEntidade(entidadeTipo, entidadeId, filtros = {}, connection) {
    return this.listar({
      ...filtros,
      entidadeTipo,
      entidadeId,
    }, connection)
  }

  async listarPorAtor(atorUsuarioId, filtros = {}, connection) {
    return this.listar({
      ...filtros,
      atorUsuarioId,
    }, connection)
  }

  async listarPorTipo(tipoEvento, filtros = {}, connection) {
    return this.listar({
      ...filtros,
      tipoEvento,
    }, connection)
  }

  async contar(filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const { where, params } = construirWhere(normalizarFiltros(filtros))
    const row = await conn.get(`SELECT COUNT(*) AS total FROM historico_eventos ${where}`, params)
    return Number(row?.total ?? 0)
  }
}

export default HistoricoRepository
