import { withImmediateTransaction } from '../db/connection.js'
import { NotFoundError } from '../middlewares/errorHandler.js'
import {
  ESTADOS,
  NATUREZAS_CANCELAMENTO as NATUREZAS_OFERTAS,
  OfertaRepository,
} from '../repositories/ofertaRepository.js'
import { RecorrenciaRepository } from '../repositories/recorrenciaRepository.js'
import {
  NATUREZAS_CANCELAMENTO as NATUREZAS_RESERVAS,
  ReservaRepository,
  STATUS as STATUS_RESERVA,
} from '../repositories/reservaRepository.js'
import { UsuarioRepository } from '../repositories/usuarioRepository.js'
import { parseDateTime } from '../utils/dateTime.js'
import { HistoricoService } from './historicoService.js'

const LIMITE_LISTAGEM = 500
const ESTADOS_FUTURAS = [ESTADOS.ABERTA, ESTADOS.EM_ANDAMENTO]

function inteiroPositivo(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new TypeError(`${nome} deve ser um inteiro positivo`)
  }
  return numero
}

function ehFutura(oferta, agora) {
  const partida = parseDateTime(oferta?.data_hora_saida)
  return Boolean(partida && partida.getTime() > agora.getTime())
}

export class ExclusaoContaService {
  constructor({
    usuarios = new UsuarioRepository(),
    ofertas = new OfertaRepository(),
    reservas = new ReservaRepository(),
    recorrencias = new RecorrenciaRepository(),
    historico = new HistoricoService(),
    agora = () => new Date(),
  } = {}) {
    this.usuarios = usuarios
    this.ofertas = ofertas
    this.reservas = reservas
    this.recorrencias = recorrencias
    this.historico = historico
    this.agora = typeof agora === 'function' ? agora : () => agora
  }

  async excluir(usuarioId, connection) {
    const id = inteiroPositivo(usuarioId, 'usuario_id')

    const executar = async (tx) => {
      const usuario = await this.usuarios.buscarPorId(id, tx)
      if (!usuario) throw new NotFoundError('Usuário não encontrado')

      if (Number(usuario.conta_ativa) !== 1) {
        return {
          usuario: await this.usuarios.buscarPorId(id, tx),
          ofertas_canceladas: 0,
          reservas_canceladas: 0,
          recorrencias_interrompidas: 0,
          ja_excluida: true,
        }
      }

      const agora = parseDateTime(this.agora()) ?? new Date()
      let ofertasCanceladas = 0
      let reservasCanceladas = 0

      const ofertasFuturas = await this.ofertas.listarPorMotorista(id, {
        estados: ESTADOS_FUTURAS,
        partidaApos: agora.toISOString(),
        limit: LIMITE_LISTAGEM,
      }, tx)

      for (const oferta of ofertasFuturas) {
        const reservasAtivas = (await this.reservas.listarPorOferta(oferta.id, tx))
          .filter((reserva) => reserva.status === STATUS_RESERVA.CONFIRMADA)

        await this.ofertas.cancelar(oferta.id, NATUREZAS_OFERTAS.EXCLUSAO_CONTA, tx)

        for (const reserva of reservasAtivas) {
          await this.reservas.cancelar(reserva.id, NATUREZAS_RESERVAS.EXCLUSAO_CONTA, tx)
          await this.historico.registrarCancelamentoPorExclusaoConta({
            entidadeTipo: 'reserva',
            entidadeId: reserva.id,
            atorUsuarioId: id,
            detalhes: {
              oferta_id: oferta.id,
              passageiro_id: reserva.passageiro_id,
              natureza_cancelamento: NATUREZAS_RESERVAS.EXCLUSAO_CONTA,
              pontos: 0,
              vaga_liberada: false,
            },
          }, tx)
        }

        await this.historico.registrarCancelamentoPorExclusaoConta({
          entidadeTipo: 'oferta',
          entidadeId: oferta.id,
          atorUsuarioId: id,
          detalhes: {
            natureza_cancelamento: NATUREZAS_OFERTAS.EXCLUSAO_CONTA,
            reservas_canceladas: reservasAtivas.length,
            pontos: 0,
          },
        }, tx)

        ofertasCanceladas += 1
        reservasCanceladas += reservasAtivas.length
      }

      const reservasDoPassageiro = await this.reservas.listarPorPassageiro(id, tx)
      for (const reserva of reservasDoPassageiro) {
        if (reserva.status !== STATUS_RESERVA.CONFIRMADA) continue

        const oferta = await this.ofertas.buscarPorId(reserva.oferta_id, tx)
        if (!oferta || !ESTADOS_FUTURAS.includes(oferta.estado) || !ehFutura(oferta, agora)) continue

        await this.reservas.cancelar(reserva.id, NATUREZAS_RESERVAS.EXCLUSAO_CONTA, tx)
        await this.historico.registrarCancelamentoPorExclusaoConta({
          entidadeTipo: 'reserva',
          entidadeId: reserva.id,
          atorUsuarioId: id,
          detalhes: {
            oferta_id: oferta.id,
            passageiro_id: id,
            natureza_cancelamento: NATUREZAS_RESERVAS.EXCLUSAO_CONTA,
            pontos: 0,
            vaga_liberada: true,
          },
        }, tx)
        reservasCanceladas += 1
      }

      const recorrenciasAtivas = (await this.recorrencias.listarAtivas(tx))
        .filter((recorrencia) => Number(recorrencia.motorista_id) === id)
      for (const recorrencia of recorrenciasAtivas) {
        await this.recorrencias.interromper(recorrencia.id, tx)
      }

      const anonimizado = await this.usuarios.anonimizar(id, tx)
      await this.historico.registrarExclusaoConta({
        usuario_id: id,
        ator_usuario_id: id,
        detalhes: {
          ofertas_canceladas: ofertasCanceladas,
          reservas_canceladas: reservasCanceladas,
          recorrencias_interrompidas: recorrenciasAtivas.length,
          dados_anonimizados: true,
        },
      }, tx)

      return {
        usuario: anonimizado,
        ofertas_canceladas: ofertasCanceladas,
        reservas_canceladas: reservasCanceladas,
        recorrencias_interrompidas: recorrenciasAtivas.length,
        ja_excluida: false,
      }
    }

    if (connection) return executar(connection)
    return withImmediateTransaction(executar)
  }
}

export const exclusaoContaService = new ExclusaoContaService()

export default ExclusaoContaService
