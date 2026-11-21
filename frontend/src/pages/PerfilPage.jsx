import { useEffect, useState } from 'react'
import PerfilPublico from '../components/PerfilPublico.jsx'
import api from '../services/api.js'

const LIMITE_FOTO = 2 * 1024 * 1024
const TIPOS_FOTO = ['image/png', 'image/jpeg']

function extrairPerfil(resposta) {
  return resposta?.perfil ?? resposta?.usuario ?? resposta ?? null
}

function perfilParaFormulario(perfil = {}) {
  return {
    nome_completo: perfil.nome_completo ?? '',
    email_institucional: perfil.email_institucional ?? '',
    telefone: perfil.telefone ?? '',
  }
}

function validarDados(valores = {}) {
  const erros = {}
  const nome = String(valores.nome_completo ?? '').trim()
  const email = String(valores.email_institucional ?? '').trim()
  const telefone = String(valores.telefone ?? '').trim()

  if (!nome) erros.nome_completo = 'Informe o nome completo.'
  if (!email) erros.email_institucional = 'Informe o e-mail institucional.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    erros.email_institucional = 'Informe um e-mail institucional válido.'
  }
  if (!telefone) erros.telefone = 'Informe o telefone.'

  return erros
}

function mensagemErro(error, fallback) {
  return typeof error?.message === 'string' && error.message.trim() ? error.message : fallback
}

export function PerfilPage() {
  const [perfil, setPerfil] = useState(null)
  const [formulario, setFormulario] = useState(perfilParaFormulario())
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [erroFoto, setErroFoto] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        const resposta = await api.get('/me')
        const dados = extrairPerfil(resposta)
        if (!ativo) return
        setPerfil(dados)
        setFormulario(perfilParaFormulario(dados))
      } catch (error) {
        if (ativo) setErroGeral(mensagemErro(error, 'Não foi possível carregar o perfil.'))
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  function atualizarCampo(evento) {
    const { name, value } = evento.target
    setFormulario((atual) => ({ ...atual, [name]: value }))
    setErros((atual) => ({ ...atual, [name]: '' }))
    setErroGeral('')
    setSucesso('')
  }

  async function salvarDados(evento) {
    evento.preventDefault()

    const errosFormulario = validarDados(formulario)
    setErros(errosFormulario)

    if (Object.keys(errosFormulario).length > 0) {
      setErroGeral('Preencha todos os campos obrigatórios.')
      setSucesso('')
      return
    }

    setErroGeral('')
    setSucesso('')
    setSalvando(true)

    try {
      const resposta = await api.put('/me', {
        nome_completo: formulario.nome_completo.trim(),
        email_institucional: formulario.email_institucional.trim(),
        telefone: formulario.telefone.trim(),
      })
      const dados = extrairPerfil(resposta) ?? { ...perfil, ...formulario }
      setPerfil(dados)
      setFormulario(perfilParaFormulario(dados))
      setSucesso('Dados pessoais atualizados com sucesso.')
    } catch (error) {
      setErroGeral(mensagemErro(error, 'Não foi possível atualizar o perfil.'))
    } finally {
      setSalvando(false)
    }
  }

  async function aplicarRespostaFoto(resposta) {
    let dados = extrairPerfil(resposta)

    if (!dados) {
      const atualizado = await api.get('/me')
      dados = extrairPerfil(atualizado)
    }

    setPerfil(dados)
    setFormulario(perfilParaFormulario(dados))
    setErroFoto('')
    setSucesso(dados?.foto_perfil_path
      ? 'Foto de perfil atualizada.'
      : 'Foto de perfil removida.')
  }

  async function enviarFoto(evento) {
    const arquivo = evento.target.files?.[0]
    if (!arquivo) return

    setErroFoto('')
    setSucesso('')

    if (!TIPOS_FOTO.includes(arquivo.type)) {
      setErroFoto('Use uma imagem JPEG ou PNG.')
      evento.target.value = ''
      return
    }

    if (arquivo.size > LIMITE_FOTO) {
      setErroFoto('A foto de perfil deve ter no máximo 2 MB.')
      evento.target.value = ''
      return
    }

    const dados = new FormData()
    dados.append('foto', arquivo)

    try {
      const resposta = await api.post('/me/foto', dados)
      await aplicarRespostaFoto(resposta)
    } catch (error) {
      setErroFoto(mensagemErro(error, 'Não foi possível salvar a foto de perfil.'))
    } finally {
      evento.target.value = ''
    }
  }

  async function removerFoto() {
    setErroFoto('')
    setSucesso('')

    try {
      const resposta = await api.delete('/me/foto')
      await aplicarRespostaFoto(resposta)
    } catch (error) {
      setErroFoto(mensagemErro(error, 'Não foi possível remover a foto de perfil.'))
    }
  }

  const campos = [
    { name: 'nome_completo', label: 'Nome completo', type: 'text', autoComplete: 'name' },
    { name: 'email_institucional', label: 'E-mail institucional', type: 'email', autoComplete: 'email' },
    { name: 'telefone', label: 'Telefone', type: 'tel', autoComplete: 'tel' },
  ]

  return (
    <section className="perfil-page">
      <h1>Meu perfil</h1>

      {carregando && <p>Carregando perfil...</p>}

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

      {!carregando && perfil && (
        <div className="perfil-layout">
          <section className="perfil-foto" aria-labelledby="perfil-foto-titulo">
            <h2 id="perfil-foto-titulo">Foto de perfil</h2>
            <p className="form-hint">A foto é opcional e pode ser adicionada ou removida.</p>

            {perfil.foto_perfil_path ? (
              <p className="perfil-foto-status">Foto de perfil enviada.</p>
            ) : (
              <p className="perfil-foto-status">Nenhuma foto de perfil enviada.</p>
            )}

            <label htmlFor="perfil-foto-input">Selecionar foto (JPEG ou PNG, até 2 MB)</label>
            <input
              id="perfil-foto-input"
              type="file"
              accept="image/png,image/jpeg"
              onChange={enviarFoto}
            />

            {perfil.foto_perfil_path && (
              <button type="button" onClick={removerFoto}>
                Remover foto de perfil
              </button>
            )}

            {erroFoto && (
              <p className="field-error" role="alert">
                {erroFoto}
              </p>
            )}
          </section>

          <section className="perfil-dados" aria-labelledby="perfil-dados-titulo">
            <h2 id="perfil-dados-titulo">Dados pessoais</h2>

            <form onSubmit={salvarDados} noValidate>
              {campos.map((campo) => {
                const id = `perfil-${campo.name}`
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
                      value={formulario[campo.name]}
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

              <button type="submit" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </form>
          </section>
        </div>
      )}

      {perfil?.id !== undefined && perfil?.id !== null && (
        <PerfilPublico usuarioId={perfil.id} titulo="Como os outros veem seu perfil" />
      )}
    </section>
  )
}

export default PerfilPage
