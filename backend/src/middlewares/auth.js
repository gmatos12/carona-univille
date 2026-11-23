import jwt from 'jsonwebtoken'
import { usuarioRepository } from '../repositories/usuarioRepository.js'
import { asyncHandler, ForbiddenError } from './errorHandler.js'

const JWT_EXPIRATION = '8h'
const BEARER_PATTERN = /^Bearer\s+(.+)$/i
const ALLOWED_ALGORITHMS = ['HS256']

class AuthConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthConfigurationError'
    this.code = 'AUTH_NOT_CONFIGURED'
  }
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new AuthConfigurationError('JWT_SECRET não configurado')
  }
  return secret
}

function getExpiresIn() {
  return process.env.JWT_EXPIRES_IN || JWT_EXPIRATION
}

function extractBearerToken(header) {
  if (typeof header !== 'string') return null
  const match = BEARER_PATTERN.exec(header.trim())
  return match ? match[1].trim() : null
}

function signToken(payload = {}, options = {}) {
  if (payload.sub === undefined && payload.id === undefined) {
    throw new TypeError('Payload JWT deve conter sub ou id')
  }

  const { expiresIn = getExpiresIn(), subject, audience, issuer } = options
  const signOptions = {
    algorithm: 'HS256',
    expiresIn,
  }

  if (subject !== undefined) signOptions.subject = subject
  if (audience !== undefined) signOptions.audience = audience
  if (issuer !== undefined) signOptions.issuer = issuer

  return jwt.sign(payload, getJwtSecret(), signOptions)
}

function verifyToken(token) {
  const payload = jwt.verify(token, getJwtSecret(), { algorithms: ALLOWED_ALGORITHMS })
  const id = payload.sub ?? payload.id

  if (id === undefined || id === null || id === '') {
    throw new jwt.JsonWebTokenError('Identidade ausente no token')
  }

  return {
    id,
    matricula: payload.matricula,
    email_institucional: payload.email_institucional,
  }
}

function authenticate(req, res, next) {
  const token = extractBearerToken(req?.headers?.authorization)

  if (!token) {
    return res.status(401).json({
      error: 'Token Bearer ausente',
      code: 'AUTH_TOKEN_MISSING',
    })
  }

  try {
    req.user = verifyToken(token)
    return next()
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return res.status(500).json({
        error: 'Autenticação não configurada',
        code: 'AUTH_NOT_CONFIGURED',
      })
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        code: 'AUTH_TOKEN_EXPIRED',
      })
    }

    return res.status(401).json({
      error: 'Token inválido',
      code: 'AUTH_TOKEN_INVALID',
    })
  }
}

const requireContaAtiva = asyncHandler(async (req, res, next) => {
  const usuarioId = Number(req.user?.id)
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw new ForbiddenError('Conta inválida')
  }

  const usuario = await usuarioRepository.buscarPorId(usuarioId)
  if (!usuario || Number(usuario.conta_ativa) !== 1) {
    throw new ForbiddenError('Conta inativa')
  }

  return next()
})

const auth = authenticate
const requireAuth = authenticate
const authenticateToken = authenticate

export {
  ALLOWED_ALGORITHMS,
  JWT_EXPIRATION,
  authenticate,
  authenticateToken,
  auth,
  extractBearerToken,
  getExpiresIn,
  getJwtSecret,
  requireAuth,
  requireContaAtiva,
  signToken,
  verifyToken,
}

export default {
  authenticate,
  authenticateToken,
  auth,
  requireAuth,
  requireContaAtiva,
  signToken,
  verifyToken,
}
