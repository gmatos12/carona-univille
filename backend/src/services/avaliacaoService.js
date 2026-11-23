import { withImmediateTransaction } from '../db/connection.js'
import { ApiError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { AvaliacaoRepository } from '../repositories/avaliacaoRepository.js'
import { OfertaRepository, ESTADOS } from '../repositories/ofertaRepository.js'
import { HistoricoService } from './historicoService.js'

function idPositivo(value, nome) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${nome} inválido`)
  return n
}
function notaValida(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new ValidationError('nota deve ser entre 1 e 5')
  return n
}
function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

export class AvaliacaoService {
  constructor({
    avaliacoes = new AvaliacaoRepository(),
    ofertas = new OfertaRepository(),
    historico = new HistoricoService(),
  } = {}) {
    this.avaliacoes = avaliacoes
    this.ofertas = ofertas
    this.historico = historico
  }

  async avaliar(ofertaId, avaliadorId, dados = {}, connection) {
    const idOferta = idPositivo(ofertaId, 'oferta_id')
    const idAvaliador = idPositivo(avaliadorId, 'avaliador_id')
    const avaliadoId = idPositivo(dados.avaliado_id ?? dados.avaliadoId, 'avaliado_id')
    const nota = notaValida(dados.nota)

    const executar = async (tx) => {
      try {
        const oferta = await this.ofertas.buscarPorId(idOferta, tx)
        if (!oferta) throw new NotFoundError('Oferta não encontrada')
        if (oferta.estado !== ESTADOS.CONCLUIDA) {
          throw new ConflictError('Avaliação permitida apenas para viagem concluída')
        }
        if (await this.avaliacoes.existeNoShowNaOferta(idOferta, tx)) {
          throw new ConflictError('Viagens com registro de no-show não permitem avaliações')
        }
        const avaliadorParticipante = await this.ofertas.eParticipante(idOferta, idAvaliador, tx)
        const avaliadoParticipante = await this.ofertas.eParticipante(idOferta, avaliadoId, tx)
        if (!avaliadorParticipante || !avaliadoParticipante || idAvaliador === avaliadoId) {
          throw new ForbiddenError('Avaliador e avaliado devem ser participantes distintos da viagem')
        }
        const existente = await this.avaliacoes.buscarPorOfertaEAvaliador(idOferta, idAvaliador, tx)
        if (existente) throw new ConflictError('Participante já avaliou esta viagem')

        const avaliacao = await this.avaliacoes.criar({
          oferta_id: idOferta, avaliador_id: idAvaliador, avaliado_id: avaliadoId, nota,
        }, tx)

        if (this.historico?.registrarAvaliacao) {
          await this.historico.registrarAvaliacao({
            avaliacao_id: avaliacao.id,
            ator_usuario_id: idAvaliador,
            detalhes: { oferta_id: idOferta, avaliado_id: avaliadoId, nota },
          }, tx)
        }

        return avaliacao
      } catch (error) { traduzirErro(error) }
    }

    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }
}

export const avaliacaoService = new AvaliacaoService()
export default AvaliacaoService
