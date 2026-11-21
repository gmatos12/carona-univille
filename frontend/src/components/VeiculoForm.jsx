import { useEffect, useState } from 'react'

export const VALORES_INICIAIS_VEICULO = Object.freeze({
  marca: '',
  modelo: '',
  cor: '',
  placa: '',
  ano: '',
  capacidade_passageiros: '',
})

const CAMPOS = [
  { name: 'marca', label: 'Marca', type: 'text', autoComplete: 'off' },
  { name: 'modelo', label: 'Modelo', type: 'text', autoComplete: 'off' },
  { name: 'cor', label: 'Cor', type: 'text', autoComplete: 'off' },
  { name: 'placa', label: 'Placa', type: 'text', autoComplete: 'off' },
  { name: 'ano', label: 'Ano', type: 'number', autoComplete: 'off' },
  {
    name: 'capacidade_passageiros',
    label: 'Capacidade de passageiros (sem contar o motorista)',
    type: 'number',
    autoComplete: 'off',
  },
]

export function normalizarValoresVeiculo(valores) {
  const origem = valores ?? {}
  return {
    marca: String(origem.marca ?? ''),
    modelo: String(origem.modelo ?? ''),
    cor: String(origem.cor ?? ''),
    placa: String(origem.placa ?? ''),
    ano: origem.ano === undefined || origem.ano === null ? '' : String(origem.ano),
    capacidade_passageiros:
      origem.capacidade_passageiros === undefined || origem.capacidade_passageiros === null
        ? ''
        : String(origem.capacidade_passageiros),
  }
}

export function validarVeiculo(valores) {
  const origem = valores ?? {}
  const erros = {}

  for (const campo of ['marca', 'modelo', 'cor', 'placa']) {
    if (!String(origem[campo] ?? '').trim()) erros[campo] = `Informe ${campo}.`
  }

  const ano = String(origem.ano ?? '').trim()
  if (!ano) erros.ano = 'Informe o ano.'
  else if (!Number.isInteger(Number(ano)) || Number(ano) <= 0) {
    erros.ano = 'Informe um ano válido.'
  }

  const capacidade = String(origem.capacidade_passageiros ?? '').trim()
  if (!capacidade) erros.capacidade_passageiros = 'Informe a capacidade de passageiros.'
  else if (!Number.isInteger(Number(capacidade)) || Number(capacidade) <= 0) {
    erros.capacidade_passageiros =
      'A capacidade deve ser um inteiro maior que zero, sem contar o motorista.'
  }

  return erros
}

export function VeiculoForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Salvar veículo',
  erro = '',
  desabilitado = false,
}) {
  const [valores, setValores] = useState(() => normalizarValoresVeiculo(initialValues))
  const [erros, setErros] = useState({})

  useEffect(() => {
    setValores(normalizarValoresVeiculo(initialValues))
    setErros({})
  }, [initialValues])

  function atualizarCampo(evento) {
    const { name, value } = evento.target
    setValores((atual) => ({ ...atual, [name]: value }))
    setErros((atual) => ({ ...atual, [name]: '' }))
  }

  async function enviar(evento) {
    evento.preventDefault()

    const errosFormulario = validarVeiculo(valores)
    setErros(errosFormulario)
    if (Object.keys(errosFormulario).length > 0) return

    const resposta = await onSubmit({
      marca: valores.marca.trim(),
      modelo: valores.modelo.trim(),
      cor: valores.cor.trim(),
      placa: valores.placa.trim(),
      ano: Number(valores.ano),
      capacidade_passageiros: Number(valores.capacidade_passageiros),
    })

    if (!initialValues && resposta !== false) {
      setValores(normalizarValoresVeiculo())
      setErros({})
    }
  }

  return (
    <form className="veiculo-form" onSubmit={enviar} noValidate>
      {erro && (
        <p className="auth-message auth-message-error" role="alert" aria-live="assertive">
          {erro}
        </p>
      )}

      {CAMPOS.map((campo) => {
        const id = `veiculo-${campo.name}`
        const erroId = `${id}-erro`

        return (
          <div className="form-field" key={campo.name}>
            <label htmlFor={id}>
              {campo.label} <span aria-hidden="true">*</span>
            </label>
            <input
              id={id}
              name={campo.name}
              type={campo.type}
              autoComplete={campo.autoComplete}
              min={campo.type === 'number' ? 1 : undefined}
              step={campo.type === 'number' ? 1 : undefined}
              value={valores[campo.name]}
              onChange={atualizarCampo}
              disabled={desabilitado}
              required
              aria-invalid={Boolean(erros[campo.name])}
              aria-describedby={erros[campo.name] ? erroId : undefined}
            />
            {erros[campo.name] && (
              <p className="field-error" id={erroId} role="alert">
                {erros[campo.name]}
              </p>
            )}
          </div>
        )
      })}

      <p className="form-hint">
        A capacidade informada considera apenas passageiros; o motorista não é contado.
      </p>

      <div className="form-actions">
        <button type="submit" disabled={desabilitado}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={desabilitado}>
            Cancelar edição
          </button>
        )}
      </div>
    </form>
  )
}

export default VeiculoForm
