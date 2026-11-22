import { getConnection } from '../db/connection.js'
import {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import {
  OfertaRepository,
  normalizarAtualizacao,
  normalizarOferta,
} from '../repositories/ofertaRepository.js'
import { parseDateTime } from '../utils/dateTime.js'
import { HistoricoService } from './historicoService.js'
import { VeiculoService } from './veiculoService.js'

const CAMPOS_CRIACAO = Object.freeze([
  'veiculo_id',
  'veiculoId',
  'recorrencia_id',
  'recorrenciaId',
  'origem',
  'destino',
  'paradas',
  'percurso',
  'pontos',
  'data_hora_saida',
  'dataHoraSaida',
  'vagas_total',
  'vagas',
  'valor',
])

const CAMPOS_EDICAO = Object.freeze([
  'veiculo_id',
  'veiculoId',
  'recorrencia_id',
  'recorrenciaId',
  'origem',
  'destino',
  'paradas',
  'percurso',
  'pontos',
  'data_hora_saida',
  'dataHoraSaida',
  'vagas_total',
  'vagas',
  'valor',
])

function somenteCampos(dados, campos, nome) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new ValidationError(`${nome} inválidos`)
  }

  const limpos = {}
  for (const campo of campos) {
    if (dados[campo] !== undefined) limpos[campo] = dados[campo]
  }
  return limpos
}

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

function detalhesCriacao(oferta) {
  return {
    veiculo_id: oferta.veiculo_id,
    origem: oferta.origem,
    destino: oferta.destino,
    paradas: oferta.paradas,
    data_hora_saida: oferta.data_hora_saida,
    vagas_total: oferta.vagas_total,
    valor: oferta.valor,
  }
}

function mesmoValorProtegido(campo, alterado, atual) {
  if (campo === 'data_hora_saida') {
    const dataAlterada = parseDateTime(alterado)
    const dataAtual = parseDateTime(atual)
    return Boolean(dataAlterada && dataAtual && dataAlterada.getTime() === dataAtual.getTime())
  }
  return String(alterado).trim() === String(atual ?? '').trim()
}

function alterouDadosProtegidos(alteracoes, atual) {
  const campos = ['origem', 'destino', 'data_hora_saida']
  return campos.some((campo) => (
    alteracoes[campo] !== undefined
    && !mesmoValorProtegido(campo, alteracoes[campo], atual[campo])
  ))
}

function valorEquivalente(campo, alterado, atual) {
  if (alterado === undefined) return true
  if (campo === 'data_hora_saida') return mesmoValorProtegido(campo, alterado, atual)

  if (campo === 'paradas') {
    let atuais = atual
    if (typeof atuais === 'string') {
      try {
        atuais = JSON.parse(atuais)
      } catch {
        atuais = []
      }
    }
    return JSON.stringify(alterado) === JSON.stringify(atuais ?? [])
  }

  if (['veiculo_id', 'recorrencia_id', 'vagas_total', 'valor'].includes(campo)) {
    if (alterado === null || atual === null || atual === undefined) {
      return alterado === null && (atual === null || atual === undefined)
    }
    return Number(alterado) === Number(atual)
  }

  return String(alterado).trim() === String(atual ?? '').trim()
}

function somenteAlteracoesEfetivas(alteracoes, atual) {
  const efetivas = {}
  for (const [campo, valor] of Object.entries(alteracoes)) {
    if (!valorEquivalente(campo, valor, atual[campo])) efetivas[campo] = valor
  }
  return efetivas
}

export class OfertaService {
  constructor({
    ofertas = new OfertaRepository(),
    veiculos = new VeiculoService(),
    historico = new HistoricoService(),
  } = {}) {
    this.ofertas = ofertas
    this.veiculos = veiculos
    this.historico = historico
  }

  async criar(motoristaId, dados, connection) {
    const limpos = somenteCampos(dados, CAMPOS_CRIACAO, 'Dados de oferta')

    const executar = async (tx) => {
      try {
        const normalizado = normalizarOferta({ ...limpos, motorista_id: motoristaId })
        await this.veiculos.validarVagas(
          normalizado.veiculo_id,
          normalizado.vagas_total,
          motoristaId,
          tx,
        )

        const oferta = await this.ofertas.criarAvulsa(motoristaId, normalizado, tx)
        await this.historico.registrarOfertaCriada({
          oferta_id: oferta.id,
          ator_usuario_id: motoristaId,
          detalhes: detalhesCriacao(oferta),
        }, tx)
        return oferta
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return executar(connection)
    const conn = await getConnection()
    return conn.transaction(executar)
  }

  async buscarPorId(id, connection) {
    try {
      const oferta = await this.ofertas.buscarPorId(id, connection)
      if (!oferta) throw new NotFoundError('Oferta não encontrada')
      return oferta
    } catch (error) {
      traduzirErro(error)
    }
  }

  async listar(filtros = {}, connection) {
    try {
      return await this.ofertas.listar(filtros, connection)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async atualizar(id, motoristaId, dados, connection) {
    const limpos = somenteCampos(dados, CAMPOS_EDICAO, 'Dados de edição')

    const executar = async (tx) => {
      try {
        const atual = await this.ofertas.buscarPorId(id, tx)
        if (!atual) throw new NotFoundError('Oferta não encontrada')
        if (Number(atual.motorista_id) !== Number(motoristaId)) {
          throw new ForbiddenError('Somente o motorista da oferta pode editá-la')
        }

        const alteracoes = somenteAlteracoesEfetivas(normalizarAtualizacao(limpos), atual)
        if (Object.keys(alteracoes).length === 0) return atual

        const reservasConfirmadas = Number(atual.reservas_confirmadas ?? 0)
        if (reservasConfirmadas > 0 && alterouDadosProtegidos(alteracoes, atual)) {
          throw new ConflictError('Origem, destino e horário não podem ser alterados após reservas')
        }

        const veiculoId = primeiroDefinido(alteracoes.veiculo_id, atual.veiculo_id)
        const vagasTotal = Number(primeiroDefinido(alteracoes.vagas_total, atual.vagas_total))
        await this.veiculos.validarVagas(veiculoId, vagasTotal, motoristaId, tx)

        if (vagasTotal < reservasConfirmadas) {
          throw new ConflictError('vagas_total não pode ficar abaixo das reservas confirmadas')
        }

        const oferta = await this.ofertas.atualizar(id, alteracoes, tx)
        if (!oferta) throw new NotFoundError('Oferta não encontrada')

        if (Object.keys(alteracoes).length > 0) {
          await this.historico.registrarEdicaoOferta({
            oferta_id: oferta.id,
            ator_usuario_id: motoristaId,
            alteracoes,
          }, tx)
        }

        return oferta
      } catch (error) {
        traduzirErro(error)
      }
    }

    if (connection) return executar(connection)
    const conn = await getConnection()
    return conn.transaction(executar)
  }
}

export const ofertaService = new OfertaService()

export default OfertaService
