import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../services/api.js'
import { useAuth } from '../state/auth.js'

const VALOR_INICIAL = {
  email_institucional: '',
  senha: '',
}

export function validarLogin(valores = {}) {
  const erros = {}
  const email = String(valores.email_institucional ?? '').trim()
  const senha = String(valores.senha ?? '')

  if (!email) erros.email_institucional = 'Informe o e-mail institucional.'
  if (!senha) erros.senha = 'Informe a senha.'

  return erros
}

export function mensagemErroLogin(error) {
  const mensagem = typeof error?.message === 'string' ? error.message : ''
  const texto = mensagem.toLowerCase()
  const status = error?.status ?? error?.statusCode

  if (status === 401) {
    return 'E-mail institucional ou senha inválidos.'
  }

  if (texto.includes('senha') || texto.includes('e-mail') || texto.includes('email')) {
    return 'E-mail institucional ou senha inválidos.'
  }

  if (status === 400 || status === 422) {
    return mensagem || 'Revise os dados informados.'
  }

  return 'Não foi possível entrar. Tente novamente.'
}

export function LoginPage() {
  const [valores, setValores] = useState(VALOR_INICIAL)
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const destino = location.state?.from?.pathname || '/perfil'

  function atualizarCampo(evento) {
    const { name, value } = evento.target
    setValores((atual) => ({ ...atual, [name]: value }))
    setErros((atual) => ({ ...atual, [name]: '' }))
    setErroGeral('')
  }

  async function enviarLogin(evento) {
    evento.preventDefault()

    const errosFormulario = validarLogin(valores)
    setErros(errosFormulario)

    if (Object.keys(errosFormulario).length > 0) {
      setErroGeral('Preencha todos os campos obrigatórios.')
      return
    }

    setErroGeral('')
    setEnviando(true)

    try {
      const sessao = await api.post('/auth/login', {
        email_institucional: valores.email_institucional.trim(),
        senha: valores.senha,
      })

      login(sessao ?? {})
      navigate(destino, { replace: true })
    } catch (error) {
      setErroGeral(mensagemErroLogin(error))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h1>Entrar</h1>
        <p>Use seu e-mail institucional e sua senha.</p>

        {erroGeral && (
          <p className="auth-message auth-message-error" role="alert" aria-live="assertive">
            {erroGeral}
          </p>
        )}

        <form onSubmit={enviarLogin} noValidate>
          <div className="form-field">
            <label htmlFor="login-email_institucional">
              E-mail institucional <span aria-hidden="true">*</span>
            </label>
            <input
              id="login-email_institucional"
              name="email_institucional"
              type="email"
              autoComplete="email"
              value={valores.email_institucional}
              onChange={atualizarCampo}
              required
              aria-invalid={Boolean(erros.email_institucional)}
              aria-describedby={erros.email_institucional ? 'login-email_institucional-erro' : undefined}
            />
            {erros.email_institucional && (
              <p className="field-error" id="login-email_institucional-erro" role="alert">
                {erros.email_institucional}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="login-senha">
              Senha <span aria-hidden="true">*</span>
            </label>
            <input
              id="login-senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              value={valores.senha}
              onChange={atualizarCampo}
              required
              aria-invalid={Boolean(erros.senha)}
              aria-describedby={erros.senha ? 'login-senha-erro' : undefined}
            />
            {erros.senha && (
              <p className="field-error" id="login-senha-erro" role="alert">
                {erros.senha}
              </p>
            )}
          </div>

          <p className="form-hint">Campos marcados com * são obrigatórios.</p>

          <button type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="auth-link">
          Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
        </p>
      </div>
    </section>
  )
}

export default LoginPage
