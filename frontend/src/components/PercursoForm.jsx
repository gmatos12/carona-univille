import { useState } from 'react'

export function normalizarPercursoForm(valores = {}) {
  return {
    origem: String(valores.origem ?? ''),
    destino: String(valores.destino ?? ''),
    paradas: Array.isArray(valores.paradas)
      ? valores.paradas.map((ponto) => String(ponto ?? ''))
      : [],
  }
}

export function PercursoForm({ valores, onChange, erros = {}, desabilitado = false }) {
  const normalizados = normalizarPercursoForm(valores)
  const [novaParada, setNovaParada] = useState('')

  function alterarCampo(campo, valor) {
    onChange({ ...normalizados, [campo]: valor })
  }

  function alterarParada(indice, valor) {
    const paradas = [...normalizados.paradas]
    paradas[indice] = valor
    onChange({ ...normalizados, paradas })
  }

  function adicionarParada() {
    const ponto = novaParada.trim()
    if (!ponto) return

    const pontos = [normalizados.origem.trim(), normalizados.destino.trim()]
      .filter(Boolean)
      .map((item) => item.toLocaleLowerCase('pt-BR'))
    if (pontos.includes(ponto.toLocaleLowerCase('pt-BR'))) return

    onChange({ ...normalizados, paradas: [...normalizados.paradas, ponto] })
    setNovaParada('')
  }

  function removerParada(indice) {
    onChange({
      ...normalizados,
      paradas: normalizados.paradas.filter((_, posicao) => posicao !== indice),
    })
  }

  function moverParada(indice, deslocamento) {
    const destino = indice + deslocamento
    if (destino < 0 || destino >= normalizados.paradas.length) return

    const paradas = [...normalizados.paradas]
    const [ponto] = paradas.splice(indice, 1)
    paradas.splice(destino, 0, ponto)
    onChange({ ...normalizados, paradas })
  }

  function campoErro(nome) {
    if (!erros[nome]) return null
    return (
      <p className="field-error" id={`percurso-${nome}-erro`} role="alert">
        {erros[nome]}
      </p>
    )
  }

  return (
    <fieldset className="percurso-form" disabled={desabilitado}>
      <legend>Percurso</legend>

      <div className="form-field">
        <label htmlFor="percurso-origem">
          Origem <span aria-hidden="true">*</span>
        </label>
        <input
          id="percurso-origem"
          type="text"
          value={normalizados.origem}
          onChange={(evento) => alterarCampo('origem', evento.target.value)}
          required
          aria-invalid={Boolean(erros.origem)}
          aria-describedby={erros.origem ? 'percurso-origem-erro' : undefined}
        />
        {campoErro('origem')}
      </div>

      <div className="percurso-paradas">
        <h3>Paradas intermediárias, em ordem</h3>
        {normalizados.paradas.length === 0 && <p>Nenhuma parada intermediária.</p>}

        {normalizados.paradas.length > 0 && (
          <ol>
            {normalizados.paradas.map((ponto, indice) => (
              <li key={`${indice}-${ponto}`} className="percurso-parada">
                <input
                  type="text"
                  aria-label={`Parada ${indice + 1}`}
                  value={ponto}
                  onChange={(evento) => alterarParada(indice, evento.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => moverParada(indice, -1)}
                  disabled={indice === 0}
                >
                  Subir
                </button>
                <button
                  type="button"
                  onClick={() => moverParada(indice, 1)}
                  disabled={indice === normalizados.paradas.length - 1}
                >
                  Descer
                </button>
                <button type="button" onClick={() => removerParada(indice)}>
                  Remover
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="percurso-adicionar">
          <label htmlFor="percurso-nova-parada">Nova parada</label>
          <input
            id="percurso-nova-parada"
            type="text"
            value={novaParada}
            onChange={(evento) => setNovaParada(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') {
                evento.preventDefault()
                adicionarParada()
              }
            }}
          />
          <button type="button" onClick={adicionarParada}>
            Adicionar parada
          </button>
        </div>
        {campoErro('paradas')}
      </div>

      <div className="form-field">
        <label htmlFor="percurso-destino">
          Destino <span aria-hidden="true">*</span>
        </label>
        <input
          id="percurso-destino"
          type="text"
          value={normalizados.destino}
          onChange={(evento) => alterarCampo('destino', evento.target.value)}
          required
          aria-invalid={Boolean(erros.destino)}
          aria-describedby={erros.destino ? 'percurso-destino-erro' : undefined}
        />
        {campoErro('destino')}
      </div>
    </fieldset>
  )
}

export default PercursoForm
