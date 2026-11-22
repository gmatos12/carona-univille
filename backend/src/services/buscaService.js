import { getConnection } from '../db/connection.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { OfertaRepository } from '../repositories/ofertaRepository.js'
import { UsuarioRepository } from '../repositories/usuarioRepository.js'
import { MINUTOS_JANELA, buildSearchWindow } from '../utils/dateTime.js'

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

function textoObrigatorio(value, nome) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${nome} é obrigatório`)
  }
  return value.trim()
}

function normalizarFiltros(filtros) {
  if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) {
    throw new ValidationError('Filtros de busca inválidos')
  }

  const origem = textoObrigatorio(primeiroDefinido(filtros.origem, filtros.origem_id), 'origem')
  const destino = textoObrigatorio(primeiroDefinido(filtros.destino, filtros.destino_id), 'destino')
  const data = primeiroDefinido(filtros.data, filtros.data_saida)
  const horario = primeiroDefinido(filtros.horario, filtros.hora, filtros.horario_saida)

  buildSearchWindow(data, horario, MINUTOS_JANELA)

  return {
    origem,
    destino,
    data,
    horario,
    janelaMinutos: MINUTOS_JANELA,
  }
}

function traduzirErro(error) {
  if (error instanceof ValidationError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

export class BuscaService {
  constructor({
    ofertas = new OfertaRepository(),
    usuarios = new UsuarioRepository(),
  } = {}) {
    this.ofertas = ofertas
    this.usuarios = usuarios
  }

  async buscar(filtros = {}, connection) {
    try {
      const criterios = normalizarFiltros(filtros)
      const conn = connection || await getConnection()
      const ofertas = await this.ofertas.listarParaBusca(criterios, conn)

      return await Promise.all(ofertas.map(async (oferta) => {
        const [motorista, veiculo] = await Promise.all([
          this.usuarios.perfilPublico(oferta.motorista_id, conn),
          conn.get(
            `SELECT v.id, v.marca, v.modelo, v.cor, v.ano
             FROM veiculos v WHERE v.id = ?`,
            [oferta.veiculo_id],
          ),
        ])
        return { ...oferta, motorista, veiculo }
      }))
    } catch (error) {
      traduzirErro(error)
    }
  }
}

export const buscaService = new BuscaService()

export default BuscaService
