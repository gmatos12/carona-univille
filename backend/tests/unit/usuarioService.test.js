import { describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../../src/middlewares/errorHandler.js'
import { UsuarioService } from '../../src/services/usuarioService.js'

function repositorioFake(impl = {}) {
  return {
    buscarPorId: vi.fn(impl.buscarPorId ?? (() => undefined)),
    buscarPorEmail: vi.fn(impl.buscarPorEmail ?? (() => undefined)),
    atualizar: vi.fn(impl.atualizar ?? (() => undefined)),
    atualizarFotoPerfil: vi.fn(impl.atualizarFotoPerfil ?? (() => undefined)),
    removerFotoPerfil: vi.fn(impl.removerFotoPerfil ?? (() => undefined)),
    perfilPublico: vi.fn(impl.perfilPublico ?? (() => undefined)),
    mediaAvaliacoes: vi.fn(impl.mediaAvaliacoes ?? (() => undefined)),
    contarViagensConcluidas: vi.fn(impl.contarViagensConcluidas ?? (() => undefined)),
  }
}

const CONEXAO = { nome: 'conexao-fake' }

describe('UsuarioService (RF-003, RF-004, RF-020)', () => {
  it('[RF-004] perfilProprio remove senha e repassa a conexão', async () => {
    const usuarios = repositorioFake({
      buscarPorId: () => ({ id: 1, nome_completo: 'Ana', senha_hash: 'segredo' }),
    })
    const service = new UsuarioService({ usuarios })

    expect(await service.perfilProprio(1, CONEXAO)).toEqual({ id: 1, nome_completo: 'Ana' })
    expect(usuarios.buscarPorId).toHaveBeenCalledWith(1, CONEXAO)
  })

  it('[RF-004] perfilProprio traduz erros', async () => {
    const service = new UsuarioService({ usuarios: repositorioFake() })

    await expect(service.perfilProprio(1)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.perfilProprio(1)).rejects.toThrow('Usuário não encontrado')

    const TypeErrorService = new UsuarioService({
      usuarios: repositorioFake({ buscarPorId: () => Promise.reject(new TypeError('id inválido')) }),
    })
    await expect(TypeErrorService.perfilProprio(1)).rejects.toBeInstanceOf(UnprocessableError)
    await expect(TypeErrorService.perfilProprio(1)).rejects.toThrow('id inválido')

    const erroOriginal = new ApiError(500, 'falha', 'INTERNA')
    const ApiErrorService = new UsuarioService({
      usuarios: repositorioFake({ buscarPorId: () => Promise.reject(erroOriginal) }),
    })
    await expect(ApiErrorService.perfilProprio(1)).rejects.toBe(erroOriginal)
  })

  it('[RF-004] atualizarPerfil valida dados e permite manter o próprio e-mail', async () => {
    const usuarios = repositorioFake({
      buscarPorId: () => ({ id: 5, nome_completo: 'Ana' }),
      buscarPorEmail: () => ({ id: 5, nome_completo: 'Ana' }),
      atualizar: () => ({ id: 5, nome_completo: 'Ana Atualizada', senha_hash: 'h' }),
    })
    const service = new UsuarioService({ usuarios })

    expect(await service.atualizarPerfil(5, {
      emailInstitucional: 'ana@univille.edu.br',
      nome_completo: 'Ana Atualizada',
    }, CONEXAO)).toEqual({ id: 5, nome_completo: 'Ana Atualizada' })
    expect(usuarios.buscarPorEmail).toHaveBeenCalledWith('ana@univille.edu.br', CONEXAO)
    expect(usuarios.atualizar).toHaveBeenCalledWith(5, {
      emailInstitucional: 'ana@univille.edu.br',
      nome_completo: 'Ana Atualizada',
    }, CONEXAO)

    await expect(service.atualizarPerfil(5, null)).rejects.toBeInstanceOf(ValidationError)
    await expect(service.atualizarPerfil(5, [])).rejects.toThrow('Dados de perfil inválidos')
  })

  it('[RF-004] atualizarPerfil bloqueia e-mail de outro usuário e erros de atualização', async () => {
    const usuarios = repositorioFake({
      buscarPorId: vi.fn()
        .mockResolvedValueOnce({ id: 5 })
        .mockResolvedValueOnce({ id: 5 })
        .mockResolvedValueOnce({ id: 5 })
        .mockResolvedValueOnce({ id: 5 }),
      buscarPorEmail: () => ({ id: 9 }),
      atualizar: vi.fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new TypeError('campo inválido')),
    })
    const service = new UsuarioService({ usuarios })

    await expect(service.atualizarPerfil(5, { email_institucional: 'outro@univille.edu.br' }))
      .rejects.toBeInstanceOf(ConflictError)
    await expect(service.atualizarPerfil(5, { email_institucional: 'outro@univille.edu.br' }))
      .rejects.toThrow('Já existe um usuário com este e-mail institucional')
    expect(usuarios.atualizar).not.toHaveBeenCalled()

    await expect(service.atualizarPerfil(5, { nome_completo: 'Novo' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.atualizarPerfil(5, { nome_completo: 'Novo' })).rejects.toBeInstanceOf(UnprocessableError)
    expect(usuarios.atualizar).toHaveBeenCalledTimes(2)
  })

  it('[RF-003] atualizarFotoPerfil e removerFotoPerfil retornam perfil sem senha', async () => {
    const usuarios = repositorioFake({
      atualizarFotoPerfil: () => ({ id: 1, foto_perfil_path: 'foto.png', senha_hash: 'h' }),
      removerFotoPerfil: () => ({ id: 1, foto_perfil_path: null, senha_hash: 'h' }),
    })
    const service = new UsuarioService({ usuarios })

    expect(await service.atualizarFotoPerfil(1, 'foto.png', CONEXAO)).toEqual({
      id: 1,
      foto_perfil_path: 'foto.png',
    })
    expect(usuarios.atualizarFotoPerfil).toHaveBeenCalledWith(1, 'foto.png', CONEXAO)
    expect(await service.removerFotoPerfil(1, CONEXAO)).toEqual({
      id: 1,
      foto_perfil_path: null,
    })
    expect(usuarios.removerFotoPerfil).toHaveBeenCalledWith(1, CONEXAO)

    const vazio = new UsuarioService({ usuarios: repositorioFake() })
    await expect(vazio.atualizarFotoPerfil(1)).rejects.toBeInstanceOf(NotFoundError)
    await expect(vazio.removerFotoPerfil(1)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('[RF-004] perfilPublico exige perfil existente e mantém métricas', async () => {
    const usuarios = repositorioFake({
      perfilPublico: () => ({
        id: 2,
        nome_completo: 'Ana',
        foto_perfil_path: 'foto.png',
        media_avaliacoes: 'Sem avaliações',
        viagens_concluidas: undefined,
        senha_hash: 'segredo',
      }),
    })
    const service = new UsuarioService({ usuarios })

    expect(await service.perfilPublico(2, CONEXAO)).toEqual({
      id: 2,
      nome_completo: 'Ana',
      foto_perfil_path: 'foto.png',
      media_avaliacoes: 'Sem avaliações',
      viagens_concluidas: 0,
    })
    expect(usuarios.perfilPublico).toHaveBeenCalledWith(2, CONEXAO)

    const vazio = new UsuarioService({ usuarios: repositorioFake() })
    await expect(vazio.perfilPublico(2)).rejects.toBeInstanceOf(NotFoundError)
    await expect(vazio.perfilPublico(2)).rejects.toThrow('Usuário não encontrado')
  })

  it('[RF-004] mediaAvaliacoes e viagensConcluidas delegam e traduzem TypeError', async () => {
    const usuarios = repositorioFake({
      mediaAvaliacoes: () => 4.5,
      contarViagensConcluidas: () => 12,
    })
    const service = new UsuarioService({ usuarios })

    expect(await service.mediaAvaliacoes(3, CONEXAO)).toBe(4.5)
    expect(await service.viagensConcluidas(3, CONEXAO)).toBe(12)
    expect(usuarios.mediaAvaliacoes).toHaveBeenCalledWith(3, CONEXAO)
    expect(usuarios.contarViagensConcluidas).toHaveBeenCalledWith(3, CONEXAO)

    usuarios.mediaAvaliacoes.mockRejectedValueOnce(new TypeError('id inválido'))
    usuarios.contarViagensConcluidas.mockRejectedValueOnce(new TypeError('id inválido'))
    await expect(service.mediaAvaliacoes(3)).rejects.toBeInstanceOf(UnprocessableError)
    await expect(service.viagensConcluidas(3)).rejects.toBeInstanceOf(UnprocessableError)
  })
})
