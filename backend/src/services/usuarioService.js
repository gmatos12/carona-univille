import {
  ApiError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import {
  UsuarioRepository,
  mapearPerfilProprio,
} from '../repositories/usuarioRepository.js'

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new UnprocessableError(error.message)
  throw error
}

function somentePerfilPublico(perfil) {
  if (!perfil) throw new NotFoundError('Usuário não encontrado')

  return {
    id: perfil.id,
    nome_completo: perfil.nome_completo,
    foto_perfil_path: perfil.foto_perfil_path ?? null,
    media_avaliacoes: perfil.media_avaliacoes,
    viagens_concluidas: Number(perfil.viagens_concluidas ?? 0),
  }
}

export class UsuarioService {
  constructor({ usuarios = new UsuarioRepository() } = {}) {
    this.usuarios = usuarios
  }

  async perfilProprio(usuarioId, connection) {
    try {
      const usuario = await this.usuarios.buscarPorId(usuarioId, connection)
      if (!usuario) throw new NotFoundError('Usuário não encontrado')
      return mapearPerfilProprio(usuario)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async atualizarPerfil(usuarioId, dados, connection) {
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
      throw new ValidationError('Dados de perfil inválidos')
    }

    try {
      const usuario = await this.usuarios.buscarPorId(usuarioId, connection)
      if (!usuario) throw new NotFoundError('Usuário não encontrado')

      const email = primeiroDefinido(dados.email_institucional, dados.emailInstitucional)
      if (email !== undefined) {
        const existente = await this.usuarios.buscarPorEmail(email, connection)
        if (existente && Number(existente.id) !== Number(usuario.id)) {
          throw new ConflictError('Já existe um usuário com este e-mail institucional')
        }
      }

      const atualizado = await this.usuarios.atualizar(usuarioId, dados, connection)
      if (!atualizado) throw new NotFoundError('Usuário não encontrado')
      return mapearPerfilProprio(atualizado)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async atualizarFotoPerfil(usuarioId, caminho, connection) {
    try {
      const atualizado = await this.usuarios.atualizarFotoPerfil(usuarioId, caminho, connection)
      if (!atualizado) throw new NotFoundError('Usuário não encontrado')
      return mapearPerfilProprio(atualizado)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async removerFotoPerfil(usuarioId, connection) {
    try {
      const atualizado = await this.usuarios.removerFotoPerfil(usuarioId, connection)
      if (!atualizado) throw new NotFoundError('Usuário não encontrado')
      return mapearPerfilProprio(atualizado)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async perfilPublico(usuarioId, connection) {
    try {
      const perfil = await this.usuarios.perfilPublico(usuarioId, connection)
      return somentePerfilPublico(perfil)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async mediaAvaliacoes(usuarioId, connection) {
    try {
      return await this.usuarios.mediaAvaliacoes(usuarioId, connection)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async viagensConcluidas(usuarioId, connection) {
    try {
      return await this.usuarios.contarViagensConcluidas(usuarioId, connection)
    } catch (error) {
      traduzirErro(error)
    }
  }
}

export const usuarioService = new UsuarioService()

export default UsuarioService
