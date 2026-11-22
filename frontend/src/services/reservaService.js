import api from './api.js'

export function extrairReserva(resposta) {
  const alvo = resposta?.data ?? resposta
  return alvo?.reserva ?? alvo ?? null
}

export function mensagemErroReserva(error, fallback = 'Não foi possível concluir a reserva.') {
  const detalhes = error?.details
  if (Array.isArray(detalhes)) {
    const mensagens = detalhes
      .map((detalhe) => detalhe?.message ?? detalhe?.msg)
      .filter((mensagem) => typeof mensagem === 'string' && mensagem.trim())
    if (mensagens.length > 0) return mensagens.join(' ')
  }

  const mensagem = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : ''
  const status = error?.status ?? error?.statusCode

  if (status === 401) return mensagem || 'Entre na sua conta para reservar.'
  if (status === 409) return mensagem || 'Não foi possível reservar esta vaga.'
  return mensagem || fallback
}

export async function criar(ofertaId) {
  const resposta = await api.post(`/ofertas/${encodeURIComponent(ofertaId)}/reservas`, {})
  return extrairReserva(resposta)
}

export const reservaService = {
  criar,
  reservar: criar,
  extrairReserva,
  mensagemErroReserva,
}

export default reservaService
