const MATRICULAS_AUTORIZADAS_TABLE = 'matriculas_autorizadas'

const MATRICULAS_AUTORIZADAS = Object.freeze([
  '99000001',
  '99000002',
  '99000003',
  '99000004',
  '99000005',
  '99000006',
  '99000007',
  '99000008',
  '99000009',
  '99000010',
  '99000011',
  '99000012',
  '99000013',
  '99000014',
  '99000015',
  '99000016',
  '99000017',
  '99000018',
  '99000019',
  '99000020',
])

function validarMatriculasAutorizadas(matriculas = MATRICULAS_AUTORIZADAS) {
  if (!Array.isArray(matriculas)) {
    throw new TypeError('A base local de matrículas autorizadas deve ser um array')
  }

  const vistas = new Set()
  for (const matricula of matriculas) {
    if (typeof matricula !== 'string' || matricula.trim() === '') {
      throw new TypeError('Todas as matrículas autorizadas devem ser strings não vazias')
    }
    if (vistas.has(matricula)) {
      throw new Error(`Matrícula autorizada duplicada: ${matricula}`)
    }
    vistas.add(matricula)
  }

  return matriculas
}

function getMatriculasAutorizadas() {
  return [...MATRICULAS_AUTORIZADAS]
}

function isMatriculaAutorizada(matricula) {
  return MATRICULAS_AUTORIZADAS.includes(String(matricula))
}

validarMatriculasAutorizadas()

export {
  MATRICULAS_AUTORIZADAS,
  MATRICULAS_AUTORIZADAS_TABLE,
  getMatriculasAutorizadas,
  isMatriculaAutorizada,
  validarMatriculasAutorizadas,
}

export default {
  MATRICULAS_AUTORIZADAS,
  MATRICULAS_AUTORIZADAS_TABLE,
  getMatriculasAutorizadas,
  isMatriculaAutorizada,
  validarMatriculasAutorizadas,
}
