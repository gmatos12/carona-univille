export const STATUS = Object.freeze({
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
})

export class ApiError extends Error {
  constructor(status, message, code = 'API_ERROR', details) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.statusCode = status
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Dados inválidos', details = []) {
    super(STATUS.BAD_REQUEST, message, 'VALIDATION_ERROR', details)
  }
}

export class SemanticValidationError extends ValidationError {
  constructor(message = 'Dados não processáveis', details = []) {
    super(message, details)
    this.status = STATUS.UNPROCESSABLE
    this.statusCode = STATUS.UNPROCESSABLE
    this.code = 'UNPROCESSABLE_ENTITY'
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Autenticação necessária') {
    super(STATUS.UNAUTHORIZED, message, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Acesso negado a este recurso') {
    super(STATUS.FORBIDDEN, message, 'FORBIDDEN')
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Recurso não encontrado') {
    super(STATUS.NOT_FOUND, message, 'NOT_FOUND')
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflito com o estado atual do recurso') {
    super(STATUS.CONFLICT, message, 'CONFLICT')
  }
}

export class UnprocessableError extends ApiError {
  constructor(message = 'Regra de negócio não atendida') {
    super(STATUS.UNPROCESSABLE, message, 'UNPROCESSABLE_ENTITY')
  }
}

function normalizeDatabaseError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()

  if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) {
    return {
      status: STATUS.CONFLICT,
      code: 'CONFLICT',
      message: 'Recurso temporariamente indisponível',
    }
  }

  if (code.startsWith('SQLITE_CONSTRAINT')) {
    if (message.includes('unique') || message.includes('primary key')) {
      return {
        status: STATUS.CONFLICT,
        code: 'CONFLICT',
        message: 'Já existe um registro com esses dados',
      }
    }
    if (message.includes('foreign key')) {
      return {
        status: STATUS.UNPROCESSABLE,
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Referência inválida',
      }
    }
    if (message.includes('check constraint') || message.includes('not null')) {
      return {
        status: STATUS.UNPROCESSABLE,
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Dados não atendem às regras de negócio',
      }
    }
    return {
      status: STATUS.CONFLICT,
      code: 'CONFLICT',
      message: 'Conflito ao salvar dados',
    }
  }

  return null
}

export function normalizeError(error) {
  if (error instanceof ApiError) {
    const normalized = {
      status: error.status,
      code: error.code,
      message: error.message,
    }
    if (error.details !== undefined) normalized.details = error.details
    return normalized
  }

  if (error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && error.status === STATUS.BAD_REQUEST)) {
    return {
      status: STATUS.BAD_REQUEST,
      code: 'INVALID_JSON',
      message: 'Corpo da requisição inválido',
    }
  }

  if (error?.name === 'TokenExpiredError') {
    return {
      status: STATUS.UNAUTHORIZED,
      code: 'TOKEN_EXPIRED',
      message: 'Token expirado',
    }
  }

  if (error?.name === 'JsonWebTokenError' || error?.name === 'NotBeforeError') {
    return {
      status: STATUS.UNAUTHORIZED,
      code: 'TOKEN_INVALID',
      message: 'Token inválido',
    }
  }

  if (error?.code === 'LIMIT_FILE_SIZE') {
    return {
      status: STATUS.UNPROCESSABLE,
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Arquivo excede o tamanho permitido',
    }
  }

  const databaseError = normalizeDatabaseError(error)
  if (databaseError) return databaseError

  return {
    status: STATUS.INTERNAL,
    code: 'INTERNAL_ERROR',
    message: 'Erro interno do servidor',
  }
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  const normalized = normalizeError(error)
  const body = {
    error: normalized.message,
    code: normalized.code,
  }

  if (normalized.details !== undefined) body.details = normalized.details

  return res.status(normalized.status).json(body)
}

export function notFoundHandler(req, res, next) {
  return next(new NotFoundError())
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve()
    .then(() => handler(req, res, next))
    .catch(next)
}

export default {
  STATUS,
  ApiError,
  ValidationError,
  SemanticValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableError,
  normalizeError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
}
