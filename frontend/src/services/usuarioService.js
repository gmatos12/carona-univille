import api from './api.js'
import { setUser } from '../state/auth.js'

export function extrairPerfil(resposta) {
  return resposta?.perfil ?? resposta?.usuario ?? resposta ?? null
}

export function extrairPerfilPublico(resposta) {
  return resposta?.perfil ?? resposta?.publico ?? resposta ?? null
}

export function urlFotoPerfil(caminho) {
  if (!caminho) return null

  const valor = String(caminho)
  if (/^(https?:)?\/\//i.test(valor) || valor.startsWith('data:') || valor.startsWith('/')) {
    return valor
  }

  const nomeArquivo = valor.split(/[\\/]/).filter(Boolean).pop()
  if (!nomeArquivo) return null

  const base = String(api.baseURL ?? '').replace(/\/api\/?$/, '')
  return `${base}/uploads/${encodeURIComponent(nomeArquivo)}`
}

function dadosEditaveis(dados = {}) {
  return {
    nome_completo: String(dados.nome_completo ?? '').trim(),
    email_institucional: String(dados.email_institucional ?? '').trim(),
    telefone: String(dados.telefone ?? '').trim(),
  }
}

function sincronizarUsuario(perfil) {
  if (perfil?.id !== undefined && perfil?.id !== null) setUser(perfil)
  return perfil
}

export function formularioFoto(arquivo, campo = 'foto') {
  if (typeof FormData !== 'undefined' && arquivo instanceof FormData) return arquivo

  const dados = new FormData()
  dados.append(campo, arquivo)
  return dados
}

export async function obterPerfil() {
  const resposta = await api.get('/me')
  return sincronizarUsuario(extrairPerfil(resposta))
}

export async function atualizarPerfil(dados) {
  const resposta = await api.put('/me', dadosEditaveis(dados))
  return sincronizarUsuario(extrairPerfil(resposta))
}

export async function enviarFoto(arquivo) {
  const resposta = await api.post('/me/foto', formularioFoto(arquivo))
  return sincronizarUsuario(extrairPerfil(resposta))
}

export async function removerFoto() {
  const resposta = await api.delete('/me/foto')
  return sincronizarUsuario(extrairPerfil(resposta))
}

export async function perfilPublico(usuarioId) {
  if (usuarioId === undefined || usuarioId === null) return null
  const resposta = await api.get(`/usuarios/${encodeURIComponent(usuarioId)}/perfil-publico`)
  return extrairPerfilPublico(resposta)
}

export const usuarioService = {
  obterPerfil,
  getPerfil: obterPerfil,
  me: obterPerfil,
  atualizarPerfil,
  updatePerfil: atualizarPerfil,
  enviarFoto,
  uploadFoto: enviarFoto,
  adicionarFoto: enviarFoto,
  removerFoto,
  excluirFoto: removerFoto,
  deleteFoto: removerFoto,
  perfilPublico,
  buscarPerfilPublico: perfilPublico,
  getPerfilPublico: perfilPublico,
  extrairPerfil,
  extrairPerfilPublico,
  urlFotoPerfil,
  formularioFoto,
}

export default usuarioService
