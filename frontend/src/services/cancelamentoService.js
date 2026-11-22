import api from './api.js'

export const LIMIAR_PENALIDADE_HORAS = 24
const MILISEGUNDOS_POR_HORA = 60 * 60 * 1000

function corpoDaResposta(resposta) {
  return resposta?.data ?? resposta
}

export function extrairCancelamento(resposta) {
  const corpo = corpoDaResposta(resposta)
  return corpo?.cancelamento ?? corpo ?? null
}

function mensagemDeDetalhes(error) {
  const detalhes = error?.details
  if (!Array.isArray(detalhes)) return ''

  return detalhes
    .map((detalhe) => detalhe?.message ?? detalhe?.msg)
    .filter((mensagem) => typeof mensagem === 'string' && mensagem.trim())
    .join(' ')
}

export function mensagemErroCancelamento(error, fallback = 'Não foi possível cancelar.') {
  const detalhes = mensagemDeDetalhes(error)
  if (detalhes) return detalhes

  const mensagem = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : ''
  const status = error?.status ?? error?.statusCode

  if (status === 401) return mensagem || 'Entre na sua conta para cancelar.'
  if (status === 403) return mensagem || 'Somente o participante da viagem pode cancelá-la.'
  if (status === 409) return mensagem || 'Não foi possível cancelar: a viagem ou reserva não está mais ativa.'
  if (status === 404) return mensagem || 'Viagem ou reserva não encontrada.'
  return mensagem || fallback
}

export async function cancelarReserva(reservaId) {
  const resposta = await api.post(`/reservas/${encodeURIComponent(reservaId)}/cancelar`, {})
  return extrairCancelamento(resposta)
}

export async function cancelarOferta(ofertaId) {
  const resposta = await api.post(`/ofertas/${encodeURIComponent(ofertaId)}/cancelar`, {})
  return extrairCancelamento(resposta)
}

export function horasAtePartida(dataHoraSaida, agora = new Date()) {
  const partida = new Date(dataHoraSaida)
  const instante = new Date(agora)
  if (Number.isNaN(partida.getTime()) || Number.isNaN(instante.getTime())) return null
  return (partida.getTime() - instante.getTime()) / MILISEGUNDOS_POR_HORA
}

export function podeCancelarPassageiro(dataHoraSaida, agora = new Date()) {
  const horas = horasAtePartida(dataHoraSaida, agora)
  return horas !== null && horas > 0
}

export function pontosCancelamentoPassageiro(dataHoraSaida, agora = new Date()) {
  const horas = horasAtePartida(dataHoraSaida, agora)
  if (horas === null || horas <= 0) return null
  return horas >= LIMIAR_PENALIDADE_HORAS ? 0 : 1
}

export function pontosCancelamentoMotorista(reservasConfirmadas) {
  const total = Number(reservasConfirmadas)
  return Number.isFinite(total) && total > 0 ? 1 : 0
}

export function mensagemPrazoCancelamento(dataHoraSaida, agora = new Date()) {
  const horas = horasAtePartida(dataHoraSaida, agora)
  if (horas === null) return 'Não foi possível verificar o prazo deste cancelamento.'
  if (horas <= 0) return 'O cancelamento não é permitido a partir do horário previsto.'
  if (horas < LIMIAR_PENALIDADE_HORAS) {
    return 'Faltam menos de 24 horas para a saída: cancelar gera 1 ponto de penalidade.'
  }
  return 'Com pelo menos 24 horas de antecedência, o cancelamento não gera penalidade.'
}

export function mensagemPenalidadeMotorista(reservasConfirmadas) {
  return pontosCancelamentoMotorista(reservasConfirmadas) > 0
    ? 'Esta oferta tem reservas ativas: cancelar gera 1 ponto de penalidade ao motorista.'
    : 'Esta oferta não tem reservas ativas: cancelar não gera penalidade.'
}

export function mensagemSucessoCancelamentoReserva(resposta) {
  const cancelamento = extrairCancelamento(resposta)
  const pontos = Number(cancelamento?.pontos ?? 0)
  return pontos > 0
    ? 'Reserva cancelada com 1 ponto de penalidade. A vaga foi liberada e sua conta permanece ativa.'
    : 'Reserva cancelada sem penalidade. A vaga foi liberada e sua conta permanece ativa.'
}

export function mensagemSucessoCancelamentoOferta(resposta) {
  const cancelamento = extrairCancelamento(resposta)
  const pontos = Number(cancelamento?.pontos ?? 0)
  const reservas = Number(
    cancelamento?.reservas_canceladas ?? cancelamento?.reservas?.length ?? 0,
  )

  if (pontos <= 0) {
    return 'Oferta cancelada sem penalidade ao motorista. Sua conta permanece ativa.'
  }

  return `Oferta cancelada e ${reservas} reserva(s) cancelada(s). O motorista recebeu 1 ponto de penalidade e sua conta permanece ativa.`
}

export const cancelamentoService = {
  LIMIAR_PENALIDADE_HORAS,
  cancelarReserva,
  cancelarOferta,
  extrairCancelamento,
  mensagemErroCancelamento,
  horasAtePartida,
  podeCancelarPassageiro,
  pontosCancelamentoPassageiro,
  pontosCancelamentoMotorista,
  mensagemPrazoCancelamento,
  mensagemPenalidadeMotorista,
  mensagemSucessoCancelamentoReserva,
  mensagemSucessoCancelamentoOferta,
}

export default cancelamentoService
