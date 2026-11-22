import { Link } from 'react-router-dom'
import { dividirDataHora } from '../services/ofertaService.js'

const SITUACOES = Object.freeze({
  ABERTA: 'Aberta',
  LOTADA: 'Lotada',
  AGUARDANDO_INICIO: 'Aguardando início',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
})

export function paradasComoTexto(paradas) {
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

export function rotuloSituacao(situacao) {
  if (!situacao) return 'Aberta'
  return SITUACOES[String(situacao).toUpperCase()] ?? String(situacao)
}

export function OfertaCard({ oferta }) {
  if (!oferta) return null

  const paradas = paradasComoTexto(oferta.paradas)
  const { data, horario } = dividirDataHora(oferta.data_hora_saida)
  const vagasDisponiveis = Number(
    oferta.vagas_disponiveis ?? oferta.vagasDisponiveis ?? oferta.vagas ?? 0,
  )
  const vagasTotais = Number(oferta.vagas_total ?? oferta.vagas ?? 0)
  const valor = Number(oferta.valor ?? 0)
  const situacao = oferta.situacao ?? oferta.status ?? 'ABERTA'
  const lotada = String(situacao).toUpperCase() === 'LOTADA' || vagasDisponiveis <= 0
  const motorista = oferta.motorista ?? {}
  const veiculo = oferta.veiculo ?? {}

  return (
    <li className={`oferta-card${lotada ? ' oferta-card-lotada' : ''}`}>
      <div className="oferta-card-cabecalho">
        <h3>{paradas || 'Percurso não informado'}</h3>
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
          <dt>Vagas</dt>
          <dd>{lotada ? 'Lotada' : `${vagasDisponiveis} de ${vagasTotais}`}</dd>
        </div>
        <div>
          <dt>Valor</dt>
          <dd>{valor === 0 ? 'Grátis' : `R$ ${valor.toFixed(2).replace('.', ',')}`}</dd>
        </div>
      </dl>

      <p className="oferta-motorista">
        Motorista: {motorista.nome_completo ?? motorista.nome ?? 'Não informado'}
        {' '}
        <span>
          {motorista.media_avaliacoes && motorista.media_avaliacoes !== 'Sem avaliações'
            ? `Avaliação ${motorista.media_avaliacoes}`
            : 'Sem avaliações'}
        </span>
        {' '}
        <span>{Number(motorista.viagens_concluidas ?? 0)} viagens concluídas</span>
      </p>

      <p className="oferta-veiculo">
        Veículo: {[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || 'Não informado'}
        {veiculo.cor ? ` (${veiculo.cor})` : ''}
      </p>

      <Link to={`/ofertas/${oferta.id}`}>Ver detalhes</Link>
    </li>
  )
}

export default OfertaCard
