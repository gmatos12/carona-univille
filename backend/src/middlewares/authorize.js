import { ForbiddenError, UnauthorizedError } from './errorHandler.js'

function sameIdentifier(left, right) {
  if (left === undefined || left === null || right === undefined || right === null) return false
  return String(left) === String(right)
}

function isAllowed(result) {
  if (result === true) return true
  if (result !== null && typeof result === 'object' && result.allowed === true) return true
  return false
}

function rejectionMessage(options, result) {
  if (result && typeof result === 'object' && typeof result.message === 'string') return result.message
  return options.message || 'Acesso negado a este recurso'
}

export function authorize(predicate, options = {}) {
  if (typeof predicate !== 'function') {
    throw new TypeError('Autorização exige uma função de verificação')
  }

  return (req, res, next) => {
    if (options.requireUser !== false && !req.user) {
      return next(new UnauthorizedError())
    }

    return Promise.resolve()
      .then(() => predicate(req))
      .then((result) => {
        if (!isAllowed(result)) {
          throw new ForbiddenError(rejectionMessage(options, result))
        }
        return next()
      })
      .catch(next)
  }
}

export function isOwner(req, resource, options = {}) {
  const ownerField = options.ownerField || 'usuario_id'
  const ownerId = options.getOwnerId
    ? options.getOwnerId(resource, req)
    : resource?.[ownerField]
  return sameIdentifier(req?.user?.id, ownerId)
}

export function authorizeOwner(options = {}) {
  return authorize((req) => {
    const resource = options.getResource ? options.getResource(req) : req.resource
    return isOwner(req, resource, options)
  }, options)
}

export function authorizeSelf(options = {}) {
  const parameter = options.parameter || 'id'

  return authorize((req) => {
    const candidateId = options.getUserId ? options.getUserId(req) : req.params?.[parameter]
    return sameIdentifier(req.user?.id, candidateId)
  }, options)
}

export function authorizeAny(predicates, options = {}) {
  if (!Array.isArray(predicates)) {
    throw new TypeError('authorizeAny exige uma lista de verificações')
  }

  return authorize((req) => predicates.some((predicate) => {
    if (typeof predicate !== 'function') return false
    return predicate(req) === true
  }), options)
}

export function authorizeAll(predicates, options = {}) {
  if (!Array.isArray(predicates)) {
    throw new TypeError('authorizeAll exige uma lista de verificações')
  }

  return authorize((req) => predicates.every((predicate) => {
    if (typeof predicate !== 'function') return false
    return predicate(req) === true
  }), options)
}

export const authorizeResource = authorizeOwner
export const requireOwner = authorizeOwner
export const requireSelf = authorizeSelf

export default {
  authorize,
  authorizeOwner,
  authorizeResource,
  authorizeSelf,
  authorizeAny,
  authorizeAll,
  isOwner,
  requireOwner,
  requireSelf,
}
