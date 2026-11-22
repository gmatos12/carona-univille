import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api.js'
import {
  cancelarOferta as cancelarOfertaApi,
  cancelarReserva as cancelarReservaApi,
  mensagemErroCancelamento,
  mensagemPenalidadeMotorista,
  mensagemPrazoCancelamento,
  mensagemSucessoCancelamentoOferta,
  mensagemSucessoCancelamentoReserva,
  podeCancelarPassageiro,
} from '../services/cancelamentoService.js'

function extrairLista(valor) {
  if (Array.isArray(valor)) return valor
  return []
}

function extrairViagens(resposta) {
  const corpo = resposta?.data ?? resposta
  return {
    reservas: extrairLista(
      corpo?.reservas ?? corpo?.passageiro?.reservas ?? corpo?.data?.reservas,
    ),
    ofertas: extrairLista(
      corpo?.ofertas ?? corpo?.motorista?.ofertas ?? corpo?.data?.ofertas,
    ),
  }
}

function ofertaDaViagem(item) {
  return item?.oferta ?? item
}

function identificadorReserva(reserva) {
  return reserva?.id ?? reserva?.reserva_id ?? reserva?.reservaId ?? null
}

function identificadorOferta(item) {
  return item?.id ?? item?.oferta_id ?? item?.ofertaId ?? item?.oferta?.id ?? null
}

function dataHoraDaViagem(item) {
  const oferta = ofertaDaViagem(item)
  return oferta?.data_hora_saida ?? oferta?.dataHoraSaida ?? ''
}

function rotuloDataHora(valor) {
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return 'Horário não informado'
  return data.toLocaleString('pt-BR')
}

function rotuloPercurso(item) {
  const oferta = ofertaDaViagem(item)
  const paradas = Array.isArray(oferta?.paradas)
    ? oferta.paradas
    : []
  return [oferta?.origem, ...paradas, oferta?.destino].filter(Boolean).join(' → ') || 'Viagem'
}

function statusDaReserva(reserva) {
  return String(reserva?.status ?? 'CONFIRMADA').toUpperCase()
}

function statusDaOferta(item) {
  const oferta = ofertaDaViagem(item)
  return String(oferta?.estado ?? oferta?.situacao ?? 'ABERTA').toUpperCase()
}

function chaveItem(tipo, id) {
  return `${tipo}-${id}`
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
  const [viagens, setViagens] = useState({ reservas: [], ofertas: [] })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [feedbacks, setFeedbacks] = useState({})
  const [processando, setProcessando] = useState({})

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        const resposta = await api.get('/minhas-viagens')
        if (ativo) setViagens(extrairViagens(resposta))
      } catch (error) {
        if (ativo) {
          setViagens({ reservas: [], ofertas: [] })
          setErro(mensagemErroCancelamento(error, 'Não foi possível carregar suas viagens.'))
        }
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  function definirFeedback(chave, tipo, mensagem) {
    setFeedbacks((anterior) => ({ ...anterior, [chave]: { tipo, mensagem } }))
  }

  function definirProcessando(chave, valor) {
    setProcessando((anterior) => ({ ...anterior, [chave]: valor }))
  }

  async function cancelarReserva(reserva) {
    const reservaId = identificadorReserva(reserva)
    if (!reservaId) return

    const chave = chaveItem('reserva', reservaId)
    definirProcessando(chave, true)

    try {
      const cancelamento = await cancelarReservaApi(reservaId)
      setViagens((anterior) => ({
        ...anterior,
        reservas: anterior.reservas.map((item) => (
          identificadorReserva(item) === reservaId
            ? { ...item, status: 'CANCELADA' }
            : item
        )),
      }))
      definirFeedback(chave, 'sucesso', mensagemSucessoCancelamentoReserva(cancelamento))
    } catch (error) {
      definirFeedback(
        chave,
        'erro',
        mensagemErroCancelamento(error, 'Não foi possível cancelar a reserva.'),
      )
    } finally {
      definirProcessando(chave, false)
    }
  }

  async function cancelarOferta(item) {
    const ofertaId = identificadorOferta(item)
    if (!ofertaId) return

    const chave = chaveItem('oferta', ofertaId)
    definirProcessando(chave, true)

    try {
      const cancelamento = await cancelarOfertaApi(ofertaId)
      setViagens((anterior) => ({
        ...anterior,
        ofertas: anterior.ofertas.map((oferta) => (
          identificadorOferta(oferta) === ofertaId
            ? { ...oferta, estado: 'CANCELADA', situacao: 'CANCELADA' }
            : oferta
        )),
      }))
      definirFeedback(chave, 'sucesso', mensagemSucessoCancelamentoOferta(cancelamento))
    } catch (error) {
      definirFeedback(
        chave,
        'erro',
        mensagemErroCancelamento(error, 'Não foi possível cancelar a oferta.'),
      )
    } finally {
      definirProcessando(chave, false)
    }
  }

  return (
    <section className="minhas-viagens-page">
      <h1>Minhas viagens</h1>
      <p>Acompanhe suas reservas e ofertas, e cancele viagens dentro das regras de prazo.</p>

      {erro && (
        <p className="auth-message auth-message-error" role="alert" aria-live="assertive">
          {erro}
        </p>
      )}

      {carregando ? (
        <p>Carregando viagens...</p>
      ) : (
        <>
          <section aria-labelledby="minhas-viagens-passageiro">
            <h2 id="minhas-viagens-passageiro">Como passageiro</h2>
            {viagens.reservas.length === 0 ? (
              <p>Você ainda não tem reservas.</p>
            ) : (
              <ul>
                {viagens.reservas.map((reserva) => {
                  const reservaId = identificadorReserva(reserva)
                  const chave = chaveItem('reserva', reservaId)
                  const ativa = statusDaReserva(reserva) === 'CONFIRMADA'
                  const dataHora = dataHoraDaViagem(reserva)
                  const podeCancelar = ativa && podeCancelarPassageiro(dataHora)

                  return (
                    <li key={chave}>
                      <strong>{rotuloPercurso(reserva)}</strong>
                      <p>{rotuloDataHora(dataHora)}</p>
                      <p>{mensagemPrazoCancelamento(dataHora)}</p>
                      <Feedback feedback={feedbacks[chave]} />
                      {ativa ? (
                        <button
                          type="button"
                          onClick={() => cancelarReserva(reserva)}
                          disabled={!podeCancelar || Boolean(processando[chave])}
                        >
                          {processando[chave] ? 'Cancelando reserva...' : 'Cancelar reserva'}
                        </button>
                      ) : (
                        <p role="status">Reserva cancelada.</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="minhas-viagens-motorista">
            <h2 id="minhas-viagens-motorista">Como motorista</h2>
            {viagens.ofertas.length === 0 ? (
              <p>Você ainda não tem ofertas.</p>
            ) : (
              <ul>
                {viagens.ofertas.map((oferta) => {
                  const ofertaId = identificadorOferta(oferta)
                  const chave = chaveItem('oferta', ofertaId)
                  const cancelada = statusDaOferta(oferta) === 'CANCELADA'
                  const linkId = ofertaId ?? ofertaDaViagem(oferta)?.id

                  return (
                    <li key={chave}>
                      <strong>{rotuloPercurso(oferta)}</strong>
                      <p>{rotuloDataHora(dataHoraDaViagem(oferta))}</p>
                      <p>{mensagemPenalidadeMotorista(oferta.reservas_confirmadas)}</p>
                      <Feedback feedback={feedbacks[chave]} />
                      <button
                        type="button"
                        onClick={() => cancelarOferta(oferta)}
                        disabled={cancelada || Boolean(processando[chave])}
                      >
                        {processando[chave] ? 'Cancelando oferta...' : 'Cancelar oferta'}
                      </button>
                      {cancelada && <p role="status">Oferta cancelada.</p>}
                      {linkId && <Link to={`/ofertas/${linkId}`}>Ver detalhes</Link>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <div className="form-actions">
        <Link to="/busca">Buscar caronas</Link>
      </div>
    </section>
  )
}

export default MinhasViagensPage
