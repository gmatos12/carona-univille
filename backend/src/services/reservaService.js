import { withImmediateTransaction } from '../db/connection.js'
import {
  ApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import { OfertaRepository } from '../repositories/ofertaRepository.js'
import { ReservaRepository, STATUS } from '../repositories/reservaRepository.js'
import { parseDateTime } from '../utils/dateTime.js'

const ESTADO_ABERTA = 'ABERTA'

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

function inteiroPositivo(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ValidationError(`${nome} deve ser um inteiro positivo`)
  }
  return numero
}

function extrairIds(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new ValidationError('Dados de reserva inválidos')
  }

  return {
    ofertaId: inteiroPositivo(primeiroDefinido(dados.oferta_id, dados.ofertaId), 'oferta_id'),
    passageiroId: inteiroPositivo(
      primeiroDefinido(dados.passageiro_id, dados.passageiroId),
      'passageiro_id',
    ),
  }
}

function resolverAgora(valor, nome = 'agora') {
  const data = parseDateTime(valor)
  if (!data) throw new TypeError(`${nome} inválida`)
  return data
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

function validarOferta(oferta, agora) {
  if (!oferta) throw new NotFoundError('Oferta não encontrada')
  if (oferta.estado !== ESTADO_ABERTA) {
    throw new ConflictError('Oferta não aceita novas reservas')
  }

  const partida = parseDateTime(oferta.data_hora_saida)
  if (!partida) throw new ConflictError('Data de saída da oferta é inválida')
  if (agora.getTime() >= partida.getTime()) {
    throw new ConflictError('Reservas não são aceitas a partir do horário previsto')
  }
}

export class ReservaService {
  constructor({
    ofertas = new OfertaRepository(),
    reservas = new ReservaRepository(),
    agora = () => new Date(),
  } = {}) {
    this.ofertas = ofertas
    this.reservas = reservas
    this.agora = typeof agora === 'function' ? agora : () => agora
  }

  async reservar(dados, connection) {
    const { ofertaId, passageiroId } = extrairIds(dados)

    const executar = async (tx) => {
      try {
        const oferta = await this.ofertas.buscarPorId(ofertaId, tx)
        validarOferta(oferta, resolverAgora(this.agora()))

        const reservaAtiva = await this.reservas.buscarAtivaPorPassageiro(
          ofertaId,
          passageiroId,
          tx,
        )
        if (reservaAtiva) {
          throw new ConflictError('Passageiro já possui reserva ativa nesta viagem')
        }

        const vagasTotais = Number(oferta.vagas_total)
        if (!Number.isInteger(vagasTotais) || vagasTotais < 1) {
          throw new ConflictError('Oferta sem vagas disponíveis')
        }

        const ocupantes = await this.reservas.contarOcupantes(ofertaId, tx)
        if (ocupantes >= vagasTotais) {
          throw new ConflictError('Não há vagas disponíveis nesta oferta')
        }

        return await this.reservas.criar({
          oferta_id: ofertaId,
          passageiro_id: passageiroId,
          status: STATUS.CONFIRMADA,
        }, tx)
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }
}

export const reservaService = new ReservaService()
export default ReservaService
