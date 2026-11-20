const MINUTOS_JANELA = 30
const MILISEGUNDOS_POR_MINUTO = 60 * 1000
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function parseDateOnly(value) {
  if (isValidDate(value)) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  if (typeof value !== 'string') return null

  const match = ISO_DATE_PATTERN.exec(value.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return date
}

function parseTimeOnly(value) {
  if (typeof value !== 'string') return null

  const match = TIME_PATTERN.exec(value.trim())
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = match[3] === undefined ? 0 : Number(match[3])

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null
  }

  return { hour, minute, second }
}

function combineDateAndTime(dateValue, timeValue) {
  const date = parseDateOnly(dateValue)
  const time = parseTimeOnly(timeValue)
  if (!date || !time) return null

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.hour,
    time.minute,
    time.second,
  )
}

function parseDateTime(value) {
  if (isValidDate(value)) return new Date(value.getTime())
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (ISO_DATE_PATTERN.test(trimmed)) {
    const date = parseDateOnly(trimmed)
    return date ? new Date(date.getTime()) : null
  }

  const timestamp = Date.parse(trimmed)
  return Number.isNaN(timestamp) ? null : new Date(timestamp)
}

function requireDate(value, name = 'data/hora') {
  const date = parseDateTime(value)
  if (!date) throw new TypeError(`${name} inválida`)
  return date
}

function requireWindowMinutes(windowMinutes) {
  const value = Number(windowMinutes)
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('Janela de minutos inválida')
  }
  return value
}

function toISOString(value) {
  return requireDate(value).toISOString()
}

function differenceInMinutes(start, end) {
  const startDate = requireDate(start, 'data/hora inicial')
  const endDate = requireDate(end, 'data/hora final')
  return (endDate.getTime() - startDate.getTime()) / MILISEGUNDOS_POR_MINUTO
}

function absoluteDifferenceInMinutes(left, right) {
  return Math.abs(differenceInMinutes(left, right))
}

function isWithinWindow(candidate, target, windowMinutes = MINUTOS_JANELA) {
  const candidateDate = requireDate(candidate, 'data/hora candidata')
  const targetDate = requireDate(target, 'data/hora alvo')
  const limit = requireWindowMinutes(windowMinutes) * MILISEGUNDOS_POR_MINUTO
  return Math.abs(candidateDate.getTime() - targetDate.getTime()) <= limit
}

function buildSearchWindow(dateValue, timeValue, windowMinutes = MINUTOS_JANELA) {
  const target = combineDateAndTime(dateValue, timeValue)
  if (!target) throw new TypeError('Data ou horário de busca inválidos')

  const minutes = requireWindowMinutes(windowMinutes)
  const limit = minutes * MILISEGUNDOS_POR_MINUTO
  return {
    target,
    inicio: new Date(target.getTime() - limit),
    fim: new Date(target.getTime() + limit),
    windowMinutes: minutes,
  }
}

function isBefore(value, reference) {
  return requireDate(value).getTime() < requireDate(reference).getTime()
}

function isAfter(value, reference) {
  return requireDate(value).getTime() > requireDate(reference).getTime()
}

function isSameDay(left, right) {
  const leftDate = requireDate(left)
  const rightDate = requireDate(right)
  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
    && leftDate.getDate() === rightDate.getDate()
}

function compareByProximity(left, right, target, options = {}) {
  const targetDate = requireDate(target)
  const leftDate = requireDate(options.getValue ? options.getValue(left) : left)
  const rightDate = requireDate(options.getValue ? options.getValue(right) : right)
  const leftDistance = Math.abs(leftDate.getTime() - targetDate.getTime())
  const rightDistance = Math.abs(rightDate.getTime() - targetDate.getTime())

  if (leftDistance !== rightDistance) return leftDistance - rightDistance

  const getVagas = options.getVagas || ((item) => item?.vagas_disponiveis ?? item?.vagas_total ?? 0)
  return (getVagas(right) || 0) - (getVagas(left) || 0)
}

export {
  ISO_DATE_PATTERN,
  MINUTOS_JANELA,
  TIME_PATTERN,
  absoluteDifferenceInMinutes,
  buildSearchWindow,
  combineDateAndTime,
  compareByProximity,
  differenceInMinutes,
  isAfter,
  isBefore,
  isSameDay,
  isWithinWindow,
  parseDateOnly,
  parseDateTime,
  parseTimeOnly,
  requireDate,
  toISOString,
}

export default {
  MINUTOS_JANELA,
  buildSearchWindow,
  combineDateAndTime,
  compareByProximity,
  isWithinWindow,
  parseDateTime,
  toISOString,
}
