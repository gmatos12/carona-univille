import { getConnection } from '../db/connection.js'
import { construirPercurso, normalizarPercurso } from '../utils/percurso.js'

function connOf(connection) { return connection || getConnection() }
function texto(value, nome) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${nome} é obrigatório`)
  return value.trim()
}
function inteiroPositivo(value, nome) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new TypeError(`${nome} deve ser inteiro positivo`)
  return n
}
function numeroNaoNegativo(value, nome) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new TypeError(`${nome} deve ser não negativo`)
  return n
}
function horarioValido(value) {
  const v = texto(value, 'horario')
  if (!/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.test(v)) throw new TypeError('horario inválido')
  const [h, m] = v.split(':')
  return `${h}:${m}`
}
function diasSemanaValidos(value) {
  const arr = Array.isArray(value) ? value : (typeof value === 'string' ? JSON.parse(value) : null)
  if (!Array.isArray(arr) || arr.length === 0) throw new TypeError('dias_semana inválido')
  const norm = [...new Set(arr.map((d) => {
    const n = Number(d)
    if (!Number.isInteger(n) || n < 0 || n > 6) throw new TypeError('dias_semana inválido')
    return n
  }))].sort((a, b) => a - b)
  return norm
}
function normalizarParadas(origem, destino, paradas) {
  const o = texto(origem, 'origem')
  const d = texto(destino, 'destino')
  if (paradas === undefined || paradas === null || paradas === '') {
    return { origem: o, destino: d, paradas: normalizarPercurso(construirPercurso(o, [], d)) }
  }
  const pontos = Array.isArray(paradas) ? normalizarPercurso(paradas) : normalizarPercurso(JSON.parse(paradas))
  if (pontos.length < 2) return { origem: o, destino: d, paradas: normalizarPercurso(construirPercurso(o, [], d)) }
  return { origem: pontos[0], destino: pontos[pontos.length - 1], paradas: pontos }
}

export function normalizarRecorrencia(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new TypeError('Recorrência inválida')
  const origem = dados.origem
  const destino = dados.destino
  const percurso = normalizarParadas(origem, destino, dados.paradas)
  return {
    motorista_id: inteiroPositivo(dados.motorista_id ?? dados.motoristaId, 'motorista_id'),
    veiculo_id: inteiroPositivo(dados.veiculo_id ?? dados.veiculoId, 'veiculo_id'),
    dias_semana: diasSemanaValidos(dados.dias_semana ?? dados.diasSemana),
    horario: horarioValido(dados.horario),
    origem: percurso.origem,
    destino: percurso.destino,
    paradas: percurso.paradas,
    vagas: inteiroPositivo(dados.vagas ?? dados.vagas_total ?? dados.vagasTotal, 'vagas'),
    valor: numeroNaoNegativo(dados.valor ?? 0, 'valor'),
    ativa: (dados.ativa ?? dados.ativo ?? true) ? 1 : 0,
    janela_dias: 15,
  }
}

function mapear(row) {
  if (!row) return null
  return {
    ...row,
    dias_semana: typeof row.dias_semana === 'string' ? JSON.parse(row.dias_semana) : row.dias_semana,
    paradas: typeof row.paradas === 'string' ? JSON.parse(row.paradas) : row.paradas,
    ativa: Boolean(row.ativa),
    janela_dias: Number(row.janela_dias ?? 15),
    vagas: Number(row.vagas),
    valor: Number(row.valor),
  }
}

export class RecorrenciaRepository {
  constructor(connection) { this.connection = connection }

  async criar(dados, connection) {
    const conn = connOf(connection || this.connection)
    const r = normalizarRecorrencia(dados)
    const result = await conn.run(
      `INSERT INTO recorrencias (motorista_id, veiculo_id, dias_semana, horario, origem, destino, paradas, vagas, valor, ativa, janela_dias)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.motorista_id, r.veiculo_id, JSON.stringify(r.dias_semana), r.horario, r.origem, r.destino, JSON.stringify(r.paradas), r.vagas, r.valor, r.ativa, r.janela_dias],
    )
    return this.buscarPorId(result.lastID, conn)
  }

  async buscarPorId(id, connection) {
    const conn = connOf(connection || this.connection)
    const row = await conn.get('SELECT * FROM recorrencias WHERE id = ?', [inteiroPositivo(id, 'id')])
    return mapear(row)
  }

  async listarAtivas(connection) {
    const conn = connOf(connection || this.connection)
    const rows = await conn.all('SELECT * FROM recorrencias WHERE ativa = 1 ORDER BY id ASC')
    return rows.map(mapear)
  }

  async atualizar(id, dados, connection) {
    const conn = connOf(connection || this.connection)
    const atual = await this.buscarPorId(id, conn)
    if (!atual) return null
    const merged = normalizarRecorrencia({ ...atual, ...dados, motorista_id: atual.motorista_id, id: atual.id })
    await conn.run(
      `UPDATE recorrencias SET veiculo_id=?, dias_semana=?, horario=?, origem=?, destino=?, paradas=?, vagas=?, valor=?, ativa=?, janela_dias=15 WHERE id=?`,
      [merged.veiculo_id, JSON.stringify(merged.dias_semana), merged.horario, merged.origem, merged.destino, JSON.stringify(merged.paradas), merged.vagas, merged.valor, merged.ativa, inteiroPositivo(id, 'id')],
    )
    return this.buscarPorId(id, conn)
  }

  async interromper(id, connection) {
    const conn = connOf(connection || this.connection)
    await conn.run('UPDATE recorrencias SET ativa = 0 WHERE id = ?', [inteiroPositivo(id, 'id')])
    return this.buscarPorId(id, conn)
  }
}

export const recorrenciaRepository = new RecorrenciaRepository()
export default RecorrenciaRepository
