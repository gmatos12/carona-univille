import { getConnection } from '../db/connection.js'

const CAMPOS_VEICULO = `id, usuario_id, marca, modelo, cor, placa, ano,
  capacidade_passageiros, criado_em`

const CAMPOS_EDITAVEIS = Object.freeze([
  'marca',
  'modelo',
  'cor',
  'placa',
  'ano',
  'capacidade_passageiros',
])

const ALIASES = Object.freeze({
  capacidadePassageiros: 'capacidade_passageiros',
})

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

function inteiroNaoNegativo(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero < 0) {
    throw new TypeError(`${nome} deve ser um inteiro não negativo`)
  }
  return numero
}

function textoObrigatorio(value, nome) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${nome} é obrigatório`)
  }
  return value.trim()
}

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

export function normalizarVeiculo(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new TypeError('Dados de veículo inválidos')
  }

  return {
    marca: textoObrigatorio(primeiroDefinido(dados.marca), 'marca'),
    modelo: textoObrigatorio(primeiroDefinido(dados.modelo), 'modelo'),
    cor: textoObrigatorio(primeiroDefinido(dados.cor), 'cor'),
    placa: textoObrigatorio(primeiroDefinido(dados.placa), 'placa'),
    ano: inteiroObrigatorio(primeiroDefinido(dados.ano), 'ano'),
    capacidade_passageiros: inteiroObrigatorio(
      primeiroDefinido(dados.capacidade_passageiros, dados.capacidadePassageiros),
      'capacidade_passageiros',
    ),
  }
}

export function normalizarAtualizacao(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new TypeError('Dados de atualização inválidos')
  }

  const alteracoes = {}
  for (const [chave, valor] of Object.entries(dados)) {
    const campo = ALIASES[chave] ?? chave
    if (!CAMPOS_EDITAVEIS.includes(campo)) continue

    if (campo === 'ano' || campo === 'capacidade_passageiros') {
      alteracoes[campo] = inteiroObrigatorio(valor, campo)
    } else {
      alteracoes[campo] = textoObrigatorio(valor, campo)
    }
  }

  return alteracoes
}

function normalizarFiltros(filtros = {}) {
  if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) {
    throw new TypeError('Filtros inválidos')
  }

  const normalizados = {}
  const placa = filtros.placa
  if (placa !== undefined && placa !== null && placa !== '') {
    normalizados.placa = textoOpcional(placa, 'placa')
  }

  const limite = inteiroNaoNegativo(filtros.limit ?? filtros.limite ?? 100, 'limit')
  normalizados.limit = Math.min(limite, 500)

  const offset = inteiroNaoNegativo(filtros.offset ?? 0, 'offset')
  normalizados.offset = offset

  return normalizados
}

function textoOpcional(value, nome) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new TypeError(`${nome} deve ser texto`)
  return value.trim() || null
}

function construirWhere(filtros) {
  const clauses = []
  const params = []

  if (filtros.placa !== undefined && filtros.placa !== null) {
    clauses.push('placa = ?')
    params.push(filtros.placa)
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function mapearLinha(row) {
  return row ? { ...row } : null
}

export class VeiculoRepository {
  constructor(connection) {
    this.connection = connection
  }

  async criar(usuarioId, dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const motoristaId = inteiroObrigatorio(usuarioId, 'usuario_id')
    const normalizado = normalizarVeiculo(dados)

    const resultado = await conn.run(
      `INSERT INTO veiculos
        (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        motoristaId,
        normalizado.marca,
        normalizado.modelo,
        normalizado.cor,
        normalizado.placa,
        normalizado.ano,
        normalizado.capacidade_passageiros,
      ],
    )
    return this.buscarPorId(resultado.lastID, motoristaId, conn)
  }

  async buscarPorId(id, usuarioId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT ${CAMPOS_VEICULO} FROM veiculos
       WHERE id = ? AND usuario_id = ?`,
      [inteiroObrigatorio(id, 'id'), inteiroObrigatorio(usuarioId, 'usuario_id')],
    )
    return mapearLinha(row)
  }

  async pertenceA(id, usuarioId, connection) {
    return Boolean(await this.buscarPorId(id, usuarioId, connection))
  }

  async listarPorUsuario(usuarioId, filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const motoristaId = inteiroObrigatorio(usuarioId, 'usuario_id')
    const normalizados = normalizarFiltros(filtros)
    const { where, params } = construirWhere(normalizados)
    const prefixo = where ? 'AND' : 'WHERE'

    const rows = await conn.all(
      `SELECT ${CAMPOS_VEICULO} FROM veiculos
       ${where} ${prefixo} usuario_id = ?
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, motoristaId, normalizados.limit, normalizados.offset],
    )
    return rows.map(mapearLinha)
  }

  async contarPorUsuario(usuarioId, filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const motoristaId = inteiroObrigatorio(usuarioId, 'usuario_id')
    const normalizados = normalizarFiltros(filtros)
    const { where, params } = construirWhere(normalizados)
    const prefixo = where ? 'AND' : 'WHERE'

    const row = await conn.get(
      `SELECT COUNT(*) AS total FROM veiculos
       ${where} ${prefixo} usuario_id = ?`,
      [...params, motoristaId],
    )
    return Number(row?.total ?? 0)
  }

  async atualizar(id, usuarioId, dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const veiculoId = inteiroObrigatorio(id, 'id')
    const motoristaId = inteiroObrigatorio(usuarioId, 'usuario_id')
    const atual = await this.buscarPorId(veiculoId, motoristaId, conn)
    if (!atual) return null

    const alteracoes = normalizarAtualizacao(dados)
    const campos = Object.keys(alteracoes)
    if (campos.length === 0) return atual

    await conn.run(
      `UPDATE veiculos SET ${campos.map((campo) => `${campo} = ?`).join(', ')}
       WHERE id = ? AND usuario_id = ?`,
      [...campos.map((campo) => alteracoes[campo]), veiculoId, motoristaId],
    )
    return this.buscarPorId(veiculoId, motoristaId, conn)
  }

  async excluir(id, usuarioId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const resultado = await conn.run('DELETE FROM veiculos WHERE id = ? AND usuario_id = ?', [
      inteiroObrigatorio(id, 'id'),
      inteiroObrigatorio(usuarioId, 'usuario_id'),
    ])
    return resultado.changes > 0
  }

  async capacidade(veiculoId, usuarioId, connection) {
    const veiculo = await this.buscarPorId(veiculoId, usuarioId, connection)
    if (!veiculo) return null
    return Number(veiculo.capacidade_passageiros)
  }

  async validarVagas(veiculoId, vagas, usuarioId, connection) {
    const quantidade = inteiroObrigatorio(vagas, 'vagas')
    const capacidade = usuarioId === undefined || usuarioId === null
      ? await this.capacidadeSemDono(veiculoId, connection)
      : await this.capacidade(veiculoId, usuarioId, connection)

    if (capacidade === null) throw new TypeError('veículo não encontrado')
    if (quantidade > capacidade) {
      throw new TypeError('vagas_total excede capacidade_passageiros do veiculo')
    }

    return { capacidade_passageiros: capacidade, vagas: quantidade }
  }

  async capacidadeSemDono(veiculoId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      'SELECT capacidade_passageiros FROM veiculos WHERE id = ?',
      [inteiroObrigatorio(veiculoId, 'veiculo_id')],
    )
    return row ? Number(row.capacidade_passageiros) : null
  }

  async podeVerPlaca(ofertaId, usuarioId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const oferta = await conn.get(
      `SELECT o.motorista_id, v.usuario_id AS veiculo_usuario_id
       FROM ofertas o
       JOIN veiculos v ON v.id = o.veiculo_id
       WHERE o.id = ?`,
      [inteiroObrigatorio(ofertaId, 'oferta_id')],
    )
    if (!oferta) return false

    const usuario = inteiroObrigatorio(usuarioId, 'usuario_id')
    if (Number(oferta.motorista_id) === usuario) return true
    if (Number(oferta.veiculo_usuario_id) === usuario) return true

    const reserva = await conn.get(
      `SELECT 1 FROM reservas
       WHERE oferta_id = ? AND passageiro_id = ? AND status = 'CONFIRMADA'`,
      [inteiroObrigatorio(ofertaId, 'oferta_id'), usuario],
    )
    return Boolean(reserva)
  }
}

export const veiculoRepository = new VeiculoRepository()

export default VeiculoRepository
