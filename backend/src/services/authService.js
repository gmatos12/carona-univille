import bcrypt from 'bcrypt'
import { getConnection } from '../db/connection.js'
import { JWT_EXPIRATION, signToken, verifyToken } from '../middlewares/auth.js'
import {
  ApiError,
  ConflictError,
  UnauthorizedError,
  UnprocessableError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import { MatriculaRepository } from '../repositories/matriculaRepository.js'
import { UsuarioRepository, mapearPerfilProprio } from '../repositories/usuarioRepository.js'

const SALT_ROUNDS = 10

function saltRounds() {
  const valor = Number(process.env.BCRYPT_SALT_ROUNDS ?? SALT_ROUNDS)
  return Number.isInteger(valor) && valor > 0 ? valor : SALT_ROUNDS
}

function textoObrigatorio(value, nome) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${nome} é obrigatório`)
  }
  return value.trim()
}

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

export function normalizarCadastro(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new ValidationError('Dados de cadastro inválidos')
  }

  return {
    nome_completo: textoObrigatorio(
      primeiroDefinido(dados.nome_completo, dados.nomeCompleto, dados.nome),
      'nome_completo',
    ),
    matricula: textoObrigatorio(dados.matricula, 'matricula'),
    email_institucional: textoObrigatorio(
      primeiroDefinido(dados.email_institucional, dados.emailInstitucional, dados.email),
      'email_institucional',
    ).toLowerCase(),
    senha: textoObrigatorio(primeiroDefinido(dados.senha, dados.password), 'senha'),
    telefone: textoObrigatorio(dados.telefone, 'telefone'),
  }
}

export function normalizarLogin(dados = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new ValidationError('Dados de login inválidos')
  }

  return {
    email_institucional: textoObrigatorio(
      primeiroDefinido(dados.email_institucional, dados.emailInstitucional, dados.email),
      'email_institucional',
    ).toLowerCase(),
    senha: textoObrigatorio(primeiroDefinido(dados.senha, dados.password), 'senha'),
  }
}

export async function hashSenha(senha, rounds = saltRounds()) {
  const valor = textoObrigatorio(senha, 'senha')
  return bcrypt.hash(valor, rounds)
}

export async function compararSenha(senha, hash) {
  if (typeof senha !== 'string' || typeof hash !== 'string' || hash === '') return false
  return bcrypt.compare(senha, hash)
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new UnprocessableError(error.message)
  throw error
}

export class AuthService {
  constructor({
    usuarios = new UsuarioRepository(),
    matriculas = new MatriculaRepository(),
  } = {}) {
    this.usuarios = usuarios
    this.matriculas = matriculas
  }

  gerarSessao(usuario) {
    if (!usuario) throw new UnauthorizedError('Credenciais inválidas')

    const token = signToken(
      {
        sub: usuario.id,
        matricula: usuario.matricula,
        email_institucional: usuario.email_institucional,
      },
      { expiresIn: JWT_EXPIRATION },
    )

    return { token, usuario: mapearPerfilProprio(usuario) }
  }

  async cadastrar(dados, connection) {
    const normalizado = normalizarCadastro(dados)
    const senha_hash = await hashSenha(normalizado.senha)

    const executar = async (tx) => {
      try {
        await this.matriculas.validarDisponivel(normalizado.matricula, tx)

        if (await this.usuarios.existeEmail(normalizado.email_institucional, tx)) {
          throw new ConflictError('Já existe um usuário com este e-mail institucional')
        }

        const usuario = await this.usuarios.criar(
          {
            nome_completo: normalizado.nome_completo,
            matricula: normalizado.matricula,
            email_institucional: normalizado.email_institucional,
            senha_hash,
            telefone: normalizado.telefone,
          },
          tx,
        )
        return mapearPerfilProprio(usuario)
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return executar(connection)

    const conn = await getConnection()
    return conn.transaction(executar)
  }

  async login(dados, connection) {
    const normalizado = normalizarLogin(dados)
    const usuario = await this.usuarios.buscarPorEmail(normalizado.email_institucional, connection)

    if (!usuario || Number(usuario.conta_ativa) !== 1) {
      throw new UnauthorizedError('E-mail institucional ou senha inválidos')
    }

    const senhaValida = await compararSenha(normalizado.senha, usuario.senha_hash)
    if (!senhaValida) throw new UnauthorizedError('E-mail institucional ou senha inválidos')

    return this.gerarSessao(usuario)
  }

  verificarToken(token) {
    return verifyToken(token)
  }
}

export const authService = new AuthService()

export default AuthService
