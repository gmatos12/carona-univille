import { getConnection } from '../db/connection.js'

const CAMPOS_USUARIO = `u.id, u.nome_completo, u.matricula, u.email_institucional,
  u.senha_hash, u.telefone, u.foto_perfil_path, u.conta_ativa, u.criado_em, u.atualizado_em`

const CAMPOS_EDITAVEIS = Object.freeze([
  'nome_completo',
  'email_institucional',
  'telefone',
  'foto_perfil_path',
])

const ALIASES = Object.freeze({
  nomeCompleto: 'nome_completo',
  emailInstitucional: 'email_institucional',
  senhaHash: 'senha_hash',
  telefone: 'telefone',
  fotoPerfilPath: 'foto_perfil_path',
  contaAtiva: 'conta_ativa',
})

const SQL_MEDIA_AVALIACOES = `(
  SELECT ROUND(AVG(a.nota), 1)
  FROM avaliacoes a
  WHERE a.avaliado_id = u.id
)`

const SQL_VIAGENS_CONCLUIDAS = `(
  SELECT COUNT(DISTINCT o.id)
  FROM ofertas o
  WHERE o.estado = 'CONCLUIDA'
    AND (
      o.motorista_id = u.id
      OR EXISTS (
        SELECT 1
        FROM reservas r
        WHERE r.oferta_id = o.id
          AND r.passageiro_id = u.id
          AND r.status IN ('CONFIRMADA', 'NO_SHOW')
      )
    )
)`

function resolverConexao(connection) {
  return connection || getConnection()
}

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

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

function inteiroNaoNegativo(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero < 0) {
    throw new TypeError(`${nome} deve ser um inteiro não negativo`)
  }
  return numero
}

function validarEmail(value) {
  const email = textoObrigatorio(value, 'email_institucional')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError('email_institucional inválido')
  }
  return email
}

function interpretarContaAtiva(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'boolean') return value ? 1 : 0
  const numero = Number(value)
  if (!Number.isInteger(numero) || ![0, 1].includes(numero)) {
    throw new TypeError('conta_ativa deve ser booleano ou 0/1')
  }
  return numero
}

export function normalizarUsuario(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new TypeError('Dados de usuário inválidos')
  }

  return {
    nome_completo: textoObrigatorio(
      primeiroDefinido(dados.nome_completo, dados.nomeCompleto),
      'nome_completo',
    ),
    matricula: textoObrigatorio(dados.matricula, 'matricula'),
    email_institucional: validarEmail(
      primeiroDefinido(dados.email_institucional, dados.emailInstitucional),
    ),
    senha_hash: textoObrigatorio(
      primeiroDefinido(dados.senha_hash, dados.senhaHash),
      'senha_hash',
    ),
    telefone: textoObrigatorio(dados.telefone, 'telefone'),
    foto_perfil_path: textoOpcional(
      primeiroDefinido(dados.foto_perfil_path, dados.fotoPerfilPath),
      'foto_perfil_path',
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

    if (campo === 'foto_perfil_path') {
      alteracoes[campo] = textoOpcional(valor, campo)
    } else if (campo === 'email_institucional') {
      alteracoes[campo] = validarEmail(valor)
    } else {
      alteracoes[campo] = textoObrigatorio(valor, campo)
    }
  }

  return alteracoes
}

function mapearLinha(row) {
  return row ? { ...row } : null
}

export function mapearPerfilProprio(row) {
  if (!row) return null
  const { senha_hash, ...perfil } = row
  return perfil
}

export function mapearPerfilPublico(row) {
  if (!row) return null

  const media = row.media_avaliacoes
  return {
    id: Number(row.id),
    nome_completo: row.nome_completo,
    foto_perfil_path: row.foto_perfil_path ?? null,
    media_avaliacoes: media === null || media === undefined ? 'Sem avaliações' : Number(media),
    viagens_concluidas: Number(row.viagens_concluidas ?? 0),
  }
}

function normalizarFiltros(filtros = {}) {
  if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) {
    throw new TypeError('Filtros inválidos')
  }

  const normalizados = {}
  const matricula = textoOpcional(filtros.matricula, 'matricula')
  if (matricula !== null) normalizados.matricula = matricula

  const email = textoOpcional(filtros.email_institucional ?? filtros.emailInstitucional, 'email_institucional')
  if (email !== null) normalizados.email_institucional = email

  const contaAtiva = interpretarContaAtiva(filtros.conta_ativa ?? filtros.contaAtiva)
  if (contaAtiva !== null) normalizados.conta_ativa = contaAtiva

  const busca = textoOpcional(filtros.busca ?? filtros.search, 'busca')
  if (busca !== null) normalizados.busca = busca

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
    clauses.push('u.matricula = ?')
    params.push(filtros.matricula)
  }
  if (filtros.email_institucional !== undefined) {
    clauses.push('LOWER(u.email_institucional) = LOWER(?)')
    params.push(filtros.email_institucional)
  }
  if (filtros.conta_ativa !== undefined) {
    clauses.push('u.conta_ativa = ?')
    params.push(filtros.conta_ativa)
  }
  if (filtros.busca !== undefined) {
    const termo = `%${filtros.busca.toLowerCase()}%`
    clauses.push('(LOWER(u.nome_completo) LIKE ? OR LOWER(u.email_institucional) LIKE ?)')
    params.push(termo, termo)
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export class UsuarioRepository {
  constructor(connection) {
    this.connection = connection
  }

  async criar(dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const normalizado = normalizarUsuario(dados)
    const resultado = await conn.run(
      `INSERT INTO usuarios
        (nome_completo, matricula, email_institucional, senha_hash, telefone, foto_perfil_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        normalizado.nome_completo,
        normalizado.matricula,
        normalizado.email_institucional,
        normalizado.senha_hash,
        normalizado.telefone,
        normalizado.foto_perfil_path,
      ],
    )
    return this.buscarPorId(resultado.lastID, conn)
  }

  async buscarPorId(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT ${CAMPOS_USUARIO} FROM usuarios u WHERE u.id = ?`,
      [inteiroObrigatorio(id, 'id')],
    )
    return mapearLinha(row)
  }

  async buscarPorMatricula(matricula, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT ${CAMPOS_USUARIO} FROM usuarios u WHERE u.matricula = ?`,
      [textoObrigatorio(matricula, 'matricula')],
    )
    return mapearLinha(row)
  }

  async buscarPorEmail(email, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT ${CAMPOS_USUARIO} FROM usuarios u WHERE LOWER(u.email_institucional) = LOWER(?)`,
      [textoObrigatorio(email, 'email_institucional')],
    )
    return mapearLinha(row)
  }

  async existeMatricula(matricula, connection) {
    return Boolean(await this.buscarPorMatricula(matricula, connection))
  }

  async existeEmail(email, connection) {
    return Boolean(await this.buscarPorEmail(email, connection))
  }

  async listar(filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const normalizados = normalizarFiltros(filtros)
    const { where, params } = construirWhere(normalizados)
    const rows = await conn.all(
      `SELECT ${CAMPOS_USUARIO} FROM usuarios u
       ${where}
       ORDER BY u.id ASC
       LIMIT ? OFFSET ?`,
      [...params, normalizados.limit, normalizados.offset],
    )
    return rows.map(mapearLinha)
  }

  async contar(filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const { where, params } = construirWhere(normalizarFiltros(filtros))
    const row = await conn.get(`SELECT COUNT(*) AS total FROM usuarios u ${where}`, params)
    return Number(row?.total ?? 0)
  }

  async atualizar(id, dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const usuarioId = inteiroObrigatorio(id, 'id')
    const atual = await conn.get('SELECT id FROM usuarios WHERE id = ?', [usuarioId])
    if (!atual) return null

    const alteracoes = normalizarAtualizacao(dados)
    const campos = Object.keys(alteracoes)
    if (campos.length === 0) return this.buscarPorId(usuarioId, conn)

    const valores = campos.map((campo) => alteracoes[campo])
    await conn.run(
      `UPDATE usuarios SET ${campos.map((campo) => `${campo} = ?`).join(', ')} WHERE id = ?`,
      [...valores, usuarioId],
    )
    return this.buscarPorId(usuarioId, conn)
  }

  async atualizarFotoPerfil(id, caminho, connection) {
    return this.atualizar(id, { foto_perfil_path: caminho }, connection)
  }

  async removerFotoPerfil(id, connection) {
    return this.atualizar(id, { foto_perfil_path: null }, connection)
  }

  async definirContaAtiva(id, ativa, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const valor = interpretarContaAtiva(ativa)
    if (valor === null) throw new TypeError('ativa deve ser booleano ou 0/1')

    const resultado = await conn.run('UPDATE usuarios SET conta_ativa = ? WHERE id = ?', [
      valor,
      inteiroObrigatorio(id, 'id'),
    ])
    return resultado.changes > 0
  }

  async anonimizar(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const usuarioId = inteiroObrigatorio(id, 'id')
    const atual = await conn.get('SELECT id, conta_ativa FROM usuarios WHERE id = ?', [usuarioId])
    if (!atual) return null
    if (Number(atual.conta_ativa) !== 1) return this.buscarPorId(usuarioId, conn)

    await conn.run(
      `UPDATE usuarios
       SET nome_completo = ?, email_institucional = ?, senha_hash = ?, telefone = ?,
           foto_perfil_path = NULL, conta_ativa = 0
       WHERE id = ?`,
      [
        `Usuario Excluido ${usuarioId}`,
        `excluido-${usuarioId}@anonimizado.invalid`,
        'hash-anonimizado',
        '0000000000',
        usuarioId,
      ],
    )
    return this.buscarPorId(usuarioId, conn)
  }

  async perfilPublico(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT u.id, u.nome_completo, u.foto_perfil_path,
              ${SQL_MEDIA_AVALIACOES} AS media_avaliacoes,
              ${SQL_VIAGENS_CONCLUIDAS} AS viagens_concluidas
       FROM usuarios u
       WHERE u.id = ? AND u.conta_ativa = 1`,
      [inteiroObrigatorio(id, 'id')],
    )
    return mapearPerfilPublico(row)
  }

  async mediaAvaliacoes(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      'SELECT ROUND(AVG(nota), 1) AS media FROM avaliacoes WHERE avaliado_id = ?',
      [inteiroObrigatorio(id, 'id')],
    )
    return row?.media === null || row?.media === undefined ? null : Number(row.media)
  }

  async contarViagensConcluidas(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const usuarioId = inteiroObrigatorio(id, 'id')
    const row = await conn.get(
      `SELECT COUNT(DISTINCT o.id) AS total
       FROM ofertas o
       WHERE o.estado = 'CONCLUIDA'
         AND (
           o.motorista_id = ?
           OR EXISTS (
             SELECT 1 FROM reservas r
             WHERE r.oferta_id = o.id
               AND r.passageiro_id = ?
               AND r.status IN ('CONFIRMADA', 'NO_SHOW')
           )
         )`,
      [usuarioId, usuarioId],
    )
    return Number(row?.total ?? 0)
  }
}

export const usuarioRepository = new UsuarioRepository()

export default UsuarioRepository
