import { getConnection } from '../db/connection.js'
import { ApiError, ConflictError, ForbiddenError, NotFoundError } from '../middlewares/errorHandler.js'
import { ESTADOS, OfertaRepository, SITUACOES } from '../repositories/ofertaRepository.js'
import { parseDateTime } from '../utils/dateTime.js'
import { HistoricoService } from './historicoService.js'

function resolverAgora(valor) {
  if (valor === undefined) return new Date()
  const data = parseDateTime(valor)
  if (!data) throw new TypeError('agora inválido')
  return data
}

function copiarOferta(oferta) {
  return oferta ? { ...oferta } : oferta
}

export function situacaoViagem(oferta, agora = new Date()) {
  if (!oferta) return null
  const dataAgora = resolverAgora(agora)
  const estado = oferta.estado ?? ESTADOS.ABERTA

  if ([ESTADOS.CANCELADA, ESTADOS.CONCLUIDA, ESTADOS.EM_ANDAMENTO].includes(estado)) {
    return estado
  }

  const partida = parseDateTime(oferta.data_hora_saida)
  if (partida && dataAgora.getTime() >= partida.getTime()) {
    return SITUACOES.AGUARDANDO_INICIO
  }
  return SITUACOES.ABERTA
}

export function podeIniciar(oferta, agora = new Date()) {
  if (!oferta || oferta.estado !== ESTADOS.ABERTA) return false
  const dataAgora = resolverAgora(agora)
  const partida = parseDateTime(oferta.data_hora_saida)
  if (!partida) return false
  return dataAgora.getTime() >= partida.getTime()
}

export function iniciarViagem(oferta, agora = new Date()) {
  if (!oferta || typeof oferta !== 'object') throw new TypeError('oferta inválida')
  const dataAgora = resolverAgora(agora)
  if (!podeIniciar(oferta, dataAgora)) {
    throw new ConflictError('A viagem só pode ser iniciada a partir do horário previsto')
  }

  return {
    ...copiarOferta(oferta),
    estado: ESTADOS.EM_ANDAMENTO,
    situacao: SITUACOES.EM_ANDAMENTO,
    iniciada_em: dataAgora.toISOString(),
  }
}

export function concluirViagem(oferta, agora = new Date()) {
  if (!oferta || typeof oferta !== 'object') throw new TypeError('oferta inválida')
  if (oferta.estado !== ESTADOS.EM_ANDAMENTO) {
    throw new ConflictError('Somente viagens em andamento podem ser concluídas')
  }

  const dataAgora = resolverAgora(agora)
  return {
    ...copiarOferta(oferta),
    estado: ESTADOS.CONCLUIDA,
    situacao: SITUACOES.CONCLUIDA,
    concluida_em: dataAgora.toISOString(),
  }
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ConflictError(error.message)
  throw error
}

export class ExecucaoViagemService {
  constructor({
    ofertas = new OfertaRepository(),
    historico = new HistoricoService(),
    agora = () => new Date(),
  } = {}) {
    this.ofertas = ofertas
    this.historico = historico
    this.agora = typeof agora === 'function' ? agora : () => agora
  }

  async iniciar(ofertaId, motoristaId, connection) {
    const executar = async (tx) => {
      try {
        const oferta = await this.ofertas.buscarPorId(ofertaId, tx)
        if (!oferta) throw new NotFoundError('Oferta não encontrada')
        if (Number(oferta.motorista_id) !== Number(motoristaId)) {
          throw new ForbiddenError('Somente o motorista da oferta pode iniciá-la')
        }

        const agora = resolverAgora(this.agora())
        iniciarViagem(oferta, agora)

        const atualizada = await this.ofertas.atualizarEstado(oferta.id, ESTADOS.EM_ANDAMENTO, {
          iniciada_em: agora.toISOString(),
        }, tx)

        if (this.historico?.registrarInicioViagem) {
          await this.historico.registrarInicioViagem({
            oferta_id: oferta.id,
            ator_usuario_id: motoristaId,
            detalhes: { iniciada_em: agora.toISOString() },
          }, tx)
        }

        return atualizada
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return executar(connection)
    const conn = await getConnection()
    return conn.transaction(executar)
  }

  async concluir(ofertaId, motoristaId, connection) {
    const executar = async (tx) => {
      try {
        const oferta = await this.ofertas.buscarPorId(ofertaId, tx)
        if (!oferta) throw new NotFoundError('Oferta não encontrada')
        if (Number(oferta.motorista_id) !== Number(motoristaId)) {
          throw new ForbiddenError('Somente o motorista da oferta pode concluí-la')
        }

        const agora = resolverAgora(this.agora())
        concluirViagem(oferta, agora)

        const atualizada = await this.ofertas.atualizarEstado(oferta.id, ESTADOS.CONCLUIDA, {
          concluida_em: agora.toISOString(),
        }, tx)

        if (this.historico?.registrarConclusaoViagem) {
          await this.historico.registrarConclusaoViagem({
            oferta_id: oferta.id,
            ator_usuario_id: motoristaId,
            detalhes: { concluida_em: agora.toISOString() },
          }, tx)
        }

        return atualizada
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return executar(connection)
    const conn = await getConnection()
    return conn.transaction(executar)
  }
}

export const execucaoViagemService = new ExecucaoViagemService()
export default ExecucaoViagemService
