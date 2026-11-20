import path from 'node:path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { createConnection, withImmediateTransaction } from '../connection.js'
import {
  MATRICULAS_AUTORIZADAS,
  MATRICULAS_AUTORIZADAS_TABLE,
  validarMatriculasAutorizadas,
} from './matriculasAutorizadas.js'

const SQL_VERIFICAR_TABELA = `
  SELECT name
  FROM sqlite_master
  WHERE type = 'table' AND name = ?
`
const SQL_INSERIR_MATRICULA = `
  INSERT OR IGNORE INTO ${MATRICULAS_AUTORIZADAS_TABLE} (matricula)
  VALUES (?)
`

async function seedMatriculasAutorizadas(options = {}) {
  const { connection: providedConnection, ...connectionOptions } = options
  validarMatriculasAutorizadas()

  const connection = providedConnection ?? (await createConnection(connectionOptions))
  let ownsConnection = !providedConnection

  try {
    return await withImmediateTransaction(connection, async (tx) => {
      const tabela = await tx.get(SQL_VERIFICAR_TABELA, [MATRICULAS_AUTORIZADAS_TABLE])
      if (!tabela) {
        throw new Error(
          `Tabela ${MATRICULAS_AUTORIZADAS_TABLE} não encontrada; execute as migrations antes do seed`,
        )
      }

      let inseridas = 0
      for (const matricula of MATRICULAS_AUTORIZADAS) {
        const resultado = await tx.run(SQL_INSERIR_MATRICULA, [matricula])
        inseridas += resultado.changes
      }

      return {
        inseridas,
        total: MATRICULAS_AUTORIZADAS.length,
        tabela: MATRICULAS_AUTORIZADAS_TABLE,
      }
    })
  } finally {
    if (ownsConnection) await connection.close()
  }
}

async function runSeed(options = {}) {
  return seedMatriculasAutorizadas(options)
}

const arquivoAtual = process.argv[1] ? path.resolve(process.argv[1]) : ''
const executandoComoScript = arquivoAtual === fileURLToPath(import.meta.url)

if (executandoComoScript) {
  const diretorioBackend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  dotenv.config({ path: path.join(diretorioBackend, '.env') })

  try {
    const resultado = await runSeed()
    console.log(
      `Seed de matrículas autorizadas concluído: ${resultado.inseridas} inseridas de ${resultado.total} na tabela ${resultado.tabela}.`,
    )
  } catch (error) {
    console.error('Falha ao aplicar seed de matrículas autorizadas:', error.message)
    process.exitCode = 1
  }
}

export { runSeed, seedMatriculasAutorizadas }

export default {
  runSeed,
  seedMatriculasAutorizadas,
}
