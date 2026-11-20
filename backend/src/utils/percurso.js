const PARADAS_MINIMAS = 2

function parseListaPontos(value) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
    } catch {
      throw new TypeError('Percurso deve ser uma lista ordenada de pontos')
    }
  }

  throw new TypeError('Percurso deve ser uma lista ordenada de pontos')
}

function normalizarPonto(value) {
  if (typeof value !== 'string') return null
  const ponto = value.trim()
  return ponto === '' ? null : ponto
}

function chavePonto(value) {
  const ponto = normalizarPonto(value)
  return ponto === null ? null : ponto.toLocaleLowerCase('pt-BR')
}

function normalizarPercurso(value) {
  const pontos = parseListaPontos(value).map(normalizarPonto)

  if (pontos.length < PARADAS_MINIMAS) {
    throw new TypeError('Percurso deve conter origem e destino')
  }
  if (pontos.some((ponto) => ponto === null)) {
    throw new TypeError('Percurso contém ponto inválido')
  }

  return pontos
}

function construirPercurso(origem, paradasIntermediarias = [], destino) {
  const paradas = parseListaPontos(paradasIntermediarias)
  return normalizarPercurso([origem, ...paradas, destino])
}

function obterOrigem(percurso) {
  return normalizarPercurso(percurso)[0]
}

function obterDestino(percurso) {
  const pontos = normalizarPercurso(percurso)
  return pontos[pontos.length - 1]
}

function obterParadasIntermediarias(percurso) {
  return normalizarPercurso(percurso).slice(1, -1)
}

function indicePonto(percurso, ponto) {
  const alvo = chavePonto(ponto)
  if (alvo === null) return -1

  return normalizarPercurso(percurso).findIndex((item) => chavePonto(item) === alvo)
}

function mesmoPonto(left, right) {
  const leftKey = chavePonto(left)
  const rightKey = chavePonto(right)
  return leftKey !== null && leftKey === rightKey
}

function compatibilidadePercurso(percurso, origem, destino) {
  const pontos = normalizarPercurso(percurso)
  const indiceOrigem = indicePonto(pontos, origem)
  const indiceDestino = indicePonto(pontos, destino)

  return {
    compativel: indiceOrigem !== -1 && indiceDestino !== -1 && indiceOrigem < indiceDestino,
    indiceOrigem,
    indiceDestino,
  }
}

function percursoContemSegmento(percurso, origem, destino) {
  return compatibilidadePercurso(percurso, origem, destino).compativel
}

function filtrarPorPercurso(ofertas, origem, destino, options = {}) {
  if (!Array.isArray(ofertas)) {
    throw new TypeError('Ofertas devem ser uma lista')
  }

  const extrairPercurso = options.extrairPercurso || ((oferta) => oferta?.paradas)
  return ofertas.filter((oferta) => percursoContemSegmento(extrairPercurso(oferta), origem, destino))
}

function validarPercurso(percurso) {
  normalizarPercurso(percurso)
  return true
}

export {
  PARADAS_MINIMAS,
  chavePonto,
  compatibilidadePercurso,
  construirPercurso,
  filtrarPorPercurso,
  indicePonto,
  mesmoPonto,
  normalizarPercurso,
  normalizarPonto,
  obterDestino,
  obterOrigem,
  obterParadasIntermediarias,
  percursoContemSegmento,
  validarPercurso,
}

export default {
  compatibilidadePercurso,
  construirPercurso,
  filtrarPorPercurso,
  indicePonto,
  normalizarPercurso,
  obterDestino,
  obterOrigem,
  obterParadasIntermediarias,
  percursoContemSegmento,
  validarPercurso,
}
