import { getConnection } from '../db/connection.js'
import { ConflictError, NotFoundError, ValidationError } from '../middlewares/errorHandler.js'

function resolverConexao(connection) { return connection || getConnection() }
function inteiroObrigatorio(value, nome) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new TypeError(`${nome} deve ser inteiro positivo`)
  return n
}
function notaObrigatoria(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new TypeError('nota deve ser inteiro entre 1 e 5')
  return n
}

export function normalizarAvaliacao(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new TypeError('Avaliação inválida')
  return {
    oferta_id: inteiroObrigatorio(dados.oferta_id ?? dados.ofertaId, 'oferta_id'),
    avaliador_id: inteiroObrigatorio(dados.avaliador_id ?? dados.avaliadorId, 'avaliador_id'),
    avaliado_id: inteiroObrigatorio(dados.avaliado_id ?? dados.avaliadoId, 'avaliado_id'),
    nota: notaObrigatoria(dados.nota),
  }
}

function mapearLinha(row) { return row ? { ...row } : null }
function converterErro(error) {
  const msg = String(error?.message ?? '').toLowerCase()
  if (msg.includes('unique')) return new ConflictError('Avaliação já registrada para este participante')
  if (msg.includes('avaliacao permitida apenas em viagem concluida sem no-show')) {
    return new ConflictError('Avaliação permitida apenas para viagem concluída sem registro de no-show')
  }
  if (msg.includes('foreign key')) return new NotFoundError('Oferta ou usuário não encontrado')
  if (msg.includes('check constraint')) return new ValidationError('Avaliação inválida')
  return error
}

export class AvaliacaoRepository {
  constructor(connection) { this.connection = connection }

  async criar(dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const av = normalizarAvaliacao(dados)
    try {
      const r = await conn.run(
        `INSERT INTO avaliacoes (oferta_id, avaliador_id, avaliado_id, nota)
         VALUES (?, ?, ?, ?)`,
        [av.oferta_id, av.avaliador_id, av.avaliado_id, av.nota],
      )
      return this.buscarPorId(r.lastID, conn)
    } catch (error) { throw converterErro(error) }
  }

  async buscarPorId(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get('SELECT * FROM avaliacoes WHERE id = ?', [inteiroObrigatorio(id, 'id')])
    return mapearLinha(row)
  }

  async buscarPorOfertaEAvaliador(ofertaId, avaliadorId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      'SELECT * FROM avaliacoes WHERE oferta_id = ? AND avaliador_id = ?',
      [inteiroObrigatorio(ofertaId, 'oferta_id'), inteiroObrigatorio(avaliadorId, 'avaliador_id')],
    )
    return mapearLinha(row)
  }

  async existeNoShowNaOferta(ofertaId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      "SELECT 1 AS existe FROM reservas WHERE oferta_id = ? AND status = 'NO_SHOW' LIMIT 1",
      [inteiroObrigatorio(ofertaId, 'oferta_id')],
    )
    return Boolean(row)
  }
}

export const avaliacaoRepository = new AvaliacaoRepository()
export default AvaliacaoRepository
