import { ValidationError } from '../middlewares/errorHandler.js'
import {
  NATUREZAS,
  TIPOS_EVENTO,
  HistoricoRepository,
  normalizarEvento,
  normalizarFiltros,
} from '../repositories/historicoRepository.js'

export { NATUREZAS, TIPOS_EVENTO } from '../repositories/historicoRepository.js'

function exigirObjeto(value, nome) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${nome} deve ser um objeto`)
  }
  return value
}

function exigirId(value, nome) {
  const numero = Number(value)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ValidationError(`${nome} deve ser um inteiro positivo`)
  }
  return numero
}

function exigirTexto(value, nome) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${nome} é obrigatório`)
  }
  return value.trim()
}

function detalhesOpcionais(value) {
  if (value === undefined || value === null) return {}
  return exigirObjeto(value, 'detalhes')
}

function primeiroDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null)
}

function traduzirErro(error) {
  return error instanceof TypeError ? new ValidationError(error.message) : error
}

export class HistoricoService {
  constructor(repository = new HistoricoRepository()) {
    this.repository = repository
  }

  async registrarEvento(evento, connection) {
    exigirObjeto(evento, 'Evento de histórico')

    try {
      normalizarEvento(evento)
      return await this.repository.criar(evento, connection)
    } catch (error) {
      throw traduzirErro(error)
    }
  }

  async registrarEventos(eventos, connection) {
    if (!Array.isArray(eventos)) throw new ValidationError('Eventos devem ser uma lista')

    const resultados = []
    for (const evento of eventos) {
      resultados.push(await this.registrarEvento(evento, connection))
    }
    return resultados
  }

  async listar(filtros = {}, connection) {
    try {
      normalizarFiltros(filtros)
      return await this.repository.listar(filtros, connection)
    } catch (error) {
      throw traduzirErro(error)
    }
  }

  async listarPorEntidade(entidadeTipo, entidadeId, filtros = {}, connection) {
    return this.listar({ ...filtros, entidadeTipo, entidadeId }, connection)
  }

  async listarPorAtor(atorUsuarioId, filtros = {}, connection) {
    return this.listar({ ...filtros, atorUsuarioId }, connection)
  }

  async contar(filtros = {}, connection) {
    try {
      normalizarFiltros(filtros)
      return await this.repository.contar(filtros, connection)
    } catch (error) {
      throw traduzirErro(error)
    }
  }

  async registrarOfertaCriada(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const ofertaId = exigirId(primeiroDefinido(dados.ofertaId, dados.oferta_id), 'oferta_id')

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.OFERTA_CRIADA,
      entidadeTipo: 'oferta',
      entidadeId: ofertaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.CRIACAO_OFERTA,
      detalhes: { oferta_id: ofertaId, ...detalhesOpcionais(dados.detalhes) },
    }, connection)
  }

  async registrarEdicaoOferta(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const ofertaId = exigirId(primeiroDefinido(dados.ofertaId, dados.oferta_id), 'oferta_id')
    const alteracoes = dados.alteracoes === undefined ? {} : dados.alteracoes

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.OFERTA_EDITADA,
      entidadeTipo: 'oferta',
      entidadeId: ofertaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.EDICAO_OFERTA,
      detalhes: {
        oferta_id: ofertaId,
        alteracoes,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarReservaCriada(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const reservaId = exigirId(primeiroDefinido(dados.reservaId, dados.reserva_id), 'reserva_id')
    const ofertaId = exigirId(primeiroDefinido(dados.ofertaId, dados.oferta_id), 'oferta_id')
    const passageiroId = exigirId(
      primeiroDefinido(dados.passageiroId, dados.passageiro_id),
      'passageiro_id',
    )

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.RESERVA_CRIADA,
      entidadeTipo: 'reserva',
      entidadeId: reservaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id, passageiroId),
      natureza: NATUREZAS.RESERVA_CONFIRMADA,
      detalhes: {
        reserva_id: reservaId,
        oferta_id: ofertaId,
        passageiro_id: passageiroId,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarCancelamentoOferta(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const ofertaId = exigirId(primeiroDefinido(dados.ofertaId, dados.oferta_id), 'oferta_id')

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.OFERTA_CANCELADA,
      entidadeTipo: 'oferta',
      entidadeId: ofertaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: dados.natureza ?? NATUREZAS.CANCELAMENTO_COMUM,
      detalhes: {
        oferta_id: ofertaId,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarCancelamentoReserva(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const reservaId = exigirId(primeiroDefinido(dados.reservaId, dados.reserva_id), 'reserva_id')

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.RESERVA_CANCELADA,
      entidadeTipo: 'reserva',
      entidadeId: reservaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: dados.natureza ?? NATUREZAS.CANCELAMENTO_COMUM,
      detalhes: {
        reserva_id: reservaId,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarCancelamentoPorExclusaoConta(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const entidadeTipo = exigirTexto(
      primeiroDefinido(dados.entidadeTipo, dados.entidade_tipo),
      'entidade_tipo',
    )
    const entidadeId = exigirId(
      primeiroDefinido(dados.entidadeId, dados.entidade_id),
      'entidade_id',
    )
    const tipoEvento = entidadeTipo === 'reserva'
      ? TIPOS_EVENTO.RESERVA_CANCELADA
      : TIPOS_EVENTO.OFERTA_CANCELADA

    return this.registrarEvento({
      tipoEvento,
      entidadeTipo,
      entidadeId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.CANCELAMENTO_EXCLUSAO_CONTA,
      detalhes: {
        entidade_id: entidadeId,
        natureza_cancelamento: 'exclusao_conta',
        gera_penalidade: false,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarNoShowPassageiro(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const reservaId = exigirId(primeiroDefinido(dados.reservaId, dados.reserva_id), 'reserva_id')
    const ofertaId = exigirId(primeiroDefinido(dados.ofertaId, dados.oferta_id), 'oferta_id')
    const passageiroId = exigirId(
      primeiroDefinido(dados.passageiroId, dados.passageiro_id),
      'passageiro_id',
    )

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.NO_SHOW_PASSAGEIRO,
      entidadeTipo: 'reserva',
      entidadeId: reservaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.NO_SHOW_PASSAGEIRO,
      detalhes: {
        reserva_id: reservaId,
        oferta_id: ofertaId,
        passageiro_id: passageiroId,
        vaga_liberada: false,
        pontos: dados.pontos ?? 2,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarAusenciaMotorista(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const ofertaId = exigirId(primeiroDefinido(dados.ofertaId, dados.oferta_id), 'oferta_id')
    const motoristaId = exigirId(
      primeiroDefinido(dados.motoristaId, dados.motorista_id),
      'motorista_id',
    )

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.AUSENCIA_MOTORISTA,
      entidadeTipo: 'oferta',
      entidadeId: ofertaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.AUSENCIA_MOTORISTA,
      detalhes: {
        oferta_id: ofertaId,
        motorista_id: motoristaId,
        viagem_cancelada: true,
        pontos: dados.pontos ?? 2,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarInicioViagem(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const ofertaId = exigirId(primeiroDefinido(dados.ofertaId, dados.oferta_id), 'oferta_id')

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.VIAGEM_INICIADA,
      entidadeTipo: 'oferta',
      entidadeId: ofertaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.INICIO_VIAGEM,
      detalhes: {
        oferta_id: ofertaId,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarConclusaoViagem(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const ofertaId = exigirId(primeiroDefinido(dados.ofertaId, dados.oferta_id), 'oferta_id')

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.VIAGEM_CONCLUIDA,
      entidadeTipo: 'oferta',
      entidadeId: ofertaId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.CONCLUSAO_VIAGEM,
      detalhes: {
        oferta_id: ofertaId,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarPenalidade(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const penalidadeId = exigirId(
      primeiroDefinido(dados.penalidadeId, dados.penalidade_id),
      'penalidade_id',
    )
    const usuarioId = exigirId(primeiroDefinido(dados.usuarioId, dados.usuario_id), 'usuario_id')

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.PENALIDADE_REGISTRADA,
      entidadeTipo: 'penalidade',
      entidadeId: penalidadeId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.PENALIDADE_REGISTRADA,
      detalhes: {
        penalidade_id: penalidadeId,
        usuario_id: usuarioId,
        pontos: dados.pontos,
        motivo: dados.motivo,
        referencia: dados.referencia,
        bloqueio_automatico: false,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarExclusaoConta(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const usuarioId = exigirId(primeiroDefinido(dados.usuarioId, dados.usuario_id), 'usuario_id')

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.CONTA_EXCLUIDA,
      entidadeTipo: 'usuario',
      entidadeId: usuarioId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id, usuarioId),
      natureza: NATUREZAS.CONTA_EXCLUIDA,
      detalhes: {
        usuario_id: usuarioId,
        conta_ativa: false,
        dados_anonimizados: true,
        historico_preservado: true,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }

  async registrarAvaliacao(input = {}, connection) {
    const dados = exigirObjeto(input, 'Dados do evento')
    const avaliacaoId = exigirId(
      primeiroDefinido(dados.avaliacaoId, dados.avaliacao_id),
      'avaliacao_id',
    )

    return this.registrarEvento({
      tipoEvento: TIPOS_EVENTO.AVALIACAO_REGISTRADA,
      entidadeTipo: 'avaliacao',
      entidadeId: avaliacaoId,
      atorUsuarioId: primeiroDefinido(dados.atorUsuarioId, dados.ator_usuario_id),
      natureza: NATUREZAS.AVALIACAO_REGISTRADA,
      detalhes: {
        avaliacao_id: avaliacaoId,
        ...detalhesOpcionais(dados.detalhes),
      },
    }, connection)
  }
}

export const historicoService = new HistoricoService()
export default historicoService
