import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api.js'
import { avaliarOferta, mensagemErroAvaliacao } from '../services/avaliacaoService.js'
import {
  cancelarOferta as cancelarOfertaApi,
  cancelarReserva as cancelarReservaApi,
  mensagemPenalidadeMotorista,
  mensagemPrazoCancelamento,
  mensagemSucessoCancelamentoOferta,
  mensagemSucessoCancelamentoReserva,
  podeCancelarPassageiro,
} from '../services/cancelamentoService.js'

export const CATEGORIAS_MINHAS_VIAGENS = Object.freeze([
  'oferecidas',
  'reservadas',
  'concluidas',
  'canceladas',
])

export const ROTULOS_CATEGORIA = Object.freeze({
  oferecidas: 'Oferecidas',
  reservadas: 'Reservadas',
  concluidas: 'Concluídas',
  canceladas: 'Canceladas',
})

export const ROTULOS_SITUACAO = Object.freeze({
  ABERTA: 'Aberta',
  LOTADA: 'Lotada',
  AGUARDANDO_INICIO: 'Aguardando início',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
})

export function normalizarCategoria(valor) {
  const categoria = String(valor ?? '').trim().toLowerCase()
  return CATEGORIAS_MINHAS_VIAGENS.includes(categoria) ? categoria : 'oferecidas'
}

export function extrairViagens(resposta) {
  const corpo = resposta?.data ?? resposta
  const valores = corpo?.ofertas ?? corpo?.resultados ?? corpo
  return Array.isArray(valores) ? valores : []
}

export function extrairCategorias(resposta) {
  const corpo = resposta?.data ?? resposta
  if (Array.isArray(corpo?.categorias) && corpo.categorias.length > 0) {
    return corpo.categorias.map(normalizarCategoria)
  }
  return [...CATEGORIAS_MINHAS_VIAGENS]
}

export async function buscarViagens(categoria) {
  const resposta = await api.get('/minhas-viagens', {
    params: { tipo: normalizarCategoria(categoria) },
  })
  const corpo = resposta?.data ?? resposta
  const viagens = extrairViagens(resposta)
  const total = corpo?.total === undefined ? viagens.length : Number(corpo.total)

  return {
    viagens,
    categorias: extrairCategorias(resposta),
    total: Number.isFinite(total) ? total : viagens.length,
  }
}

export function normalizarViagem(item = {}) {
  const oferta = item?.oferta && typeof item.oferta === 'object' ? item.oferta : item
  return { ...oferta, ...item, oferta }
}

export function identificadorOferta(item) {
  return item?.oferta_id ?? item?.id ?? item?.oferta?.id ?? null
}

export function identificadorReserva(item) {
  return item?.reserva_id ?? item?.id_reserva ?? item?.reserva?.id ?? null
}

export function chaveReserva(item) {
  return `reserva-${identificadorReserva(item) ?? identificadorOferta(item)}`
}

export function chaveOferta(item) {
  return `oferta-${identificadorOferta(item)}`
}

export function chaveAvaliacao(item) {
  return `avaliar-${identificadorOferta(item)}`
}

export function dataHoraDaViagem(item) {
  const viagem = normalizarViagem(item)
  return viagem?.data_hora_saida ?? viagem?.dataHoraSaida ?? ''
}

export function rotuloDataHora(valor) {
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return 'Horário não informado'
  return data.toLocaleString('pt-BR')
}

export function rotuloPercurso(item) {
  const viagem = normalizarViagem(item)
  const paradas = Array.isArray(viagem?.paradas) ? viagem.paradas : []
  return [viagem?.origem, ...paradas, viagem?.destino]
    .filter(Boolean)
    .join(' → ') || 'Viagem'
}

export function statusDaReserva(item) {
  const status = item?.reserva_status ?? item?.status
  return status === null || status === undefined ? '' : String(status).toUpperCase()
}

export function rotuloStatusReserva(status) {
  const rotulos = Object.freeze({
    CONFIRMADA: 'Confirmada',
    CANCELADA: 'Cancelada',
    NO_SHOW: 'Não compareceu',
  })
  const valor = String(status ?? '').toUpperCase()
  return rotulos[valor] ?? valor
}

export function situacaoDaViagem(item) {
  const viagem = normalizarViagem(item)
  return String(viagem?.situacao ?? viagem?.estado ?? 'ABERTA').toUpperCase()
}

export function rotuloSituacao(situacao) {
  const valor = String(situacao ?? '').toUpperCase()
  return ROTULOS_SITUACAO[valor] ?? valor
}

export function rotuloVisibilidade(item) {
  const situacao = situacaoDaViagem(item)
  if (['CONCLUIDA', 'CANCELADA'].includes(situacao)) return 'Fora da busca'
  if (item?.visivel_na_busca === false) return 'Visível somente a participantes'
  if (situacao === 'LOTADA') return 'Lotada (visível na busca)'
  if (item?.aceita_reservas === false) return 'Sem novas reservas'
  return 'Visível na busca'
}

export function rotuloPapel(item) {
  const papel = String(item?.papel ?? '')
  const rotulos = Object.freeze({
    motorista: 'Motorista',
    passageiro: 'Passageiro',
    motorista_e_passageiro: 'Motorista e passageiro',
  })
  return rotulos[papel] ?? papel
}

export function podeCancelarReservaViagem(item) {
  const status = statusDaReserva(item)
  return Boolean(identificadorReserva(item))
    && (status === '' || status === 'CONFIRMADA')
    && podeCancelarPassageiro(dataHoraDaViagem(item))
}

export function podeCancelarOfertaViagem(item, categoria = '') {
  const papel = String(item?.papel ?? (categoria === 'oferecidas' ? 'motorista' : ''))
  const situacao = situacaoDaViagem(item)
  return Boolean(identificadorOferta(item))
    && papel.includes('motorista')
    && !['CANCELADA', 'CONCLUIDA'].includes(situacao)
}

export function avaliadoDaViagem(item) {
  const viagem = normalizarViagem(item)
  const papel = String(viagem?.papel ?? '')
  const motoristaId = viagem?.motorista_id
    ?? viagem?.motoristaId
    ?? viagem?.motorista?.id
    ?? viagem?.motorista?.usuario_id
  const passageiroId = viagem?.passageiro_id
    ?? viagem?.passageiro?.id
    ?? viagem?.reserva?.passageiro_id
    ?? viagem?.reservas?.[0]?.passageiro_id

  if (papel === 'passageiro') return { id: motoristaId, tipo: 'motorista' }
  if (papel.includes('motorista')) return { id: passageiroId, tipo: 'passageiro' }
  return motoristaId
    ? { id: motoristaId, tipo: 'motorista' }
    : { id: passageiroId, tipo: 'passageiro' }
}

export function mensagemErroViagens(error, fallback = 'Não foi possível carregar suas viagens.') {
  const detalhes = error?.details
  if (Array.isArray(detalhes)) {
    const mensagens = detalhes
      .map((detalhe) => detalhe?.message ?? detalhe?.msg)
      .filter((mensagem) => typeof mensagem === 'string' && mensagem.trim())
    if (mensagens.length > 0) return mensagens.join(' ')
  }

  const mensagem = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : ''
  const status = error?.status ?? error?.statusCode

  if (status === 400) return mensagem || 'Escolha uma categoria válida.'
  if (status === 401) return mensagem || 'Entre na sua conta para ver suas viagens.'
  return mensagem || fallback
}

function Feedback({ feedback }) {
  if (!feedback) return null

  return (
    <p
      className={`auth-message auth-message-${feedback.tipo === 'sucesso' ? 'success' : 'error'}`}
      role={feedback.tipo === 'sucesso' ? 'status' : 'alert'}
      aria-live="polite"
    >
      {feedback.mensagem}
    </p>
  )
}

export function MinhasViagensPage() {
  const [categoria, setCategoria] = useState('oferecidas')
  const [viagens, setViagens] = useState([])
  const [categorias, setCategorias] = useState([...CATEGORIAS_MINHAS_VIAGENS])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [feedbacks, setFeedbacks] = useState({})
  const [processando, setProcessando] = useState({})
  const [notas, setNotas] = useState({})

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErro('')
      try {
        const resultado = await buscarViagens(categoria)
        if (!ativo) return
        setViagens(resultado.viagens)
        setCategorias(resultado.categorias)
        setTotal(resultado.total)
      } catch (error) {
        if (ativo) {
          setViagens([])
          setTotal(0)
          setErro(mensagemErroViagens(error))
        }
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [categoria])

  function definirFeedback(chave, tipo, mensagem) {
    setFeedbacks((anterior) => ({ ...anterior, [chave]: { tipo, mensagem } }))
  }

  function definirProcessando(chave, valor) {
    setProcessando((anterior) => ({ ...anterior, [chave]: valor }))
  }

  function atualizarViagem(chave, alteracoes) {
    setViagens((anterior) => anterior.map((item) => (
      chaveOferta(item) === chave || chaveReserva(item) === chave
        ? { ...item, ...alteracoes }
        : item
    )))
  }

  async function cancelarReserva(item) {
    const reservaId = identificadorReserva(item)
    if (!reservaId) return

    const chave = chaveReserva(item)
    definirProcessando(chave, true)
    try {
      const cancelamento = await cancelarReservaApi(reservaId)
      atualizarViagem(chave, {
        reserva_status: 'CANCELADA',
        status: 'CANCELADA',
        situacao: 'CANCELADA',
        visivel_na_busca: false,
        aceita_reservas: false,
      })
      definirFeedback(chave, 'sucesso', mensagemSucessoCancelamentoReserva(cancelamento))
    } catch (error) {
      definirFeedback(
        chave,
        'erro',
        mensagemErroViagens(error, 'Não foi possível cancelar a reserva.'),
      )
    } finally {
      definirProcessando(chave, false)
    }
  }

  async function cancelarOferta(item) {
    const ofertaId = identificadorOferta(item)
    if (!ofertaId) return

    const chave = chaveOferta(item)
    definirProcessando(chave, true)
    try {
      const cancelamento = await cancelarOfertaApi(ofertaId)
      atualizarViagem(chave, {
        estado: 'CANCELADA',
        situacao: 'CANCELADA',
        visivel_na_busca: false,
        aceita_reservas: false,
      })
      definirFeedback(chave, 'sucesso', mensagemSucessoCancelamentoOferta(cancelamento))
    } catch (error) {
      definirFeedback(
        chave,
        'erro',
        mensagemErroViagens(error, 'Não foi possível cancelar a oferta.'),
      )
    } finally {
      definirProcessando(chave, false)
    }
  }

  async function avaliar(item) {
    const ofertaId = identificadorOferta(item)
    const avaliado = avaliadoDaViagem(item)
    if (!ofertaId || !avaliado.id) return

    const chave = chaveAvaliacao(item)
    definirProcessando(chave, true)
    try {
      await avaliarOferta(ofertaId, {
        avaliadoId: avaliado.id,
        nota: Number(notas[chave] ?? 5),
      })
      definirFeedback(chave, 'sucesso', 'Avaliação registrada.')
    } catch (error) {
      definirFeedback(chave, 'erro', mensagemErroAvaliacao(error))
    } finally {
      definirProcessando(chave, false)
    }
  }

  return (
    <section className="minhas-viagens-page">
      <h1>Minhas viagens</h1>
      <p>
        Consulte viagens oferecidas, reservadas, concluídas e canceladas, além da
        visibilidade de cada oferta na busca.
      </p>

      {erro && (
        <p className="auth-message auth-message-error" role="alert" aria-live="assertive">
          {erro}
        </p>
      )}

      <div className="form-field minhas-viagens-filtros">
        <label htmlFor="minhas-viagens-categoria">Categoria</label>
        <select
          id="minhas-viagens-categoria"
          value={categoria}
          onChange={(evento) => setCategoria(normalizarCategoria(evento.target.value))}
          disabled={carregando}
        >
          {categorias.map((opcao) => {
            const valor = normalizarCategoria(opcao)
            return (
              <option key={valor} value={valor}>
                {ROTULOS_CATEGORIA[valor] ?? valor}
              </option>
            )
          })}
        </select>
      </div>

      {carregando ? (
        <p>Carregando viagens...</p>
      ) : (
        <>
          <p className="form-hint">
            {total} {total === 1 ? 'viagem' : 'viagens'} em{' '}
            {ROTULOS_CATEGORIA[categoria] ?? categoria}.
          </p>

          {viagens.length === 0 ? (
            <p>Nenhuma viagem nesta categoria.</p>
          ) : (
            <ul className="ofertas-lista">
              {viagens.map((item, indice) => {
                const viagem = normalizarViagem(item)
                const ofertaId = identificadorOferta(viagem)
                const chaveOfertaItem = chaveOferta(viagem)
                const chaveReservaItem = chaveReserva(viagem)
                const chaveAvaliacaoItem = chaveAvaliacao(viagem)
                const situacao = situacaoDaViagem(viagem)
                const dataHora = dataHoraDaViagem(viagem)
                const statusReserva = statusDaReserva(viagem)
                const avaliado = avaliadoDaViagem(viagem)
                const veiculo = viagem?.veiculo

                return (
                  <li className="oferta-card" key={`${chaveOfertaItem}-${indice}`}>
                    <div className="oferta-card-cabecalho">
                      <h3>{rotuloPercurso(viagem)}</h3>
                      <span className="oferta-situacao">{rotuloSituacao(situacao)}</span>
                    </div>
                    <p>{rotuloDataHora(dataHora)}</p>
                    <p>
                      {[rotuloPapel(viagem), rotuloVisibilidade(viagem)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {statusReserva && <p>Reserva: {rotuloStatusReserva(statusReserva)}</p>}
                    {viagem?.motorista && (
                      <p className="oferta-motorista">
                        Motorista: {viagem.motorista.nome ?? 'Não informado'} ·{' '}
                        {viagem.motorista.media_avaliacoes ?? 'Sem avaliações'}
                      </p>
                    )}
                    {veiculo && (
                      <p className="oferta-veiculo">
                        Veículo: {[veiculo.marca, veiculo.modelo, veiculo.placa]
                          .filter(Boolean)
                          .join(' - ')}
                      </p>
                    )}

                    {statusReserva === 'CONFIRMADA' && (
                      <div>
                        <p>{mensagemPrazoCancelamento(dataHora)}</p>
                        <button
                          type="button"
                          onClick={() => cancelarReserva(viagem)}
                          disabled={
                            !podeCancelarReservaViagem(viagem)
                            || Boolean(processando[chaveReservaItem])
                          }
                        >
                          {processando[chaveReservaItem]
                            ? 'Cancelando reserva...'
                            : 'Cancelar reserva'}
                        </button>
                        <Feedback feedback={feedbacks[chaveReservaItem]} />
                      </div>
                    )}

                    {statusReserva && statusReserva !== 'CONFIRMADA' && (
                      <p role="status">
                        Reserva {rotuloStatusReserva(statusReserva).toLowerCase()}.
                      </p>
                    )}

                    {podeCancelarOfertaViagem(viagem, categoria) && (
                      <div>
                        <p>{mensagemPenalidadeMotorista(viagem.reservas_confirmadas)}</p>
                        <button
                          type="button"
                          onClick={() => cancelarOferta(viagem)}
                          disabled={Boolean(processando[chaveOfertaItem])}
                        >
                          {processando[chaveOfertaItem]
                            ? 'Cancelando oferta...'
                            : 'Cancelar oferta'}
                        </button>
                        <Feedback feedback={feedbacks[chaveOfertaItem]} />
                      </div>
                    )}

                    {situacao === 'CONCLUIDA' && avaliado.id && (
                      <div>
                        <label htmlFor={`nota-${chaveAvaliacaoItem}`}>
                          Nota para {avaliado.tipo}
                        </label>
                        <select
                          id={`nota-${chaveAvaliacaoItem}`}
                          value={notas[chaveAvaliacaoItem] ?? '5'}
                          onChange={(evento) => setNotas((anterior) => ({
                            ...anterior,
                            [chaveAvaliacaoItem]: evento.target.value,
                          }))}
                        >
                          {[1, 2, 3, 4, 5].map((nota) => (
                            <option key={nota} value={String(nota)}>{nota}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => avaliar(viagem)}
                          disabled={Boolean(processando[chaveAvaliacaoItem])}
                        >
                          {processando[chaveAvaliacaoItem]
                            ? 'Enviando...'
                            : `Avaliar ${avaliado.tipo}`}
                        </button>
                        <Feedback feedback={feedbacks[chaveAvaliacaoItem]} />
                      </div>
                    )}

                    {ofertaId && <Link to={`/ofertas/${ofertaId}`}>Ver detalhes</Link>}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <div className="form-actions">
        <Link to="/busca">Buscar caronas</Link>
      </div>
    </section>
  )
}

export default MinhasViagensPage
