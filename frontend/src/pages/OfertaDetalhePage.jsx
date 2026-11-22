import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { dividirDataHora, mensagemErroOferta, ofertaService } from '../services/ofertaService.js'

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

export function OfertaDetalhePage() {
  const { id } = useParams()
  const [oferta, setOferta] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true

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

      <div className="form-actions">
        <Link to="/busca">Voltar para a busca</Link>
      </div>
    </section>
  )
}

export default OfertaDetalhePage
