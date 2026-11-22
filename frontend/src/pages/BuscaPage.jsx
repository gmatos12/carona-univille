import { useState } from 'react'
import OfertaCard from '../components/OfertaCard.jsx'
import { mensagemErroOferta, ofertaService } from '../services/ofertaService.js'

function dataAtual() {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export const FILTROS_INICIAIS = Object.freeze({
  origem: '',
  destino: '',
  data: dataAtual(),
  horario: '10:00',
})

export function validarFiltrosBusca(filtros = {}) {
  const erros = {}
  if (!String(filtros.origem ?? '').trim()) erros.origem = 'Informe a origem.'
  if (!String(filtros.destino ?? '').trim()) erros.destino = 'Informe o destino.'
  if (!filtros.data) erros.data = 'Informe a data.'
  if (!filtros.horario) erros.horario = 'Informe o horário.'
  return erros
}

function campoErro(id, mensagem) {
  if (!mensagem) return null
  return (
    <p className="field-error" id={`${id}-erro`} role="alert">
      {mensagem}
    </p>
  )
}

export function BuscaPage() {
  const [filtros, setFiltros] = useState(() => ({ ...FILTROS_INICIAIS }))
  const [resultados, setResultados] = useState([])
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [buscou, setBuscou] = useState(false)

  function alterarCampo(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: '' }))
    setErroGeral('')
  }

  async function enviar(evento) {
    evento.preventDefault()

    const errosFormulario = validarFiltrosBusca(filtros)
    setErros(errosFormulario)
    setErroGeral('')
    if (Object.keys(errosFormulario).length > 0) return

    setCarregando(true)
    try {
      const encontrados = await ofertaService.buscar({
        origem: filtros.origem.trim(),
        destino: filtros.destino.trim(),
        data: filtros.data,
        horario: filtros.horario,
      })
      setResultados(encontrados ?? [])
      setBuscou(true)
    } catch (error) {
      setResultados([])
      setErroGeral(mensagemErroOferta(error, 'Não foi possível buscar ofertas.'))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <section className="busca-page">
      <h1>Buscar caronas</h1>
      <p>Informe o percurso, a data e o horário desejado. A busca considera uma janela de ±30 minutos.</p>

      {erroGeral && (
        <p className="auth-message auth-message-error" role="alert" aria-live="assertive">
          {erroGeral}
        </p>
      )}

      <form className="busca-form" onSubmit={enviar} noValidate>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="busca-origem">
              Origem <span aria-hidden="true">*</span>
            </label>
            <input
              id="busca-origem"
              type="text"
              value={filtros.origem}
              onChange={(evento) => alterarCampo('origem', evento.target.value)}
              required
              aria-invalid={Boolean(erros.origem)}
              aria-describedby={erros.origem ? 'busca-origem-erro' : undefined}
            />
            {campoErro('busca-origem', erros.origem)}
          </div>

          <div className="form-field">
            <label htmlFor="busca-destino">
              Destino <span aria-hidden="true">*</span>
            </label>
            <input
              id="busca-destino"
              type="text"
              value={filtros.destino}
              onChange={(evento) => alterarCampo('destino', evento.target.value)}
              required
              aria-invalid={Boolean(erros.destino)}
              aria-describedby={erros.destino ? 'busca-destino-erro' : undefined}
            />
            {campoErro('busca-destino', erros.destino)}
          </div>

          <div className="form-field">
            <label htmlFor="busca-data">
              Data <span aria-hidden="true">*</span>
            </label>
            <input
              id="busca-data"
              type="date"
              value={filtros.data}
              onChange={(evento) => alterarCampo('data', evento.target.value)}
              required
              aria-invalid={Boolean(erros.data)}
              aria-describedby={erros.data ? 'busca-data-erro' : undefined}
            />
            {campoErro('busca-data', erros.data)}
          </div>

          <div className="form-field">
            <label htmlFor="busca-horario">
              Horário <span aria-hidden="true">*</span>
            </label>
            <input
              id="busca-horario"
              type="time"
              value={filtros.horario}
              onChange={(evento) => alterarCampo('horario', evento.target.value)}
              required
              aria-invalid={Boolean(erros.horario)}
              aria-describedby={erros.horario ? 'busca-horario-erro' : undefined}
            />
            {campoErro('busca-horario', erros.horario)}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={carregando}>
            {carregando ? 'Buscando...' : 'Buscar caronas'}
          </button>
        </div>
      </form>

      <section className="busca-resultados" aria-labelledby="busca-resultados-titulo">
        <h2 id="busca-resultados-titulo">Resultados</h2>

        {carregando && <p>Buscando ofertas...</p>}

        {!carregando && buscou && resultados.length === 0 && (
          <p>Nenhuma oferta encontrada para esse percurso e horário.</p>
        )}

        {resultados.length > 0 && (
          <ul className="ofertas-lista">
            {resultados.map((oferta) => (
              <OfertaCard key={oferta.id} oferta={oferta} />
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

export default BuscaPage
