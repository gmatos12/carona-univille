import { useEffect, useState } from 'react'
import { perfilPublico, urlFotoPerfil } from '../services/usuarioService.js'

export { urlFotoPerfil }

export function somenteCamposPublicos(perfil = {}) {
  return {
    id: perfil.id,
    nome_completo: perfil.nome_completo ?? perfil.nome ?? 'Usuário',
    foto_perfil_path:
      perfil.foto_perfil_path ??
      perfil.foto_perfil ??
      perfil.foto ??
      perfil.foto_url ??
      null,
    media_avaliacoes:
      perfil.media_avaliacoes ??
      perfil.avaliacao_media ??
      perfil.media ??
      perfil.reputacao ??
      'Sem avaliações',
    viagens_concluidas: Number(
      perfil.viagens_concluidas ??
        perfil.total_viagens_concluidas ??
        perfil.qtd_viagens_concluidas ??
        0,
    ),
  }
}

export function formatarMedia(valor) {
  if (valor === null || valor === undefined || valor === '') return 'Sem avaliações'
  if (valor === 'Sem avaliações') return valor

  const numero = Number(valor)
  return Number.isFinite(numero) ? numero.toFixed(1) : 'Sem avaliações'
}

export function PerfilPublico({ perfil: perfilProp, usuarioId, titulo = 'Perfil público' }) {
  const [perfilCarregado, setPerfilCarregado] = useState(null)
  const [carregando, setCarregando] = useState(
    usuarioId !== undefined && usuarioId !== null && !perfilProp,
  )
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (perfilProp || usuarioId === undefined || usuarioId === null) return undefined

    let ativo = true
    setCarregando(true)
    setErro('')

    async function carregar() {
      try {
        const dados = await perfilPublico(usuarioId)
        if (ativo) setPerfilCarregado(dados)
      } catch (error) {
        if (ativo) {
          setErro(
            typeof error?.message === 'string' && error.message.trim()
              ? error.message
              : 'Não foi possível carregar o perfil público.',
          )
        }
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [perfilProp, usuarioId])

  if (carregando) {
    return (
      <section className="perfil-publico">
        <h2>{titulo}</h2>
        <p>Carregando perfil público...</p>
      </section>
    )
  }

  if (erro) {
    return (
      <section className="perfil-publico">
        <h2>{titulo}</h2>
        <p className="field-error" role="alert">
          {erro}
        </p>
      </section>
    )
  }

  const origem = perfilProp ?? perfilCarregado
  if (!origem) return null

  const perfil = somenteCamposPublicos(origem)
  const foto = urlFotoPerfil(perfil.foto_perfil_path)

  return (
    <section className="perfil-publico" aria-label={titulo}>
      <h2>{titulo}</h2>

      <div className="perfil-publico-cabecalho">
        {foto ? (
          <img
            className="perfil-publico-foto"
            src={foto}
            alt={`Foto de perfil de ${perfil.nome_completo}`}
          />
        ) : (
          <span className="perfil-publico-sem-foto" aria-hidden="true">
            {String(perfil.nome_completo).trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}

        <h3>{perfil.nome_completo}</h3>
      </div>

      <dl className="perfil-publico-dados">
        <div>
          <dt>Avaliação</dt>
          <dd>{formatarMedia(perfil.media_avaliacoes)}</dd>
        </div>
        <div>
          <dt>Viagens concluídas</dt>
          <dd>{perfil.viagens_concluidas}</dd>
        </div>
      </dl>
    </section>
  )
}

export default PerfilPublico
