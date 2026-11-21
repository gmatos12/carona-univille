import api from './api.js'

export function extrairVeiculos(resposta) {
  if (Array.isArray(resposta)) return resposta
  return resposta?.veiculos ?? resposta?.data ?? []
}

export function extrairVeiculo(resposta) {
  return resposta?.veiculo ?? resposta?.data?.veiculo ?? resposta ?? null
}

export function normalizarVeiculo(dados = {}) {
  return {
    marca: String(dados.marca ?? '').trim(),
    modelo: String(dados.modelo ?? '').trim(),
    cor: String(dados.cor ?? '').trim(),
    placa: String(dados.placa ?? '').trim(),
    ano: dados.ano,
    capacidade_passageiros: dados.capacidade_passageiros,
  }
}

function identificador(veiculo) {
  return veiculo?.id ?? veiculo?.veiculo_id
}

export async function listar() {
  const resposta = await api.get('/veiculos')
  return extrairVeiculos(resposta)
}

export async function criar(dados) {
  const resposta = await api.post('/veiculos', normalizarVeiculo(dados))
  return extrairVeiculo(resposta)
}

export async function buscarPorId(veiculoId) {
  const resposta = await api.get(`/veiculos/${encodeURIComponent(veiculoId)}`)
  return extrairVeiculo(resposta)
}

export async function atualizar(veiculoId, dados) {
  const resposta = await api.put(
    `/veiculos/${encodeURIComponent(veiculoId)}`,
    normalizarVeiculo(dados),
  )
  return extrairVeiculo(resposta)
}

export async function excluir(veiculo) {
  const veiculoId = typeof veiculo === 'object' ? identificador(veiculo) : veiculo
  await api.delete(`/veiculos/${encodeURIComponent(veiculoId)}`)
  return { ok: true }
}

export const veiculoService = {
  listar,
  list: listar,
  obterTodos: listar,
  criar,
  create: criar,
  cadastrar: criar,
  buscarPorId,
  getById: buscarPorId,
  atualizar,
  update: atualizar,
  excluir,
  remover: excluir,
  delete: excluir,
  extrairVeiculos,
  extrairVeiculo,
  normalizarVeiculo,
}

export default veiculoService
