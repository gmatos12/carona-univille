import { getConnection } from '../db/connection.js'
import {
  buildSearchWindow,
  compareByProximity,
  parseDateTime,
} from '../utils/dateTime.js'
import {
  chavePonto,
  construirPercurso,
  normalizarPercurso,
  percursoContemSegmento,
} from '../utils/percurso.js'

export const ESTADOS = Object.freeze({
  ABERTA: 'ABERTA',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  CONCLUIDA: 'CONCLUIDA',
  CANCELADA: 'CANCELADA',
})

export const SITUACOES = Object.freeze({
  ABERTA: 'ABERTA',
  LOTADA: 'LOTADA',
  AGUARDANDO_INICIO: 'AGUARDANDO_INICIO',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  CONCLUIDA: 'CONCLUIDA',
  CANCELADA: 'CANCELADA',
})

export const NATUREZAS_CANCELAMENTO = Object.freeze({
  COMUM_MOTORISTA: 'comum_motorista',
  EXCLUSAO_CONTA: 'exclusao_conta',
  AUSENCIA_MOTORISTA: 'ausencia_motorista',
})

const CAMPOS_EDITAVEIS = Object.freeze([
  'veiculo_id',
  'recorrencia_id',
  'origem',
  'destino',
  'paradas',
  'data_hora_saida',
  'vagas_total',
  'valor',
  'estado',
  'natureza_cancelamento',
  'iniciada_em',
  'concluida_em',
])

const ALIASES = Object.freeze({
  motoristaId: 'motorista_id',
  veiculoId: 'veiculo_id',
  recorrenciaId: 'recorrencia_id',
  dataHoraSaida: 'data_hora_saida',
  vagas: 'vagas_total',
  naturezaCancelamento: 'natureza_cancelamento',
  iniciadaEm: 'iniciada_em',
  concluidaEm: 'concluida_em',
  percurso: 'paradas',
  pontos: 'paradas',
})

const SQL_RESERVAS_CONFIRMADAS = `(
  SELECT COUNT(*) FROM reservas r
  WHERE r.oferta_id = o.id AND r.status IN ('CONFIRMADA', 'NO_SHOW')
)`

const CAMPOS_OFERTA = `o.*, ${SQL_RESERVAS_CONFIRMADAS} AS reservas_confirmadas`

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
  return textoObrigatorio(value, nome)
}

function inteiroObrigatorio(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new TypeError(`${nome} deve ser um inteiro positivo`)
  }
  return numero
}

function numeroObrigatorio(value, nome) {
  const numero = Number(value)
  if (!Number.isFinite(numero) || numero < 0) {
    throw new TypeError(`${nome} deve ser um número não negativo`)
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

function dataHoraObrigatoria(value, nome) {
  const data = parseDateTime(value)
  if (!data) throw new TypeError(`${nome} inválida`)
  return data.toISOString()
}

function dataHoraOpcional(value, nome) {
  if (value === undefined || value === null || value === '') return null
  return dataHoraObrigatoria(value, nome)
}

function normalizarEstado(value) {
  const estado = textoObrigatorio(String(value), 'estado').toUpperCase()
  if (!Object.values(ESTADOS).includes(estado)) {
    throw new TypeError('estado inválido')
  }
  return estado
}

function listaDePontos(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const analisado = JSON.parse(value)
    return Array.isArray(analisado) ? analisado : []
  } catch {
    return []
  }
}

function normalizarPercursoOferta({ origem, destino, paradas }) {
  const origemNormalizada = textoObrigatorio(origem, 'origem')
  const destinoNormalizado = textoObrigatorio(destino, 'destino')

  if (paradas !== undefined && paradas !== null && paradas !== '') {
    const pontos = normalizarPercurso(paradas)
    const chaveOrigem = chavePonto(origemNormalizada)
    const chaveDestino = chavePonto(destinoNormalizado)
    const indiceOrigem = pontos.findIndex((ponto) => chavePonto(ponto) === chaveOrigem)
    const indiceDestino = pontos.findIndex((ponto) => chavePonto(ponto) === chaveDestino)

    if (indiceOrigem !== -1 && indiceDestino !== -1) {
      if (indiceOrigem >= indiceDestino) {
        throw new TypeError('origem deve vir antes do destino no percurso')
      }
      return pontos
    }

    const intermediarias = pontos.filter((ponto) => (
      chavePonto(ponto) !== chaveOrigem && chavePonto(ponto) !== chaveDestino
    ))
    return normalizarPercurso(construirPercurso(origemNormalizada, intermediarias, destinoNormalizado))
  }

  return normalizarPercurso(construirPercurso(origemNormalizada, [], destinoNormalizado))
}

function normalizarRecorrenciaId(dados) {
  const chave = Object.prototype.hasOwnProperty.call(dados, 'recorrencia_id')
    ? 'recorrencia_id'
    : 'recorrenciaId'
  if (!Object.prototype.hasOwnProperty.call(dados, chave)) return null

  const valor = dados[chave]
  if (valor === null || valor === '') return null
  return inteiroObrigatorio(valor, 'recorrencia_id')
}

export function normalizarOferta(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new TypeError('Dados de oferta inválidos')
  }

  const origem = textoObrigatorio(primeiroDefinido(dados.origem), 'origem')
  const destino = textoObrigatorio(primeiroDefinido(dados.destino), 'destino')
  const paradas = normalizarPercursoOferta({
    origem,
    destino,
    paradas: primeiroDefinido(dados.paradas),
  })

  return {
    motorista_id: inteiroObrigatorio(
      primeiroDefinido(dados.motorista_id, dados.motoristaId),
      'motorista_id',
    ),
    veiculo_id: inteiroObrigatorio(
      primeiroDefinido(dados.veiculo_id, dados.veiculoId),
      'veiculo_id',
    ),
    recorrencia_id: normalizarRecorrenciaId(dados),
    origem,
    destino,
    paradas,
    data_hora_saida: dataHoraObrigatoria(
      primeiroDefinido(dados.data_hora_saida, dados.dataHoraSaida),
      'data_hora_saida',
    ),
    vagas_total: inteiroObrigatorio(
      primeiroDefinido(dados.vagas_total, dados.vagas),
      'vagas_total',
    ),
    valor: numeroObrigatorio(primeiroDefinido(dados.valor, 0), 'valor'),
    estado: normalizarEstado(primeiroDefinido(dados.estado, ESTADOS.ABERTA)),
    natureza_cancelamento: textoOpcional(
      primeiroDefinido(dados.natureza_cancelamento, dados.naturezaCancelamento),
      'natureza_cancelamento',
    ),
    iniciada_em: dataHoraOpcional(
      primeiroDefinido(dados.iniciada_em, dados.iniciadaEm),
      'iniciada_em',
    ),
    concluida_em: dataHoraOpcional(
      primeiroDefinido(dados.concluida_em, dados.concluidaEm),
      'concluida_em',
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

    if (campo === 'paradas') {
      alteracoes[campo] = normalizarPercurso(valor)
    } else if (campo === 'data_hora_saida' || campo === 'iniciada_em' || campo === 'concluida_em') {
      alteracoes[campo] = dataHoraObrigatoria(valor, campo)
    } else if (campo === 'veiculo_id' || campo === 'vagas_total') {
      alteracoes[campo] = inteiroObrigatorio(valor, campo)
    } else if (campo === 'recorrencia_id') {
      alteracoes[campo] = valor === null || valor === '' ? null : inteiroObrigatorio(valor, campo)
    } else if (campo === 'valor') {
      alteracoes[campo] = numeroObrigatorio(valor, campo)
    } else if (campo === 'estado') {
      alteracoes[campo] = normalizarEstado(valor)
    } else if (campo === 'natureza_cancelamento') {
      alteracoes[campo] = textoOpcional(valor, campo)
    } else {
      alteracoes[campo] = textoObrigatorio(valor, campo)
    }
  }

  return alteracoes
}

export function mapearOferta(row, options = {}) {
  if (!row) return null

  const agora = parseDateTime(options.agora) ?? new Date()
  const paradas = normalizarPercursoOferta({
    origem: row.origem,
    destino: row.destino,
    paradas: row.paradas,
  })
  const vagasTotal = Number(row.vagas_total)
  const reservasConfirmadas = row.reservas_confirmadas === undefined
    ? null
    : Number(row.reservas_confirmadas)
  const vagasDisponiveis = reservasConfirmadas === null
    ? null
    : Math.max(0, vagasTotal - reservasConfirmadas)
  const partida = parseDateTime(row.data_hora_saida)
  const antesDaPartida = Boolean(partida && partida.getTime() > agora.getTime())
  const estado = Object.prototype.hasOwnProperty.call(row, 'estado') ? row.estado : ESTADOS.ABERTA

  let situacao
  if (estado === ESTADOS.CANCELADA || estado === ESTADOS.CONCLUIDA || estado === ESTADOS.EM_ANDAMENTO) {
    situacao = estado
  } else if (!antesDaPartida) {
    situacao = SITUACOES.AGUARDANDO_INICIO
  } else if (vagasDisponiveis === 0) {
    situacao = SITUACOES.LOTADA
  } else {
    situacao = SITUACOES.ABERTA
  }

  const visivelNaBusca = estado === ESTADOS.ABERTA && antesDaPartida

  return {
    ...row,
    paradas,
    recorrencia_id: row.recorrencia_id === undefined ? null : row.recorrencia_id,
    recorrente: row.recorrencia_id !== undefined && row.recorrencia_id !== null,
    vagas_total: vagasTotal,
    valor: Number(row.valor),
    reservas_confirmadas: reservasConfirmadas,
    vagas_disponiveis: vagasDisponiveis,
    situacao,
    visivel_na_busca: visivelNaBusca,
    aceita_reservas: visivelNaBusca && situacao !== SITUACOES.LOTADA
      && (vagasDisponiveis === null || vagasDisponiveis > 0),
  }
}

function normalizarFiltros(filtros = {}) {
  if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) {
    throw new TypeError('Filtros inválidos')
  }

  const normalizados = {}
  for (const [chave, valor] of Object.entries(filtros)) {
    const campo = ALIASES[chave] ?? chave
    if (['motorista_id', 'veiculo_id', 'recorrencia_id'].includes(campo)
      && valor !== undefined && valor !== null && valor !== '') {
      normalizados[campo] = inteiroObrigatorio(valor, campo)
    }
  }

  if (filtros.somenteAvulsas === true || filtros.somente_avulsas === true) {
    normalizados.somenteAvulsas = true
  }

  const estado = primeiroDefinido(filtros.estado)
  if (estado !== undefined && estado !== null && estado !== '') {
    normalizados.estado = normalizarEstado(estado)
  }

  const estados = primeiroDefinido(filtros.estados)
  if (Array.isArray(estados)) {
    if (estados.length === 0) throw new TypeError('estados deve conter ao menos um estado')
    normalizados.estados = estados.map(normalizarEstado)
  }

  for (const [chave, campo] of [
    ['dataInicio', 'dataInicio'],
    ['data_inicio', 'dataInicio'],
    ['dataFim', 'dataFim'],
    ['data_fim', 'dataFim'],
    ['partidaApos', 'partidaApos'],
    ['partidaAte', 'partidaAte'],
  ]) {
    const valor = filtros[chave]
    if (valor !== undefined && valor !== null && valor !== '') {
      normalizados[campo] = dataHoraObrigatoria(valor, chave)
    }
  }

  const participanteId = primeiroDefinido(filtros.participante_id, filtros.participanteId)
  if (participanteId !== undefined && participanteId !== null) {
    normalizados.participanteId = inteiroObrigatorio(participanteId, 'participante_id')
  }

  if (filtros.visiveisNaBusca === true || filtros.visiveis_na_busca === true) {
    normalizados.visiveisNaBusca = true
  }

  const limite = inteiroNaoNegativo(filtros.limit ?? filtros.limite ?? 100, 'limit')
  normalizados.limit = Math.min(limite, 500)
  normalizados.offset = inteiroNaoNegativo(filtros.offset ?? 0, 'offset')
  normalizados.agora = parseDateTime(filtros.agora) ?? new Date()

  const colunasOrdenaveis = ['data_hora_saida', 'id', 'criado_em', 'vagas_total', 'valor']
  const ordem = filtros.orderBy ?? filtros.ordem ?? 'data_hora_saida'
  normalizados.orderBy = colunasOrdenaveis.includes(ordem) ? ordem : 'data_hora_saida'
  normalizados.direcao = String(filtros.direcao ?? filtros.order ?? 'ASC').toUpperCase() === 'DESC'
    ? 'DESC'
    : 'ASC'

  return normalizados
}

function construirWhere(filtros) {
  const clauses = []
  const params = []

  if (filtros.motorista_id !== undefined) {
    clauses.push('o.motorista_id = ?')
    params.push(filtros.motorista_id)
  }
  if (filtros.veiculo_id !== undefined) {
    clauses.push('o.veiculo_id = ?')
    params.push(filtros.veiculo_id)
  }
  if (filtros.recorrencia_id !== undefined) {
    clauses.push('o.recorrencia_id = ?')
    params.push(filtros.recorrencia_id)
  }
  if (filtros.somenteAvulsas) {
    clauses.push('o.recorrencia_id IS NULL')
  }
  if (filtros.estado !== undefined) {
    clauses.push('o.estado = ?')
    params.push(filtros.estado)
  }
  if (filtros.estados !== undefined) {
    clauses.push(`o.estado IN (${filtros.estados.map(() => '?').join(', ')})`)
    params.push(...filtros.estados)
  }
  if (filtros.dataInicio !== undefined) {
    clauses.push('o.data_hora_saida >= ?')
    params.push(filtros.dataInicio)
  }
  if (filtros.dataFim !== undefined) {
    clauses.push('o.data_hora_saida <= ?')
    params.push(filtros.dataFim)
  }
  if (filtros.partidaApos !== undefined) {
    clauses.push('o.data_hora_saida > ?')
    params.push(filtros.partidaApos)
  }
  if (filtros.partidaAte !== undefined) {
    clauses.push('o.data_hora_saida < ?')
    params.push(filtros.partidaAte)
  }
  if (filtros.participanteId !== undefined) {
    clauses.push(`(
      o.motorista_id = ?
      OR EXISTS (
        SELECT 1 FROM reservas r
        WHERE r.oferta_id = o.id
          AND r.passageiro_id = ?
          AND r.status IN ('CONFIRMADA', 'NO_SHOW')
      )
    )`)
    params.push(filtros.participanteId, filtros.participanteId)
  }
  if (filtros.visiveisNaBusca) {
    clauses.push("o.estado = 'ABERTA'")
    clauses.push('o.data_hora_saida > ?')
    params.push(filtros.agora.toISOString())
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function erroDeUnicidade(error) {
  return /UNIQUE constraint failed/i.test(String(error?.message ?? ''))
}

export class OfertaRepository {
  constructor(connection) {
    this.connection = connection
  }

  async criar(motoristaId, dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const normalizado = normalizarOferta({ ...dados, motorista_id: motoristaId })

    const resultado = await conn.run(
      `INSERT INTO ofertas
        (motorista_id, veiculo_id, recorrencia_id, origem, destino, paradas,
         data_hora_saida, vagas_total, valor, estado, natureza_cancelamento,
         iniciada_em, concluida_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizado.motorista_id,
        normalizado.veiculo_id,
        normalizado.recorrencia_id,
        normalizado.origem,
        normalizado.destino,
        JSON.stringify(normalizado.paradas),
        normalizado.data_hora_saida,
        normalizado.vagas_total,
        normalizado.valor,
        normalizado.estado,
        normalizado.natureza_cancelamento,
        normalizado.iniciada_em,
        normalizado.concluida_em,
      ],
    )
    return this.buscarPorId(resultado.lastID, conn)
  }

  async criarAvulsa(motoristaId, dados, connection) {
    return this.criar(motoristaId, { ...dados, recorrencia_id: null }, connection)
  }

  async criarOcorrencia(dados, connection) {
    return this.criar(dados?.motorista_id ?? dados?.motoristaId, dados, connection)
  }

  async buscarPorId(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT ${CAMPOS_OFERTA} FROM ofertas o WHERE o.id = ?`,
      [inteiroObrigatorio(id, 'id')],
    )
    return mapearOferta(row)
  }

  async existe(id, connection) {
    return Boolean(await this.buscarPorId(id, connection))
  }

  async buscarOcorrencia(recorrenciaId, dataHoraSaida, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT ${CAMPOS_OFERTA} FROM ofertas o
       WHERE o.recorrencia_id = ? AND o.data_hora_saida = ?`,
      [
        inteiroObrigatorio(recorrenciaId, 'recorrencia_id'),
        dataHoraObrigatoria(dataHoraSaida, 'data_hora_saida'),
      ],
    )
    return mapearOferta(row)
  }

  async criarOcorrenciaRecorrente(dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const recorrenciaId = inteiroObrigatorio(
      primeiroDefinido(dados?.recorrencia_id, dados?.recorrenciaId),
      'recorrencia_id',
    )
    const dataHoraSaida = dataHoraObrigatoria(
      primeiroDefinido(dados?.data_hora_saida, dados?.dataHoraSaida),
      'data_hora_saida',
    )
    const existente = await this.buscarOcorrencia(recorrenciaId, dataHoraSaida, conn)
    if (existente) return existente

    try {
      return await this.criar(dados?.motorista_id ?? dados?.motoristaId, {
        ...dados,
        recorrencia_id: recorrenciaId,
        data_hora_saida: dataHoraSaida,
      }, conn)
    } catch (error) {
      if (!erroDeUnicidade(error)) throw error
      return this.buscarOcorrencia(recorrenciaId, dataHoraSaida, conn)
    }
  }

  async listar(filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const normalizados = normalizarFiltros(filtros)
    const { where, params } = construirWhere(normalizados)
    const rows = await conn.all(
      `SELECT ${CAMPOS_OFERTA} FROM ofertas o
       ${where}
       ORDER BY o.${normalizados.orderBy} ${normalizados.direcao}, o.id ASC
       LIMIT ? OFFSET ?`,
      [...params, normalizados.limit, normalizados.offset],
    )
    return rows.map((row) => mapearOferta(row, { agora: normalizados.agora }))
  }

  async contar(filtros = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const { where, params } = construirWhere(normalizarFiltros(filtros))
    const row = await conn.get(`SELECT COUNT(*) AS total FROM ofertas o ${where}`, params)
    return Number(row?.total ?? 0)
  }

  async listarPorMotorista(motoristaId, filtros = {}, connection) {
    return this.listar({ ...filtros, motorista_id: motoristaId }, connection)
  }

  async listarPorVeiculo(veiculoId, filtros = {}, connection) {
    return this.listar({ ...filtros, veiculo_id: veiculoId }, connection)
  }

  async listarPorRecorrencia(recorrenciaId, filtros = {}, connection) {
    return this.listar({ ...filtros, recorrencia_id: recorrenciaId }, connection)
  }

  async listarAvulsas(filtros = {}, connection) {
    return this.listar({ ...filtros, somenteAvulsas: true }, connection)
  }

  async atualizar(id, dados, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const ofertaId = inteiroObrigatorio(id, 'id')
    const atual = await conn.get('SELECT * FROM ofertas WHERE id = ?', [ofertaId])
    if (!atual) return null

    const alteracoes = normalizarAtualizacao(dados)
    const pontosAtuais = listaDePontos(atual.paradas)
    if (
      alteracoes.paradas === undefined
      && (alteracoes.origem !== undefined || alteracoes.destino !== undefined)
      && pontosAtuais.length >= 2
    ) {
      const pontos = [...pontosAtuais]
      pontos[0] = alteracoes.origem ?? atual.origem
      pontos[pontos.length - 1] = alteracoes.destino ?? atual.destino
      alteracoes.paradas = pontos
    }

    const mesclados = {
      motorista_id: atual.motorista_id,
      veiculo_id: primeiroDefinido(alteracoes.veiculo_id, atual.veiculo_id),
      recorrencia_id: Object.prototype.hasOwnProperty.call(alteracoes, 'recorrencia_id')
        ? alteracoes.recorrencia_id
        : atual.recorrencia_id,
      origem: primeiroDefinido(alteracoes.origem, atual.origem),
      destino: primeiroDefinido(alteracoes.destino, atual.destino),
      paradas: primeiroDefinido(alteracoes.paradas, pontosAtuais),
      data_hora_saida: primeiroDefinido(alteracoes.data_hora_saida, atual.data_hora_saida),
      vagas_total: primeiroDefinido(alteracoes.vagas_total, atual.vagas_total),
      valor: primeiroDefinido(alteracoes.valor, atual.valor),
      estado: primeiroDefinido(alteracoes.estado, atual.estado),
      natureza_cancelamento: Object.prototype.hasOwnProperty.call(alteracoes, 'natureza_cancelamento')
        ? alteracoes.natureza_cancelamento
        : atual.natureza_cancelamento,
      iniciada_em: Object.prototype.hasOwnProperty.call(alteracoes, 'iniciada_em')
        ? alteracoes.iniciada_em
        : atual.iniciada_em,
      concluida_em: Object.prototype.hasOwnProperty.call(alteracoes, 'concluida_em')
        ? alteracoes.concluida_em
        : atual.concluida_em,
    }
    const normalizado = normalizarOferta(mesclados)

    await conn.run(
      `UPDATE ofertas SET
        veiculo_id = ?, recorrencia_id = ?, origem = ?, destino = ?, paradas = ?,
        data_hora_saida = ?, vagas_total = ?, valor = ?, estado = ?,
        natureza_cancelamento = ?, iniciada_em = ?, concluida_em = ?
       WHERE id = ?`,
      [
        normalizado.veiculo_id,
        normalizado.recorrencia_id,
        normalizado.origem,
        normalizado.destino,
        JSON.stringify(normalizado.paradas),
        normalizado.data_hora_saida,
        normalizado.vagas_total,
        normalizado.valor,
        normalizado.estado,
        normalizado.natureza_cancelamento,
        normalizado.iniciada_em,
        normalizado.concluida_em,
        ofertaId,
      ],
    )
    return this.buscarPorId(ofertaId, conn)
  }

  async atualizarEstado(id, estado, detalhes = {}, connection) {
    return this.atualizar(id, { estado, ...detalhes }, connection)
  }

  async iniciar(id, connection) {
    return this.atualizarEstado(id, ESTADOS.EM_ANDAMENTO, {
      iniciada_em: new Date().toISOString(),
    }, connection)
  }

  async concluir(id, connection) {
    return this.atualizarEstado(id, ESTADOS.CONCLUIDA, {
      concluida_em: new Date().toISOString(),
    }, connection)
  }

  async cancelar(id, natureza = NATUREZAS_CANCELAMENTO.COMUM_MOTORISTA, connection) {
    return this.atualizarEstado(id, ESTADOS.CANCELADA, {
      natureza_cancelamento: natureza,
    }, connection)
  }

  async contarReservasConfirmadas(id, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const row = await conn.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND status IN ('CONFIRMADA', 'NO_SHOW')`,
      [inteiroObrigatorio(id, 'id')],
    )
    return Number(row?.total ?? 0)
  }

  async vagasDisponiveis(id, connection) {
    const oferta = await this.buscarPorId(id, connection)
    return oferta?.vagas_disponiveis ?? null
  }

  async situacao(id, connection) {
    const oferta = await this.buscarPorId(id, connection)
    return oferta?.situacao ?? null
  }

  async visivelNaBusca(id, connection) {
    const oferta = await this.buscarPorId(id, connection)
    return Boolean(oferta?.visivel_na_busca)
  }

  async podeReservar(id, connection) {
    const oferta = await this.buscarPorId(id, connection)
    return Boolean(oferta?.aceita_reservas)
  }

  async eParticipante(id, usuarioId, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const ofertaId = inteiroObrigatorio(id, 'id')
    const usuario = inteiroObrigatorio(usuarioId, 'usuario_id')
    const row = await conn.get(
      `SELECT 1 FROM ofertas o
       WHERE o.id = ?
         AND (
           o.motorista_id = ?
           OR EXISTS (
             SELECT 1 FROM reservas r
             WHERE r.oferta_id = o.id
               AND r.passageiro_id = ?
               AND r.status IN ('CONFIRMADA', 'NO_SHOW')
           )
         )`,
      [ofertaId, usuario, usuario],
    )
    return Boolean(row)
  }

  async listarParaBusca(criterios = {}, connection) {
    const conn = await resolverConexao(connection || this.connection)
    const origem = textoObrigatorio(criterios.origem, 'origem')
    const destino = textoObrigatorio(criterios.destino, 'destino')
    const janela = buildSearchWindow(
      criterios.data,
      criterios.horario,
      criterios.janelaMinutos ?? 30,
    )
    const agora = parseDateTime(criterios.agora) ?? new Date()

    const rows = await conn.all(
      `SELECT ${CAMPOS_OFERTA} FROM ofertas o
       WHERE o.estado = 'ABERTA'
         AND o.data_hora_saida >= ?
         AND o.data_hora_saida <= ?
         AND o.data_hora_saida > ?
       ORDER BY o.data_hora_saida ASC, o.id ASC`,
      [janela.inicio.toISOString(), janela.fim.toISOString(), agora.toISOString()],
    )

    return rows
      .map((row) => mapearOferta(row, { agora }))
      .filter((oferta) => percursoContemSegmento(oferta.paradas, origem, destino))
      .sort((esquerda, direita) => compareByProximity(esquerda, direita, janela.target, {
        getValue: (oferta) => oferta.data_hora_saida,
        getVagas: (oferta) => oferta.vagas_disponiveis ?? 0,
      }))
  }
}

export const ofertaRepository = new OfertaRepository()

export default OfertaRepository
