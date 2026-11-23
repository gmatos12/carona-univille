import api from './api.js'

export function extrairAvaliacao(resposta) {
  const alvo = resposta?.data ?? resposta
  return alvo?.avaliacao ?? alvo ?? null
}

export function mensagemErroAvaliacao(error, fallback = 'Não foi possível registrar a avaliação.') {
  const detalhes = error?.details
  if (Array.isArray(detalhes)) {
    const msgs = detalhes.map((d) => d?.message ?? d?.msg).filter((m) => typeof m === 'string' && m.trim())
    if (msgs.length > 0) return msgs.join(' ')
  }
  const msg = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : ''
  const status = error?.status ?? error?.statusCode
  if (status === 401) return msg || 'Entre na sua conta para avaliar.'
  if (status === 403) return msg || 'Você não pode avaliar esta viagem.'
  if (status === 409) return msg || 'Avaliação não permitida para esta viagem.'
  return msg || fallback
}

export async function avaliarOferta(ofertaId, { avaliadoId, nota }) {
  const resposta = await api.post(`/ofertas/${encodeURIComponent(ofertaId)}/avaliacoes`, {
    avaliado_id: avaliadoId,
    nota: Number(nota),
  })
  return extrairAvaliacao(resposta)
}

export async function iniciarOferta(ofertaId) {
  const resposta = await api.post(`/ofertas/${encodeURIComponent(ofertaId)}/iniciar`, {})
  return resposta?.oferta ?? resposta?.data?.oferta ?? resposta
}

export async function concluirOferta(ofertaId) {
  const resposta = await api.post(`/ofertas/${encodeURIComponent(ofertaId)}/concluir`, {})
  return resposta?.oferta ?? resposta?.data?.oferta ?? resposta
}

export async function informarAusenciaMotorista(ofertaId) {
  const resposta = await api.post(`/ofertas/${encodeURIComponent(ofertaId)}/ausencia-motorista`, {})
  return resposta?.data ?? resposta
}

export async function registrarNoShowReserva(reservaId) {
  const resposta = await api.post(`/reservas/${encodeURIComponent(reservaId)}/no-show`, {})
  return resposta?.data ?? resposta
}

export const avaliacaoService = {
  avaliarOferta,
  extrairAvaliacao,
  mensagemErroAvaliacao,
  iniciarOferta,
  concluirOferta,
  informarAusenciaMotorista,
  registrarNoShowReserva,
}

export default avaliacaoService
