import { withImmediateTransaction } from '../db/connection.js'
import {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import {
  ESTADOS,
  NATUREZAS_CANCELAMENTO as NATUREZAS_CANCELAMENTO_OFERTA,
  OfertaRepository,
} from '../repositories/ofertaRepository.js'
import {
  NATUREZAS_CANCELAMENTO as NATUREZAS_CANCELAMENTO_RESERVA,
  ReservaRepository,
  STATUS,
} from '../repositories/reservaRepository.js'
import { parseDateTime } from '../utils/dateTime.js'
import { HistoricoService, NATUREZAS } from './historicoService.js'
import {
  geraPenalidadeCancelamento,
  PenalidadeService,
} from './penalidadeService.js'

export { geraPenalidadeCancelamento }
export {
  NATUREZAS_CANCELAMENTO_OFERTA,
  NATUREZAS_CANCELAMENTO_RESERVA,
}

export const LIMIAR_PENALIDADE_HORAS = 24

const MILISEGUNDOS_POR_HORA = 60 * 60 * 1000

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

function exigirId(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ValidationError(`${nome} deve ser um inteiro positivo`)
  }
  return numero
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

export function podeCancelarPassageiro(dataHoraSaida, agora = new Date()) {
  const partida = parseDateTime(dataHoraSaida)
  const instante = parseDateTime(agora)
  return Boolean(partida && instante && instante.getTime() < partida.getTime())
}

export function pontosCancelamentoPassageiro(dataHoraSaida, agora = new Date()) {
  if (!podeCancelarPassageiro(dataHoraSaida, agora)) {
    throw new ConflictError('Cancelamento não permitido a partir do horário previsto')
  }

  const partida = parseDateTime(dataHoraSaida)
  const instante = parseDateTime(agora)
  const horasAntecedencia = (partida.getTime() - instante.getTime()) / MILISEGUNDOS_POR_HORA

  return horasAntecedencia >= LIMIAR_PENALIDADE_HORAS ? 0 : 1
}

export function pontosCancelamentoMotorista(reservasConfirmadas) {
  const total = Number(reservasConfirmadas)
  if (!Number.isFinite(total) || total <= 0) return 0
  return 1
}

function naturezaHistorico(natureza) {
  return geraPenalidadeCancelamento(natureza)
    ? NATUREZAS.CANCELAMENTO_COMUM
    : NATUREZAS.CANCELAMENTO_EXCLUSAO_CONTA
}

function opcoesCancelamento(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return {}
  return dados
}

export class CancelamentoService {
  constructor({
    ofertas = new OfertaRepository(),
    reservas = new ReservaRepository(),
    penalidades = new PenalidadeService(),
    historico = new HistoricoService(),
    agora = () => new Date(),
  } = {}) {
    this.ofertas = ofertas
    this.reservas = reservas
    this.penalidades = penalidades
    this.historico = historico
    this.agora = typeof agora === 'function' ? agora : () => agora
  }

  async cancelarReserva(reservaId, dados = {}, connection) {
    const id = exigirId(reservaId, 'reserva_id')
    const opcoes = opcoesCancelamento(dados)
    const natureza = opcoes.natureza ?? NATUREZAS_CANCELAMENTO_RESERVA.PASSAGEIRO
    const atorUsuarioId = primeiroDefinido(
      opcoes.atorUsuarioId,
      opcoes.ator_usuario_id,
      opcoes.usuarioId,
      opcoes.passageiroId,
    )
    const passageiroId = primeiroDefinido(opcoes.passageiroId, opcoes.usuarioId)

    const executar = async (tx) => {
      try {
        const reserva = await this.reservas.buscarPorId(id, tx)
        if (!reserva) throw new NotFoundError('Reserva não encontrada')

        if (passageiroId !== undefined
          && Number(reserva.passageiro_id) !== Number(passageiroId)) {
          throw new ForbiddenError('Somente o passageiro da reserva pode cancelá-la')
        }

        if (reserva.status !== STATUS.CONFIRMADA) {
          throw new ConflictError('Reserva não está ativa')
        }

        const oferta = await this.ofertas.buscarPorId(reserva.oferta_id, tx)
        if (!oferta) throw new NotFoundError('Oferta não encontrada')

        const geraPenalidade = geraPenalidadeCancelamento(natureza)
        const pontos = geraPenalidade
          ? pontosCancelamentoPassageiro(oferta.data_hora_saida, this.agora())
          : 0

        const cancelada = await this.reservas.cancelar(id, natureza, tx)
        if (!cancelada) throw new NotFoundError('Reserva não encontrada')

        const detalhes = {
          oferta_id: oferta.id,
          passageiro_id: reserva.passageiro_id,
          natureza_cancelamento: natureza,
          pontos,
          vaga_liberada: true,
        }

        if (geraPenalidade) {
          await this.historico.registrarCancelamentoReserva({
            reserva_id: id,
            ator_usuario_id: atorUsuarioId,
            natureza: naturezaHistorico(natureza),
            detalhes,
          }, tx)
        } else {
          await this.historico.registrarCancelamentoPorExclusaoConta({
            entidadeTipo: 'reserva',
            entidadeId: id,
            atorUsuarioId,
            detalhes,
          }, tx)
        }

        let penalidade = null
        if (pontos > 0) {
          penalidade = await this.penalidades.registrarCancelamentoPassageiro({
            usuario_id: reserva.passageiro_id,
            oferta_id: oferta.id,
            reserva_id: id,
            ator_usuario_id: atorUsuarioId,
            natureza,
          }, tx)
        }

        return {
          reserva: cancelada,
          oferta,
          natureza,
          pontos,
          penalidade,
          vaga_liberada: true,
        }
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }

  async cancelarReservaPassageiro(reservaId, passageiroId, connection) {
    return this.cancelarReserva(reservaId, {
      passageiroId,
      natureza: NATUREZAS_CANCELAMENTO_RESERVA.PASSAGEIRO,
    }, connection)
  }

  async cancelarOferta(ofertaId, dados = {}, connection) {
    const id = exigirId(ofertaId, 'oferta_id')
    const opcoes = opcoesCancelamento(dados)
    const natureza = opcoes.natureza ?? NATUREZAS_CANCELAMENTO_OFERTA.COMUM_MOTORISTA
    const motoristaId = primeiroDefinido(opcoes.motoristaId, opcoes.usuarioId)
    const atorUsuarioId = primeiroDefinido(
      opcoes.atorUsuarioId,
      opcoes.ator_usuario_id,
      motoristaId,
    )

    const executar = async (tx) => {
      try {
        const oferta = await this.ofertas.buscarPorId(id, tx)
        if (!oferta) throw new NotFoundError('Oferta não encontrada')

        if (motoristaId !== undefined
          && Number(oferta.motorista_id) !== Number(motoristaId)) {
          throw new ForbiddenError('Somente o motorista da oferta pode cancelá-la')
        }

        if (oferta.estado === ESTADOS.CANCELADA) {
          throw new ConflictError('Oferta já está cancelada')
        }

        const reservas = await this.reservas.listarPorOferta(id, tx)
        const reservasAtivas = reservas.filter((reserva) => reserva.status === STATUS.CONFIRMADA)
        const geraPenalidade = geraPenalidadeCancelamento(natureza)
        const pontos = geraPenalidade
          ? pontosCancelamentoMotorista(reservasAtivas.length)
          : 0

        const cancelada = await this.ofertas.cancelar(id, natureza, tx)
        if (!cancelada) throw new NotFoundError('Oferta não encontrada')

        const naturezaReserva = geraPenalidade
          ? NATUREZAS_CANCELAMENTO_RESERVA.MOTORISTA
          : NATUREZAS_CANCELAMENTO_RESERVA.EXCLUSAO_CONTA
        const reservasCanceladas = []

        for (const reserva of reservasAtivas) {
          const canceladaReserva = await this.reservas.cancelar(reserva.id, naturezaReserva, tx)
          reservasCanceladas.push(canceladaReserva)

          const detalhes = {
            oferta_id: id,
            passageiro_id: reserva.passageiro_id,
            natureza_cancelamento: naturezaReserva,
            pontos: 0,
            vaga_liberada: geraPenalidade,
          }

          if (geraPenalidade) {
            await this.historico.registrarCancelamentoReserva({
              reserva_id: reserva.id,
              ator_usuario_id: atorUsuarioId,
              natureza: naturezaHistorico(natureza),
              detalhes,
            }, tx)
          } else {
            await this.historico.registrarCancelamentoPorExclusaoConta({
              entidadeTipo: 'reserva',
              entidadeId: reserva.id,
              atorUsuarioId,
              detalhes,
            }, tx)
          }
        }

        const detalhesOferta = {
          natureza_cancelamento: natureza,
          reservas_canceladas: reservasAtivas.length,
          pontos,
        }

        if (geraPenalidade) {
          await this.historico.registrarCancelamentoOferta({
            oferta_id: id,
            ator_usuario_id: atorUsuarioId,
            natureza: naturezaHistorico(natureza),
            detalhes: detalhesOferta,
          }, tx)
        } else {
          await this.historico.registrarCancelamentoPorExclusaoConta({
            entidadeTipo: 'oferta',
            entidadeId: id,
            atorUsuarioId,
            detalhes: detalhesOferta,
          }, tx)
        }

        let penalidade = null
        if (pontos > 0) {
          penalidade = await this.penalidades.registrarCancelamentoMotorista({
            usuario_id: oferta.motorista_id,
            oferta_id: id,
            ator_usuario_id: atorUsuarioId,
            natureza,
          }, tx)
        }

        return {
          oferta: cancelada,
          reservas: reservasCanceladas,
          reservas_canceladas: reservasCanceladas.length,
          natureza,
          pontos,
          penalidade,
        }
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }

  async cancelarOfertaMotorista(ofertaId, motoristaId, connection) {
    return this.cancelarOferta(ofertaId, {
      motoristaId,
      natureza: NATUREZAS_CANCELAMENTO_OFERTA.COMUM_MOTORISTA,
    }, connection)
  }
}

export const cancelamentoService = new CancelamentoService()
export default CancelamentoService
