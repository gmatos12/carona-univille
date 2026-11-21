import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cadastrar } from '../services/authService.js'

const CAMPOS_OBRIGATORIOS = [
  { name: 'nome_completo', label: 'Nome completo', type: 'text', autoComplete: 'name' },
  { name: 'matricula', label: 'Matrícula', type: 'text', autoComplete: 'off' },
  { name: 'email_institucional', label: 'E-mail institucional', type: 'email', autoComplete: 'email' },
  { name: 'senha', label: 'Senha', type: 'password', autoComplete: 'new-password' },
  { name: 'telefone', label: 'Telefone', type: 'tel', autoComplete: 'tel' },
]

const VALOR_INICIAL = {
  nome_completo: '',
  matricula: '',
  email_institucional: '',
  senha: '',
  telefone: '',
}

export function validarCadastro(valores = {}) {
  const erros = {}
  const nome = String(valores.nome_completo ?? '').trim()
  const matricula = String(valores.matricula ?? '').trim()
  const email = String(valores.email_institucional ?? '').trim()
  const senha = String(valores.senha ?? '')
  const telefone = String(valores.telefone ?? '').trim()

  if (!nome) erros.nome_completo = 'Informe seu nome completo.'
  if (!matricula) erros.matricula = 'Informe sua matrícula.'
  if (!email) erros.email_institucional = 'Informe o e-mail institucional.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    erros.email_institucional = 'Informe um e-mail institucional válido.'
  }
  if (!senha) erros.senha = 'Informe uma senha.'
  if (!telefone) erros.telefone = 'Informe o telefone.'

  return erros
}

export function mensagemErroCadastro(error) {
  const mensagem = typeof error?.message === 'string' ? error.message : ''
  const texto = mensagem.toLowerCase()
  const status = error?.status ?? error?.statusCode

  if (status === 409) {
    return 'Já existe uma conta com este e-mail institucional ou matrícula.'
  }

  if (texto.includes('matricula') || texto.includes('matrícula')) {
    return 'Matrícula inválida ou não autorizada. Verifique a matrícula informada.'
  }

  if (texto.includes('e-mail') || texto.includes('email')) {
    return 'Já existe uma conta com este e-mail institucional.'
  }

  if (status === 400 || status === 422) {
    return mensagem || 'Revise os dados informados.'
  }

  return 'Não foi possível criar a conta. Tente novamente.'
}

export function CadastroPage() {
  const [valores, setValores] = useState(VALOR_INICIAL)
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [enviando, setEnviando] = useState(false)

  function atualizarCampo(evento) {
    const { name, value } = evento.target
    setValores((atual) => ({ ...atual, [name]: value }))
    setErros((atual) => ({ ...atual, [name]: '' }))
    setErroGeral('')
    setSucesso('')
  }

  async function enviarCadastro(evento) {
    evento.preventDefault()

    const errosFormulario = validarCadastro(valores)
    setErros(errosFormulario)

    if (Object.keys(errosFormulario).length > 0) {
      setSucesso('')
      setErroGeral('Preencha todos os campos obrigatórios.')
      return
    }

    setErroGeral('')
    setSucesso('')
    setEnviando(true)

    try {
      await cadastrar(valores)
      setSucesso('Conta criada com sucesso. Faça login para continuar.')
    } catch (error) {
      setErroGeral(mensagemErroCadastro(error))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h1>Criar conta</h1>
        <p>Cadastre-se com sua matrícula institucional.</p>

        {erroGeral && (
          <p className="auth-message auth-message-error" role="alert" aria-live="assertive">
            {erroGeral}
          </p>
        )}

        {sucesso && (
          <p className="auth-message auth-message-success" role="status" aria-live="polite">
            {sucesso}
          </p>
        )}

        <form onSubmit={enviarCadastro} noValidate>
          {CAMPOS_OBRIGATORIOS.map((campo) => {
            const id = `cadastro-${campo.name}`
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
                  value={valores[campo.name]}
                  onChange={atualizarCampo}
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

          <p className="form-hint">Campos marcados com * são obrigatórios.</p>

          <button type="submit" disabled={enviando}>
            {enviando ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        {sucesso && (
          <p className="auth-link">
            <Link to="/login">Ir para o login</Link>
          </p>
        )}

        <p className="auth-link">
          Já tem uma conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </section>
  )
}

export default CadastroPage
