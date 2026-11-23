import api from './api.js'

export function extrairOfertas(resposta) {
  if (Array.isArray(resposta)) return resposta
  return resposta?.resultados
    ?? resposta?.ofertas
    ?? resposta?.data?.resultados
    ?? resposta?.data?.ofertas
    ?? []
}

export function extrairOferta(resposta) {
  return resposta?.oferta ?? resposta?.data?.oferta ?? resposta ?? null
}

export function combinarDataHora(data, horario) {
  if (!data || !horario) return ''
  const [ano, mes, dia] = String(data).split('-').map(Number)
  const [hora, minuto] = String(horario).split(':').map(Number)
  if (!ano || !mes || !dia || Number.isNaN(hora) || Number.isNaN(minuto)) return ''
  return new Date(ano, mes - 1, dia, hora, minuto, 0, 0).toISOString()
}

export function dividirDataHora(valor) {
  if (!valor) return { data: '', horario: '' }
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return { data: '', horario: '' }

  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  const hora = String(data.getHours()).padStart(2, '0')
  const minuto = String(data.getMinutes()).padStart(2, '0')
  return { data: `${ano}-${mes}-${dia}`, horario: `${hora}:${minuto}` }
}

export function mensagemErroOferta(error, fallback = 'Não foi possível concluir a operação.') {
  const detalhes = error?.details
  if (Array.isArray(detalhes)) {
    const mensagens = detalhes
      .map((detalhe) => detalhe?.message ?? detalhe?.msg)
      .filter((mensagem) => typeof mensagem === 'string' && mensagem.trim())
    if (mensagens.length > 0) return mensagens.join(' ')
  }

  return typeof error?.message === 'string' && error.message.trim()
    ? error.message
    : fallback
}

function identificador(oferta) {
  return oferta?.id ?? oferta?.oferta_id ?? oferta?.ofertaId
}

export function normalizarOferta(dados = {}) {
  const origem = String(dados.origem ?? '').trim()
  const destino = String(dados.destino ?? '').trim()
  const paradas = Array.isArray(dados.paradas)
    ? dados.paradas.map((ponto) => String(ponto ?? '').trim()).filter(Boolean)
    : []

  let data_hora_saida = dados.data_hora_saida ?? dados.dataHoraSaida ?? ''
  if (!data_hora_saida && dados.data && dados.horario) {
    data_hora_saida = combinarDataHora(dados.data, dados.horario)
  }

  return {
    veiculo_id: dados.veiculo_id ?? dados.veiculoId,
    origem,
    destino,
    paradas: paradas.length > 0 ? paradas : [origem, destino].filter(Boolean),
    data_hora_saida,
    vagas_total: dados.vagas_total ?? dados.vagas,
    valor: dados.valor ?? 0,
  }
}

export async function listar() {
  const resposta = await api.get('/ofertas')
  return extrairOfertas(resposta)
}

export async function buscar(filtros = {}) {
  const resposta = await api.get('/ofertas/busca', { params: filtros })
  return extrairOfertas(resposta)
}

export async function buscarPorId(ofertaId) {
  const resposta = await api.get(`/ofertas/${encodeURIComponent(ofertaId)}`)
  return extrairOferta(resposta)
}

export async function criar(dados) {
  const resposta = await api.post('/ofertas', normalizarOferta(dados))
  return extrairOferta(resposta)
}

export async function atualizar(ofertaId, dados) {
  const resposta = await api.put(
    `/ofertas/${encodeURIComponent(ofertaId)}`,
    normalizarOferta(dados),
  )
  return extrairOferta(resposta)
}

export const ofertaService = {
  listar,
  listarTodas: listar,
  buscar,
  search: buscar,
  buscarPorId,
  getById: buscarPorId,
  criar,
  create: criar,
  atualizar,
  update: atualizar,
  extrairOfertas,
  extrairOferta,
  normalizarOferta,
  mensagemErroOferta,
  combinarDataHora,
  dividirDataHora,
}

export default ofertaService
