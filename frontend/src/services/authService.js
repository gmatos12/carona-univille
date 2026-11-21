import api from './api.js'
import {
  getCurrentUser,
  getSession,
  isAuthenticated,
  login as salvarSessao,
  logout as limparSessao,
  refresh as atualizarSessao,
  setUser as salvarUsuario,
} from '../state/auth.js'

export function normalizarCadastro(dados = {}) {
  return {
    nome_completo: String(dados.nome_completo ?? '').trim(),
    matricula: String(dados.matricula ?? '').trim(),
    email_institucional: String(dados.email_institucional ?? '').trim(),
    senha: String(dados.senha ?? ''),
    telefone: String(dados.telefone ?? '').trim(),
  }
}

export function normalizarCredenciais(dados = {}) {
  return {
    email_institucional: String(dados.email_institucional ?? '').trim(),
    senha: String(dados.senha ?? ''),
  }
}

export function extrairSessao(resposta) {
  if (typeof resposta === 'string') return { token: resposta }
  if (!resposta || typeof resposta !== 'object') return { token: null }

  if (resposta.sessao && typeof resposta.sessao === 'object') {
    return extrairSessao(resposta.sessao)
  }

  const token = resposta.token ?? resposta.accessToken ?? resposta.access_token ?? null
  const possuiUsuario = resposta.user !== undefined || resposta.usuario !== undefined

  if (!possuiUsuario) return { token }
  return { token, user: resposta.user ?? resposta.usuario }
}

export async function cadastrar(dados) {
  return api.post('/auth/cadastro', normalizarCadastro(dados))
}

export async function login(dados) {
  return api.post('/auth/login', normalizarCredenciais(dados))
}

export async function entrar(dados) {
  const resposta = await login(dados)
  return salvarSessao(extrairSessao(resposta))
}

export function sair() {
  return limparSessao()
}

export function sincronizarPerfil(perfil) {
  return salvarUsuario(perfil)
}

export function sessaoAtual() {
  return getSession()
}

export function usuarioAtual() {
  return getCurrentUser()
}

export function autenticado() {
  return isAuthenticated()
}

export function atualizarSessaoArmazenada() {
  return atualizarSessao()
}

export const authService = {
  cadastrar,
  registrar: cadastrar,
  signUp: cadastrar,
  login,
  autenticar: login,
  entrar,
  signIn: entrar,
  sair,
  logout: sair,
  signOut: sair,
  sincronizarPerfil,
  setUser: sincronizarPerfil,
  sessaoAtual,
  getSession: sessaoAtual,
  usuarioAtual,
  getCurrentUser: usuarioAtual,
  autenticado,
  isAuthenticated: autenticado,
  atualizarSessaoArmazenada,
  refresh: atualizarSessaoArmazenada,
}

export default authService
