import api from './api.js'

export const JANELA_DIAS = 15

function corpoDaResposta(resposta) {
  return resposta?.data ?? resposta
}

function mensagensDeDetalhes(error) {
  const detalhes = error?.details
  if (!Array.isArray(detalhes)) return ''

  return detalhes
    .map((detalhe) => detalhe?.message ?? detalhe?.msg)
    .filter((mensagem) => typeof mensagem === 'string' && mensagem.trim())
    .join(' ')
}

export function extrairRecorrencias(resposta) {
  const corpo = corpoDaResposta(resposta)
  if (Array.isArray(corpo)) return corpo
  if (Array.isArray(corpo?.recorrencias)) return corpo.recorrencias
  if (Array.isArray(corpo?.resultados)) return corpo.resultados
  return []
}

export function extrairRecorrencia(resposta) {
  const corpo = corpoDaResposta(resposta)
  return corpo?.recorrencia ?? corpo ?? null
}

export function extrairGeracao(resposta) {
  const corpo = corpoDaResposta(resposta)
  return {
    geradas: Number(corpo?.geradas ?? 0),
    existentes: Number(corpo?.existentes ?? 0),
    ofertas: Array.isArray(corpo?.ofertas) ? corpo.ofertas : [],
  }
}

export function normalizarDiasSemana(valor) {
  let dias = valor
  if (typeof dias === 'string') {
    try {
      dias = JSON.parse(dias)
    } catch {
      dias = dias.split(/[,\s]+/).filter(Boolean)
    }
  }
  if (!Array.isArray(dias)) return []

  const normalizados = dias
    .map((dia) => Number(dia))
    .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6)

  return [...new Set(normalizados)].sort((left, right) => left - right)
}

function mesmaParada(left, right) {
  return String(left ?? '').trim().toLocaleLowerCase('pt-BR')
    === String(right ?? '').trim().toLocaleLowerCase('pt-BR')
}

export function normalizarParadas(dados = {}) {
  const origem = String(dados.origem ?? '').trim()
  const destino = String(dados.destino ?? '').trim()
  let valor = dados.paradas

  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor)
    } catch {
      valor = []
    }
  }

  const intermediarias = (Array.isArray(valor) ? valor : [])
    .map((ponto) => String(ponto ?? '').trim())
    .filter((ponto) => (
      ponto && !mesmaParada(ponto, origem) && !mesmaParada(ponto, destino)
    ))

  return [origem, ...intermediarias, destino].filter(Boolean)
}

export function normalizarHorario(valor) {
  const horario = String(valor ?? '').trim()
  const partes = horario.match(/^(\d{1,2}):(\d{2})/)
  if (!partes) return horario
  return `${partes[1].padStart(2, '0')}:${partes[2]}`
}

export function normalizarRecorrencia(dados = {}) {
  const veiculoId = dados.veiculo_id ?? dados.veiculoId ?? dados.veiculo?.id
  const vagas = dados.vagas ?? dados.vagas_total ?? dados.vagasTotal
  const valor = dados.valor ?? 0

  return {
    veiculo_id: veiculoId,
    dias_semana: normalizarDiasSemana(dados.dias_semana ?? dados.diasSemana),
    horario: normalizarHorario(dados.horario),
    origem: String(dados.origem ?? '').trim(),
    destino: String(dados.destino ?? '').trim(),
    paradas: normalizarParadas(dados),
    vagas: vagas === '' || vagas === null || vagas === undefined ? null : Number(vagas),
    valor: valor === '' || valor === null || valor === undefined ? 0 : Number(valor),
    ativa: dados.ativa ?? dados.ativo ?? true,
    janela_dias: JANELA_DIAS,
  }
}

function identificadorRecorrencia(valor) {
  if (valor && typeof valor === 'object') {
    return valor.id ?? valor.recorrencia_id ?? valor.recorrenciaId
  }
  return valor
}

export function mensagemErroRecorrencia(error, fallback = 'Não foi possível salvar a recorrência.') {
  const detalhes = mensagensDeDetalhes(error)
  if (detalhes) return detalhes

  const mensagem = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : ''
  const status = error?.status ?? error?.statusCode

  if (status === 400) return mensagem || 'Revise os dados informados.'
  if (status === 401) return mensagem || 'Entre na sua conta para gerenciar recorrências.'
  if (status === 403) return mensagem || 'Você não tem permissão para alterar esta recorrência.'
  if (status === 404) return mensagem || 'Recorrência ou veículo não encontrado.'
  if (status === 409) return mensagem || 'Não foi possível criar a recorrência com esses dados.'
  return mensagem || fallback
}

export async function criar(dados) {
  const resposta = await api.post('/recorrencias', normalizarRecorrencia(dados))
  return extrairRecorrencia(resposta)
}

export async function alterar(id, dados) {
  const resposta = await api.put(
    `/recorrencias/${encodeURIComponent(identificadorRecorrencia(id))}`,
    normalizarRecorrencia(dados),
  )
  return extrairRecorrencia(resposta)
}

export async function interromper(id) {
  const resposta = await api.post(
    `/recorrencias/${encodeURIComponent(identificadorRecorrencia(id))}/interromper`,
    {},
  )
  return extrairRecorrencia(resposta)
}

export const recorrenciaService = {
  JANELA_DIAS,
  criar,
  create: criar,
  alterar,
  update: alterar,
  interromper,
  stop: interromper,
  extrairRecorrencias,
  extrairRecorrencia,
  extrairGeracao,
  normalizarRecorrencia,
  normalizarDiasSemana,
  normalizarParadas,
  normalizarHorario,
  mensagemErroRecorrencia,
}

export default recorrenciaService
