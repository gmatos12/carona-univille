import { getConnection } from '../db/connection.js'
import { MATRICULAS_AUTORIZADAS_TABLE } from '../db/seeds/matriculasAutorizadas.js'

export { MATRICULAS_AUTORIZADAS_TABLE }

export function normalizarMatricula(value, nome = 'matricula') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${nome} é obrigatória`)
  }
  return value.trim()
}

function resolverConexao(connection) {
  return connection || getConnection()
}

function textoOpcional(value, nome) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new TypeError(`${nome} deve ser texto`)
  return value.trim() || null
}

function inteiroNaoNegativo(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero < 0) {
    throw new TypeError(`${nome} deve ser um inteiro não negativo`)
  }
  return numero
}

function interpretarUtilizada(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'boolean') return value ? 1 : 0
  const numero = Number(value)
  if (!Number.isInteger(numero) || ![0, 1].includes(numero)) {
    throw new TypeError('utilizada deve ser booleano ou 0/1')
  }
  return numero
}

function normalizarFiltros(filtros = {}) {
  if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) {
    throw new TypeError('Filtros inválidos')
  }

  const normalizados = {}
  const matricula = textoOpcional(filtros.matricula, 'matricula')
  if (matricula !== null) normalizados.matricula = normalizarMatricula(matricula)

  const utilizada = interpretarUtilizada(filtros.utilizada ?? filtros.utilizado)
  if (utilizada !== null) normalizados.utilizada = utilizada

  if (filtros.disponivel === true) normalizados.utilizada = 0
  if (filtros.disponivel === false) normalizados.utilizada = 1

  const limite = inteiroNaoNegativo(filtros.limit ?? filtros.limite ?? 100, 'limit')
  normalizados.limit = Math.min(limite, 500)

  const offset = inteiroNaoNegativo(filtros.offset ?? 0, 'offset')
  normalizados.offset = offset

  return normalizados
}

function construirWhere(filtros) {
  const clauses = []
  const params = []

  if (filtros.matricula !== undefined) {
    clauses.push('matricula = ?')
    params.push(filtros.matricula)
  }
  if (filtros.utilizada !== undefined) {
    clauses.push('utilizada = ?')
    params.push(filtros.utilizada)
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export class MatriculaRepository {
  constructor(connection) {
    this.connection = connection
  }

  async buscarPorMatricula(matricula, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT matricula, utilizada FROM ${MATRICULAS_AUTORIZADAS_TABLE} WHERE matricula = ?`,
      [normalizarMatricula(matricula)],
    )
    return row ?? null
  }

  async existe(matricula, connection) {
    return Boolean(await this.buscarPorMatricula(matricula, connection))
  }

  async estaDisponivel(matricula, connection) {
    const row = await this.buscarPorMatricula(matricula, connection)
    return Boolean(row && Number(row.utilizada) === 0)
  }

  async validarDisponivel(matricula, connection) {
    const normalizada = normalizarMatricula(matricula)
    const row = await this.buscarPorMatricula(normalizada, connection)

    if (!row) throw new TypeError('matricula não autorizada')
    if (Number(row.utilizada) !== 0) throw new TypeError('matricula já utilizada')

    return normalizada
  }

  async listar(filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const normalizados = normalizarFiltros(filtros)
    const { where, params } = construirWhere(normalizados)
    const rows = await conn.all(
      `SELECT matricula, utilizada FROM ${MATRICULAS_AUTORIZADAS_TABLE}
       ${where}
       ORDER BY matricula ASC
       LIMIT ? OFFSET ?`,
      [...params, normalizados.limit, normalizados.offset],
    )
    return rows
  }

  async listarDisponiveis(connection) {
    return this.listar({ disponivel: true }, connection)
  }

  async marcarUtilizada(matricula, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const resultado = await conn.run(
      `UPDATE ${MATRICULAS_AUTORIZADAS_TABLE} SET utilizada = 1
       WHERE matricula = ? AND utilizada = 0`,
      [normalizarMatricula(matricula)],
    )
    return resultado.changes > 0
  }

  async marcarDisponivel(matricula, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const resultado = await conn.run(
      `UPDATE ${MATRICULAS_AUTORIZADAS_TABLE} SET utilizada = 0 WHERE matricula = ?`,
      [normalizarMatricula(matricula)],
    )
    return resultado.changes > 0
  }

  async contar(filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const { where, params } = construirWhere(normalizarFiltros(filtros))
    const row = await conn.get(
      `SELECT COUNT(*) AS total FROM ${MATRICULAS_AUTORIZADAS_TABLE} ${where}`,
      params,
    )
    return Number(row?.total ?? 0)
  }
}

export const matriculaRepository = new MatriculaRepository()

export default MatriculaRepository
