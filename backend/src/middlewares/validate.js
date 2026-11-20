import { STATUS, ValidationError, SemanticValidationError } from './errorHandler.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function rule(type, options = {}) {
  return { type, ...options }
}

export function string(options = {}) {
  return rule('string', options)
}

export function number(options = {}) {
  return rule('number', options)
}

export function integer(options = {}) {
  return rule('integer', options)
}

export function boolean(options = {}) {
  return rule('boolean', options)
}

export function date(options = {}) {
  return rule('date', options)
}

export function oneOf(values, options = {}) {
  return rule('enum', { ...options, values })
}

export function arrayOf(items, options = {}) {
  return rule('array', { ...options, items })
}

export function objectOf(fields, options = {}) {
  return rule('object', { ...options, fields })
}

function normalizeDefinition(definition) {
  if (typeof definition === 'string') return { type: definition }
  if (Array.isArray(definition)) return { type: 'enum', values: definition }
  if (isPlainObject(definition)) {
    return {
      ...definition,
      type: definition.type || (definition.values ? 'enum' : definition.items ? 'array' : definition.fields ? 'object' : 'string'),
    }
  }
  return { type: typeof definition }
}

function getPath(source, field) {
  const parts = field.split('.')
  let current = source

  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined
    current = current[part]
  }

  return current
}

function setPath(target, field, value) {
  const parts = field.split('.')
  let current = target

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]
    if (!isPlainObject(current[key])) current[key] = {}
    current = current[key]
  }

  current[parts[parts.length - 1]] = value
}

function setSource(req, source, value) {
  try {
    req[source] = value
  } catch {
    Object.defineProperty(req, source, {
      value,
      writable: true,
      configurable: true,
    })
  }
}

function fail(field, message, status = STATUS.BAD_REQUEST) {
  const details = [{ field, message }]
  if (status === STATUS.UNPROCESSABLE) {
    throw new SemanticValidationError('Dados não processáveis', details)
  }
  throw new ValidationError('Dados inválidos', details)
}

function coerceValue(value, definition, options) {
  const shouldCoerce = definition.coerce ?? options.coerce ?? false
  if (!shouldCoerce || typeof value !== 'string') return value

  const trimmed = value.trim()

  if (definition.type === 'number' || definition.type === 'integer') {
    return trimmed === '' ? Number.NaN : Number(trimmed)
  }

  if (definition.type === 'boolean') {
    const normalized = trimmed.toLowerCase()
    if (['true', '1'].includes(normalized)) return true
    if (['false', '0'].includes(normalized)) return false
  }

  return value
}

function checkRange(value, definition, field) {
  if (definition.min !== undefined && value < definition.min) {
    fail(field, `Valor mínimo: ${definition.min}`, STATUS.UNPROCESSABLE)
  }
  if (definition.max !== undefined && value > definition.max) {
    fail(field, `Valor máximo: ${definition.max}`, STATUS.UNPROCESSABLE)
  }
}

function applyCustomValidation(value, definition, context) {
  if (typeof definition.validate !== 'function') return

  const customContext = {
    field: context.field,
    req: context.req,
    source: context.source,
  }
  const result = definition.validate(value, customContext)

  if (result === false) fail(context.field, 'Valor inválido', STATUS.UNPROCESSABLE)
  if (typeof result === 'string') fail(context.field, result, STATUS.UNPROCESSABLE)
  if (result instanceof Error) throw result
  if (isPlainObject(result) && result.valid === false) {
    fail(context.field, result.message || 'Valor inválido', result.status || STATUS.UNPROCESSABLE)
  }
}

function validateValue(input, definition, context) {
  const field = context.field

  if (input === undefined) {
    if (definition.required || definition.optional === false) {
      fail(field, 'Campo obrigatório', STATUS.UNPROCESSABLE)
    }
    return { present: false }
  }

  if (input === null) {
    if (definition.nullable) return { present: true, value: null }
    fail(field, 'Campo não pode ser nulo', STATUS.UNPROCESSABLE)
  }

  let value = coerceValue(input, definition, context.options)

  switch (definition.type) {
    case 'string': {
      if (typeof value !== 'string') fail(field, 'Deve ser texto')
      if (definition.trim !== false) value = value.trim()
      if (definition.nonEmpty && value.length === 0) {
        fail(field, 'Não pode ficar vazio', STATUS.UNPROCESSABLE)
      }
      if (definition.minLength !== undefined && value.length < definition.minLength) {
        fail(field, `Tamanho mínimo: ${definition.minLength}`, STATUS.UNPROCESSABLE)
      }
      if (definition.maxLength !== undefined && value.length > definition.maxLength) {
        fail(field, `Tamanho máximo: ${definition.maxLength}`, STATUS.UNPROCESSABLE)
      }
      if (definition.pattern) {
        const pattern = definition.pattern instanceof RegExp
          ? definition.pattern
          : new RegExp(definition.pattern)
        if (!pattern.test(value)) fail(field, 'Formato inválido')
      }
      if (definition.format === 'email' && !EMAIL_PATTERN.test(value)) {
        fail(field, 'E-mail inválido')
      }
      break
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) fail(field, 'Deve ser número')
      checkRange(value, definition, field)
      break
    }
    case 'integer': {
      if (!Number.isInteger(value)) fail(field, 'Deve ser inteiro')
      checkRange(value, definition, field)
      break
    }
    case 'boolean': {
      if (typeof value !== 'boolean') fail(field, 'Deve ser booleano')
      break
    }
    case 'date': {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail(field, 'Data inválida')
      break
    }
    case 'enum': {
      if (!Array.isArray(definition.values) || !definition.values.includes(value)) {
        fail(field, 'Valor não permitido', STATUS.UNPROCESSABLE)
      }
      break
    }
    case 'array': {
      if (!Array.isArray(value)) fail(field, 'Deve ser uma lista')
      if (definition.minItems !== undefined && value.length < definition.minItems) {
        fail(field, `Itens mínimos: ${definition.minItems}`, STATUS.UNPROCESSABLE)
      }
      if (definition.maxItems !== undefined && value.length > definition.maxItems) {
        fail(field, `Itens máximos: ${definition.maxItems}`, STATUS.UNPROCESSABLE)
      }
      if (definition.items) {
        const itemRule = normalizeDefinition(definition.items)
        value = value.map((item, index) => {
          const result = validateValue(item, itemRule, {
            ...context,
            field: `${field}[${index}]`,
          })
          return result.value
        })
      }
      break
    }
    case 'object': {
      if (!isPlainObject(value)) fail(field, 'Deve ser um objeto')
      if (definition.fields) {
        value = validateSource(value, definition.fields, {
          ...context,
          field,
        })
      }
      break
    }
    default: {
      if (typeof value !== definition.type) fail(field, `Deve ser ${definition.type}`)
    }
  }

  applyCustomValidation(value, definition, context)

  if (typeof definition.transform === 'function') {
    value = definition.transform(value, {
      field,
      req: context.req,
      source: context.source,
    })
  }

  return { present: true, value }
}

function validateSource(source, schema, context) {
  if (!isPlainObject(schema)) {
    throw new TypeError('Schema de validação deve ser um objeto')
  }
  if (!isPlainObject(source)) {
    fail(context.source, 'Objeto inválido')
  }

  const clean = {}

  for (const [field, definitionInput] of Object.entries(schema)) {
    const definition = normalizeDefinition(definitionInput)
    const result = validateValue(getPath(source, field), definition, {
      ...context,
      field,
      definition,
    })

    if (result.present) setPath(clean, field, result.value)
  }

  return clean
}

export function validateRequest(schemas = {}) {
  return (req, res, next) => {
    try {
      for (const source of ['params', 'query', 'body']) {
        if (!schemas[source]) continue
        const sourceOptions = {
          coerce: source === 'params' || source === 'query',
          ...(schemas.options ?? {}),
        }
        const clean = validateSource(req[source] ?? {}, schemas[source], { source, req, options: sourceOptions })
        setSource(req, source, clean)
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

export function validate(schema, options = {}) {
  const source = options.source || 'body'
  return validateRequest({ [source]: schema, options })
}

export function validateBody(schema, options = {}) {
  return validate(schema, { ...options, source: 'body' })
}

export function validateQuery(schema, options = {}) {
  return validate(schema, { ...options, source: 'query', coerce: options.coerce ?? true })
}

export function validateParams(schema, options = {}) {
  return validate(schema, { ...options, source: 'params', coerce: options.coerce ?? true })
}

export default {
  string,
  number,
  integer,
  boolean,
  date,
  oneOf,
  arrayOf,
  objectOf,
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateRequest,
}
