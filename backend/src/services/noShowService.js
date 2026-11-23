import { withImmediateTransaction } from '../db/connection.js'
import {
  ApiError, ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../middlewares/errorHandler.js'
import {
  ESTADOS, NATUREZAS_CANCELAMENTO as NATUREZAS_OFERTA, OfertaRepository,
} from '../repositories/ofertaRepository.js'
import {
  NATUREZAS_CANCELAMENTO as NATUREZAS_RESERVA, ReservaRepository, STATUS,
} from '../repositories/reservaRepository.js'
import { parseDateTime } from '../utils/dateTime.js'
import { HistoricoService, NATUREZAS } from './historicoService.js'
import { PenalidadeService } from './penalidadeService.js'

function exigirId(value, nome) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${nome} deve ser inteiro positivo`)
  return n
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

function partidaPassada(oferta, agora = new Date()) {
  const partida = parseDateTime(oferta?.data_hora_saida)
  const instante = parseDateTime(agora)
  return Boolean(partida && instante && instante.getTime() >= partida.getTime())
}

export class NoShowService {
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

  async registrarNoShowPassageiro(reservaId, motoristaId, connection) {
    const id = exigirId(reservaId, 'reserva_id')
    const atorId = exigirId(motoristaId, 'motorista_id')

    const executar = async (tx) => {
      try {
        const reserva = await this.reservas.buscarPorId(id, tx)
        if (!reserva) throw new NotFoundError('Reserva não encontrada')
        const oferta = await this.ofertas.buscarPorId(reserva.oferta_id, tx)
        if (!oferta) throw new NotFoundError('Oferta não encontrada')
        if (Number(oferta.motorista_id) !== Number(atorId)) {
          throw new ForbiddenError('Somente o motorista da oferta pode registrar no-show')
        }
        if (reserva.status !== STATUS.CONFIRMADA) {
          throw new ConflictError('Reserva não está confirmada')
        }
        if (!partidaPassada(oferta, this.agora())) {
          throw new ConflictError('No-show só pode ser registrado após o horário previsto')
        }

        const atualizada = await this.reservas.marcarNoShow(id, tx)

        await this.penalidades.registrarNoShowPassageiro({
          usuario_id: reserva.passageiro_id,
          oferta_id: oferta.id,
          reserva_id: reserva.id,
          ator_usuario_id: atorId,
        }, tx)

        await this.historico.registrarNoShowPassageiro({
          reserva_id: reserva.id,
          oferta_id: oferta.id,
          passageiro_id: reserva.passageiro_id,
          ator_usuario_id: atorId,
          pontos: 2,
          detalhes: { vaga_liberada: false },
        }, tx)

        return { reserva: atualizada, oferta }
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }

  async registrarAusenciaMotorista(ofertaId, passageiroId, connection) {
    const id = exigirId(ofertaId, 'oferta_id')
    const atorId = exigirId(passageiroId, 'passageiro_id')

    const executar = async (tx) => {
      try {
        const oferta = await this.ofertas.buscarPorId(id, tx)
        if (!oferta) throw new NotFoundError('Oferta não encontrada')
        const participante = await this.ofertas.eParticipante(id, atorId, tx)
        if (!participante || Number(oferta.motorista_id) === Number(atorId)) {
          throw new ForbiddenError('Somente passageiro participante pode informar ausência do motorista')
        }
        if (!partidaPassada(oferta, this.agora())) {
          throw new ConflictError('Ausência do motorista só pode ser informada após o horário previsto')
        }
        if (oferta.estado === ESTADOS.CANCELADA) {
          throw new ConflictError('Oferta já está cancelada')
        }

        const reservas = await this.reservas.listarPorOferta(id, tx)
        const ativas = reservas.filter((r) => r.status === STATUS.CONFIRMADA)

        const ofertaCancelada = await this.ofertas.cancelar(id, NATUREZAS_OFERTA.AUSENCIA_MOTORISTA, tx)
        const reservasCanceladas = []
        for (const reserva of ativas) {
          const cancelada = await this.reservas.cancelar(reserva.id, NATUREZAS_RESERVA.AUSENCIA_MOTORISTA, tx)
          reservasCanceladas.push(cancelada)
          await this.historico.registrarCancelamentoReserva({
            reserva_id: reserva.id,
            ator_usuario_id: atorId,
            natureza: NATUREZAS.AUSENCIA_MOTORISTA,
            detalhes: {
              oferta_id: id,
              passageiro_id: reserva.passageiro_id,
              natureza_cancelamento: NATUREZAS_RESERVA.AUSENCIA_MOTORISTA,
              pontos: 0,
            },
          }, tx)
        }

        await this.penalidades.registrarAusenciaMotorista({
          usuario_id: oferta.motorista_id,
          oferta_id: id,
          ator_usuario_id: atorId,
        }, tx)

        await this.historico.registrarAusenciaMotorista({
          oferta_id: id,
          motorista_id: oferta.motorista_id,
          ator_usuario_id: atorId,
          pontos: 2,
          detalhes: { reservas_canceladas: reservasCanceladas.length },
        }, tx)

        return { oferta: ofertaCancelada, reservas: reservasCanceladas }
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }
}

export const noShowService = new NoShowService()
export default NoShowService
