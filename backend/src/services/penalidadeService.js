import {
  ApiError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import {
  PenalidadeRepository,
  normalizarReferencia,
} from '../repositories/penalidadeRepository.js'
import { HistoricoService } from './historicoService.js'

export { PONTOS, PONTOS_EVENTO } from '../repositories/penalidadeRepository.js'

const NATUREZAS_EXCLUSAO_CONTA = new Set([
  'exclusao_conta',
  'exclusao_de_conta',
  'cancelamento_exclusao_conta',
  'cancelamento_de_exclusao_conta',
  'cancelamento_por_exclusao_conta',
  'cancelamento_por_exclusao_de_conta',
  'conta_excluida',
])

export function normalizarNaturezaCancelamento(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function geraPenalidadeCancelamento(natureza) {
  return !NATUREZAS_EXCLUSAO_CONTA.has(normalizarNaturezaCancelamento(natureza))
}

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

function tipoEventoObrigatorio(value) {
  const tipoEvento = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

  if (tipoEvento === '') throw new ValidationError('tipo_evento é obrigatório')
  return tipoEvento
}

function referenciaObrigatoria(dados) {
  try {
    if (dados.referencia !== undefined && dados.referencia !== null) {
      return normalizarReferencia(dados)
    }

    const reservaId = primeiroDefinido(dados.reserva_id, dados.reservaId)
    if (reservaId !== undefined) return `reserva:${exigirId(reservaId, 'reserva_id')}`

    const ofertaId = primeiroDefinido(dados.oferta_id, dados.ofertaId)
    if (ofertaId !== undefined) return `oferta:${exigirId(ofertaId, 'oferta_id')}`

    const viagemId = primeiroDefinido(dados.viagem_id, dados.viagemId)
    if (viagemId !== undefined) return `viagem:${exigirId(viagemId, 'viagem_id')}`

    throw new ValidationError('referência é obrigatória')
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ValidationError(error.message)
  }
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

export class PenalidadeService {
  constructor({
    penalidades = new PenalidadeRepository(),
    historico = new HistoricoService(),
  } = {}) {
    this.penalidades = penalidades
    this.historico = historico
  }

  async registrar(dados = {}, connection) {
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
      throw new ValidationError('Dados de penalidade inválidos')
    }

    try {
      const tipoEvento = tipoEventoObrigatorio(
        primeiroDefinido(dados.tipo_evento, dados.tipoEvento, dados.evento),
      )
      const penalidade = await this.penalidades.criar({
        ...dados,
        usuario_id: exigirId(
          primeiroDefinido(dados.usuario_id, dados.usuarioId, dados.usuario?.id),
          'usuario_id',
        ),
        tipo_evento: tipoEvento,
        referencia: referenciaObrigatoria(dados),
      }, connection)

      await this.historico.registrarPenalidade({
        penalidade_id: penalidade.id,
        usuario_id: penalidade.usuario_id,
        pontos: penalidade.pontos,
        motivo: penalidade.motivo,
        referencia: penalidade.referencia,
        ator_usuario_id: primeiroDefinido(
          dados.ator_usuario_id,
          dados.atorUsuarioId,
          penalidade.usuario_id,
        ),
      }, connection)

      return penalidade
    } catch (error) {
      traduzirErro(error)
    }
  }

  async registrarPenalidade(dados = {}, connection) {
    return this.registrar(dados, connection)
  }

  async registrarCancelamentoPassageiro(dados = {}, connection) {
    if (!geraPenalidadeCancelamento(dados?.natureza)) return null

    return this.registrar({
      ...dados,
      tipo_evento: 'CANCELAMENTO_PASSAGEIRO_MENOS_24H',
      motivo: dados.motivo ?? 'Cancelamento do passageiro com menos de 24 horas',
    }, connection)
  }

  async registrarCancelamentoMotorista(dados = {}, connection) {
    if (!geraPenalidadeCancelamento(dados?.natureza)) return null

    return this.registrar({
      ...dados,
      tipo_evento: 'CANCELAMENTO_MOTORISTA_COM_RESERVAS',
      motivo: dados.motivo ?? 'Cancelamento do motorista com reservas confirmadas',
    }, connection)
  }

  async registrarNoShowPassageiro(dados = {}, connection) {
    if (!geraPenalidadeCancelamento(dados?.natureza)) return null

    return this.registrar({
      ...dados,
      tipo_evento: 'NO_SHOW_PASSAGEIRO',
      motivo: dados.motivo ?? 'No-show do passageiro',
    }, connection)
  }

  async registrarAusenciaMotorista(dados = {}, connection) {
    if (!geraPenalidadeCancelamento(dados?.natureza)) return null

    return this.registrar({
      ...dados,
      tipo_evento: 'AUSENCIA_MOTORISTA',
      motivo: dados.motivo ?? 'Ausência do motorista',
    }, connection)
  }
}

export const penalidadeService = new PenalidadeService()
export default PenalidadeService
