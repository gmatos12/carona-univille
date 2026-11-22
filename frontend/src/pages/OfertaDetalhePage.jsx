import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { dividirDataHora, mensagemErroOferta, ofertaService } from '../services/ofertaService.js'
import { mensagemErroReserva, reservaService } from '../services/reservaService.js'

function paradasComoTexto(paradas) {
  let pontos = []
  if (Array.isArray(paradas)) pontos = paradas
  else if (typeof paradas === 'string') {
    try {
      const analisado = JSON.parse(paradas)
      if (Array.isArray(analisado)) pontos = analisado
    } catch {
      pontos = []
    }
  }
  return pontos.filter(Boolean).join(' → ')
}

function rotuloSituacao(situacao) {
  const rotulos = {
    ABERTA: 'Aberta',
    LOTADA: 'Lotada',
    AGUARDANDO_INICIO: 'Aguardando início',
    EM_ANDAMENTO: 'Em andamento',
    CONCLUIDA: 'Concluída',
    CANCELADA: 'Cancelada',
  }
  const chave = String(situacao ?? 'ABERTA').toUpperCase()
  return rotulos[chave] ?? chave
}

function mensagemDisponibilidade({ confirmada, lotada, antesDaPartida, aberta }) {
  if (confirmada) return 'Sua reserva foi confirmada para esta viagem.'
  if (lotada) return 'Não há vagas disponíveis nesta oferta.'
  if (!antesDaPartida) return 'O horário de saída já passou.'
  if (!aberta) return 'Esta oferta não aceita novas reservas.'
  return ''
}

export function OfertaDetalhePage() {
  const { id } = useParams()
  const [oferta, setOferta] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [reservando, setReservando] = useState(false)
  const [reservaConfirmada, setReservaConfirmada] = useState(false)
  const [feedbackReserva, setFeedbackReserva] = useState(null)

  useEffect(() => {
    let ativo = true

    setReservaConfirmada(false)
    setFeedbackReserva(null)

    async function carregar() {
      try {
        const encontrada = await ofertaService.buscarPorId(id)
        if (ativo) setOferta(encontrada)
      } catch (error) {
        if (ativo) setErro(mensagemErroOferta(error, 'Não foi possível carregar a oferta.'))
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [id])

  async function recarregarOferta() {
    try {
      const atualizada = await ofertaService.buscarPorId(id)
      setOferta(atualizada)
      return atualizada
    } catch {
      return null
    }
  }

  async function reservarVaga() {
    setReservando(true)
    setFeedbackReserva(null)

    try {
      await reservaService.criar(id)
      setReservaConfirmada(true)
      setFeedbackReserva({
        tipo: 'sucesso',
        mensagem: 'Reserva confirmada. Sua vaga está garantida.',
      })
      await recarregarOferta()
    } catch (error) {
      setFeedbackReserva({
        tipo: 'erro',
        mensagem: mensagemErroReserva(error, 'Não foi possível reservar esta vaga.'),
      })
      await recarregarOferta()
    } finally {
      setReservando(false)
    }
  }

  if (carregando) return <section className="oferta-detalhe-page"><p>Carregando oferta...</p></section>

  if (erro || !oferta) {
    return (
      <section className="oferta-detalhe-page">
        <h1>Detalhes da oferta</h1>
        <p className="auth-message auth-message-error" role="alert">
          {erro || 'Oferta não encontrada.'}
        </p>
        <Link to="/busca">Voltar para a busca</Link>
      </section>
    )
  }

  const { data, horario } = dividirDataHora(oferta.data_hora_saida)
  const motorista = oferta.motorista ?? {}
  const veiculo = oferta.veiculo ?? {}
  const vagasDisponiveis = Number(oferta.vagas_disponiveis ?? oferta.vagas ?? 0)
  const vagasTotais = Number(oferta.vagas_total ?? oferta.vagas ?? 0)
  const valor = Number(oferta.valor ?? 0)
  const situacao = oferta.situacao ?? oferta.status ?? 'ABERTA'
  const estado = String(oferta.estado ?? 'ABERTA').toUpperCase()
  const partida = new Date(oferta.data_hora_saida)
  const antesDaPartida = !Number.isNaN(partida.getTime()) && partida.getTime() > Date.now()
  const lotada = String(situacao).toUpperCase() === 'LOTADA' || vagasDisponiveis <= 0
  const aceitaReservas = oferta.aceita_reservas === undefined
    ? estado === 'ABERTA' && antesDaPartida && !lotada
    : Boolean(oferta.aceita_reservas)
  const podeReservar = aceitaReservas && !lotada && !reservaConfirmada && !reservando
  const disponibilidade = mensagemDisponibilidade({
    confirmada: reservaConfirmada,
    lotada,
    antesDaPartida,
    aberta: estado === 'ABERTA',
  })

  return (
    <section className="oferta-detalhe-page">
      <h1>Detalhes da oferta</h1>

      <div className="oferta-detalhe-cabecalho">
        <h2>{paradasComoTexto(oferta.paradas) || 'Percurso não informado'}</h2>
        <span className="oferta-situacao">{rotuloSituacao(situacao)}</span>
      </div>

      <dl>
        <div>
          <dt>Data</dt>
          <dd>{data || '—'}</dd>
        </div>
        <div>
          <dt>Horário</dt>
          <dd>{horario || '—'}</dd>
        </div>
        <div>
          <dt>Vagas disponíveis</dt>
          <dd>{vagasDisponiveis <= 0 ? 'Lotada' : `${vagasDisponiveis} de ${vagasTotais}`}</dd>
        </div>
        <div>
          <dt>Valor</dt>
          <dd>{valor === 0 ? 'Grátis' : `R$ ${valor.toFixed(2).replace('.', ',')}`}</dd>
        </div>
      </dl>

      <section aria-labelledby="detalhe-motorista">
        <h2 id="detalhe-motorista">Motorista</h2>
        <p>{motorista.nome_completo ?? motorista.nome ?? 'Não informado'}</p>
        <p>
          {motorista.media_avaliacoes && motorista.media_avaliacoes !== 'Sem avaliações'
            ? `Avaliação ${motorista.media_avaliacoes}`
            : 'Sem avaliações'}
          {' · '}
          {Number(motorista.viagens_concluidas ?? 0)} viagens concluídas
        </p>
      </section>

      <section aria-labelledby="detalhe-veiculo">
        <h2 id="detalhe-veiculo">Veículo</h2>
        <p>
          {[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || 'Não informado'}
          {veiculo.cor ? ` (${veiculo.cor})` : ''}
        </p>
        {veiculo.placa && <p>Placa: {veiculo.placa}</p>}
      </section>

      {feedbackReserva && (
        <p
          className={`auth-message auth-message-${feedbackReserva.tipo === 'sucesso' ? 'success' : 'error'}`}
          role={feedbackReserva.tipo === 'sucesso' ? 'status' : 'alert'}
          aria-live="polite"
        >
          {feedbackReserva.mensagem}
        </p>
      )}

      <section aria-labelledby="detalhe-reserva">
        <h2 id="detalhe-reserva">Reserva</h2>
        <p>{disponibilidade || 'Reserve sua vaga nesta viagem.'}</p>
        <button type="button" onClick={reservarVaga} disabled={!podeReservar}>
          {reservando ? 'Reservando...' : reservaConfirmada ? 'Reserva confirmada' : 'Reservar vaga'}
        </button>
      </section>

      <div className="form-actions">
        <Link to="/busca">Voltar para a busca</Link>
      </div>
    </section>
  )
}

export default OfertaDetalhePage
