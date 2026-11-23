import { describe, expect, it, vi } from 'vitest'
import {
  UsuarioRepository,
  mapearPerfilProprio,
  mapearPerfilPublico,
  normalizarAtualizacao,
  normalizarUsuario,
} from '../../src/repositories/usuarioRepository.js'

function conexaoFake(impl = {}) {
  return {
    get: vi.fn(impl.get ?? (() => undefined)),
    all: vi.fn(impl.all ?? (() => [])),
    run: vi.fn(impl.run ?? (() => ({ lastID: 1, changes: 1 }))),
  }
}

const USUARIO = {
  nomeCompleto: ' Ana Silva ',
  matricula: ' 20260001 ',
  emailInstitucional: ' ana@univille.edu.br ',
  senhaHash: 'hash',
  telefone: ' 47999999999 ',
}

describe('Normalização de usuários (RF-003, RF-004, RNF-002)', () => {
  it('[RF-003] aceita aliases e campos opcionais na criação', () => {
    expect(normalizarUsuario(USUARIO)).toEqual({
      nome_completo: 'Ana Silva',
      matricula: '20260001',
      email_institucional: 'ana@univille.edu.br',
      senha_hash: 'hash',
      telefone: '47999999999',
      foto_perfil_path: null,
    })
    expect(normalizarUsuario({
      nome_completo: 'B',
      matricula: '2',
      email_institucional: 'b@univille.edu.br',
      senha_hash: 'h',
      telefone: '4',
      foto_perfil_path: '   ',
    }).foto_perfil_path).toBeNull()
  })

  it('[RF-003] rejeita dados obrigatórios inválidos', () => {
    expect(() => normalizarUsuario(null)).toThrow('Dados de usuário inválidos')
    expect(() => normalizarUsuario([])).toThrow('Dados de usuário inválidos')
    expect(() => normalizarUsuario({ ...USUARIO, nomeCompleto: '' })).toThrow('nome_completo é obrigatório')
    expect(() => normalizarUsuario({ ...USUARIO, matricula: 1 })).toThrow('matricula é obrigatório')
    expect(() => normalizarUsuario({ ...USUARIO, emailInstitucional: 'invalido' })).toThrow('email_institucional inválido')
    expect(() => normalizarUsuario({ ...USUARIO, senhaHash: '' })).toThrow('senha_hash é obrigatório')
    expect(() => normalizarUsuario({ ...USUARIO, telefone: null })).toThrow('telefone é obrigatório')
    expect(() => normalizarUsuario({ ...USUARIO, fotoPerfilPath: 1 })).toThrow('foto_perfil_path deve ser texto')
  })

  it('[RF-004] normalizarAtualizacao ignora campos não editáveis e valida os demais', () => {
    expect(normalizarAtualizacao({
      nomeCompleto: ' Ana ',
      emailInstitucional: ' ANA@univille.edu.br ',
      telefone: ' 47999999999 ',
      fotoPerfilPath: ' /fotos/a.png ',
      senha_hash: 'nao editável',
      conta_ativa: 0,
      desconhecido: 'x',
    })).toEqual({
      nome_completo: 'Ana',
      email_institucional: 'ANA@univille.edu.br',
      telefone: '47999999999',
      foto_perfil_path: '/fotos/a.png',
    })
    expect(normalizarAtualizacao({ foto_perfil_path: null })).toEqual({ foto_perfil_path: null })
    expect(() => normalizarAtualizacao({ nome_completo: ' ' })).toThrow('nome_completo é obrigatório')
    expect(() => normalizarAtualizacao({ telefone: 9 })).toThrow('telefone é obrigatório')
    expect(() => normalizarAtualizacao(null)).toThrow('Dados de atualização inválidos')
    expect(() => normalizarAtualizacao({ email_institucional: 'sem-arroba' })).toThrow('email_institucional inválido')
    expect(() => normalizarAtualizacao({ nome_completo: 1 })).toThrow('nome_completo é obrigatório')
    expect(() => normalizarAtualizacao({ fotoPerfilPath: 1 })).toThrow('foto_perfil_path deve ser texto')
  })

  it('[RF-004] mapeia perfis own e público sem expor dados sensíveis', () => {
    expect(mapearPerfilProprio(null)).toBeNull()
    expect(mapearPerfilProprio({ id: 1, nome_completo: 'A', senha_hash: 'segredo' })).toEqual({
      id: 1,
      nome_completo: 'A',
    })
    expect(mapearPerfilPublico(null)).toBeNull()
    expect(mapearPerfilPublico({
      id: '7',
      nome_completo: 'Ana',
      foto_perfil_path: null,
      media_avaliacoes: null,
      viagens_concluidas: null,
      senha_hash: 'segredo',
    })).toEqual({
      id: 7,
      nome_completo: 'Ana',
      foto_perfil_path: null,
      media_avaliacoes: 'Sem avaliações',
      viagens_concluidas: 0,
    })
    expect(mapearPerfilPublico({
      id: 8,
      nome_completo: 'B',
      media_avaliacoes: '0',
      viagens_concluidas: '3',
    })).toMatchObject({ media_avaliacoes: 0, viagens_concluidas: 3 })
  })
})

describe('UsuarioRepository com conexão fake (RF-003, RF-004, RF-020)', () => {
  it('[RF-003] cria usuário e busca o registro inserido na mesma conexão', async () => {
    const conn = conexaoFake({
      run: () => ({ lastID: 42, changes: 1 }),
      get: () => ({ id: 42, nome_completo: 'Ana Silva' }),
    })
    const repositorio = new UsuarioRepository(conn)

    expect(await repositorio.criar(USUARIO, conn)).toEqual({ id: 42, nome_completo: 'Ana Silva' })
    expect(conn.run.mock.calls[0][0]).toContain('INSERT INTO usuarios')
    expect(conn.run.mock.calls[0][1]).toEqual([
      'Ana Silva', '20260001', 'ana@univille.edu.br', 'hash', '47999999999', null,
    ])
    expect(conn.get.mock.calls[0][1]).toEqual([42])
  })

  it('[RF-003] busca por id, matrícula e e-mail e valida entradas', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce({ id: 3 })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
    })
    const repositorio = new UsuarioRepository(conn)

    expect(await repositorio.buscarPorId('1', conn)).toEqual({ id: 1 })
    expect(conn.get.mock.calls[0][0]).toContain('WHERE u.id = ?')

    expect(await repositorio.buscarPorMatricula(' 20260001 ', conn)).toEqual({ id: 2 })
    expect(conn.get.mock.calls[1][1]).toEqual(['20260001'])

    expect(await repositorio.buscarPorEmail(' ANA@univille.edu.br ', conn)).toEqual({ id: 3 })
    expect(conn.get.mock.calls[2][0]).toContain('LOWER(u.email_institucional) = LOWER(?)')

    expect(await repositorio.existeMatricula('20260001', conn)).toBe(false)
    expect(await repositorio.existeEmail('ana@univille.edu.br', conn)).toBe(false)
    await expect(repositorio.buscarPorId(0, conn)).rejects.toThrow('id deve ser um inteiro positivo')
    await expect(repositorio.buscarPorMatricula(' ', conn)).rejects.toThrow('matricula é obrigatório')
    await expect(repositorio.buscarPorEmail(null, conn)).rejects.toThrow('email_institucional é obrigatório')
  })

  it('[RF-004] lista e conta usuários com todos os filtros', async () => {
    const conn = conexaoFake({
      all: () => [{ id: 1, senha_hash: 'h' }],
      get: () => ({ total: '6' }),
    })
    const repositorio = new UsuarioRepository(conn)
    const filtros = {
      matricula: ' 20260001 ',
      emailInstitucional: ' ANA@univille.edu.br ',
      contaAtiva: true,
      search: ' Ana ',
      limit: 1000,
      offset: '2',
    }

    expect(await repositorio.listar(filtros, conn)).toEqual([{ id: 1, senha_hash: 'h' }])
    expect(conn.all.mock.calls[0][0]).toContain('LOWER(u.email_institucional) = LOWER(?)')
    expect(conn.all.mock.calls[0][0]).toContain('LOWER(u.nome_completo) LIKE ?')
    expect(conn.all.mock.calls[0][1]).toEqual([
      '20260001', 'ANA@univille.edu.br', 1, '%ana%', '%ana%', 500, 2,
    ])

    expect(await repositorio.contar(filtros, conn)).toBe(6)
    expect(conn.get.mock.calls[0][0]).toContain('SELECT COUNT(*) AS total FROM usuarios u')
    await expect(repositorio.listar([], conn)).rejects.toThrow('Filtros inválidos')
    await expect(repositorio.listar({ contaAtiva: 'talvez' }, conn)).rejects.toThrow('conta_ativa deve ser booleano ou 0/1')
    await expect(repositorio.listar({ limit: -1 }, conn)).rejects.toThrow('limit deve ser um inteiro não negativo')
  })

  it('[RF-004] atualiza somente quando há alterações editáveis', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce({ id: 5 })
        .mockResolvedValueOnce({ id: 5, nome_completo: 'Novo Nome' })
        .mockResolvedValueOnce({ id: 6 })
        .mockResolvedValueOnce({ id: 6, nome_completo: 'Igual' })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: 5 })
        .mockResolvedValueOnce({ id: 5, nome_completo: 'Igual' }),
    })
    const repositorio = new UsuarioRepository(conn)

    expect(await repositorio.atualizar(5, { nomeCompleto: ' Novo Nome ', senha_hash: 'x' }, conn)).toEqual({
      id: 5,
      nome_completo: 'Novo Nome',
    })
    expect(conn.run).toHaveBeenCalledTimes(1)
    expect(conn.run.mock.calls[0][0]).toBe('UPDATE usuarios SET nome_completo = ? WHERE id = ?')
    expect(conn.run.mock.calls[0][1]).toEqual(['Novo Nome', 5])

    expect(await repositorio.atualizar(6, { senha_hash: 'x' }, conn)).toEqual({ id: 6, nome_completo: 'Igual' })
    expect(conn.run).toHaveBeenCalledTimes(1)
    expect(await repositorio.atualizar(7, { nome_completo: 'A' }, conn)).toBeNull()
    await expect(repositorio.atualizar(0, {}, conn)).rejects.toThrow('id deve ser um inteiro positivo')
    expect(await repositorio.atualizar(5, { email: 'invalido' }, conn)).toEqual({
      id: 5,
      nome_completo: 'Igual',
    })
    expect(conn.run).toHaveBeenCalledTimes(1)
  })

  it('[RF-003] atualizarFotoPerfil e removerFotoPerfil usam a atualização padrão', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 1, foto_perfil_path: 'foto.png' })
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 1, foto_perfil_path: null }),
      run: () => ({ lastID: 0, changes: 1 }),
    })
    const repositorio = new UsuarioRepository(conn)

    expect((await repositorio.atualizarFotoPerfil(1, 'foto.png', conn)).foto_perfil_path).toBe('foto.png')
    expect(conn.run.mock.calls[0][1]).toEqual(['foto.png', 1])
    expect((await repositorio.removerFotoPerfil(1, conn)).foto_perfil_path).toBeNull()
    expect(conn.run.mock.calls[1][1]).toEqual([null, 1])
  })

  it('[RF-020] definirContaAtiva valida valor e retorna se linha foi alterada', async () => {
    const conn = conexaoFake({
      run: vi.fn().mockResolvedValueOnce({ changes: 1 }).mockResolvedValueOnce({ changes: 0 }),
    })
    const repositorio = new UsuarioRepository(conn)

    expect(await repositorio.definirContaAtiva('7', false, conn)).toBe(true)
    expect(conn.run.mock.calls[0][1]).toEqual([0, 7])
    expect(await repositorio.definirContaAtiva(7, '1', conn)).toBe(false)
    expect(conn.run.mock.calls[1][1]).toEqual([1, 7])
    await expect(repositorio.definirContaAtiva(7, 'talvez', conn)).rejects.toThrow('ativa deve ser booleano ou 0/1')
    await expect(repositorio.definirContaAtiva(7, null, conn)).rejects.toThrow('ativa deve ser booleano ou 0/1')
  })

  it('[RF-020] anonimiza apenas contas ativas', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: 8, conta_ativa: 0 })
        .mockResolvedValueOnce({ id: 8 })
        .mockResolvedValueOnce({ id: 9, conta_ativa: 1 })
        .mockResolvedValueOnce({ id: 9, conta_ativa: 0 }),
      run: () => ({ lastID: 0, changes: 1 }),
    })
    const repositorio = new UsuarioRepository(conn)

    expect(await repositorio.anonimizar(7, conn)).toBeNull()
    expect(await repositorio.anonimizar(8, conn)).toEqual({ id: 8 })
    expect(conn.run).not.toHaveBeenCalled()

    expect(await repositorio.anonimizar(9, conn)).toEqual({ id: 9, conta_ativa: 0 })
    expect(conn.run).toHaveBeenCalledTimes(1)
    expect(conn.run.mock.calls[0][1]).toEqual([
      'Usuario Excluido 9',
      'excluido-9@anonimizado.invalid',
      'hash-anonimizado',
      '0000000000',
      9,
    ])
  })

  it('[RF-004] consulta perfil público, média e viagens concluídas', async () => {
    const conn = conexaoFake({
      get: vi.fn()
        .mockResolvedValueOnce({
          id: '3',
          nome_completo: 'Ana',
          media_avaliacoes: '4.5',
          viagens_concluidas: '2',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ media: '4.8' })
        .mockResolvedValueOnce({ media: null })
        .mockResolvedValueOnce({ total: '5' })
        .mockResolvedValueOnce(undefined),
    })
    const repositorio = new UsuarioRepository(conn)

    expect((await repositorio.perfilPublico(3, conn)).media_avaliacoes).toBe(4.5)
    expect(await repositorio.perfilPublico(4, conn)).toBeNull()
    expect(conn.get.mock.calls[0][0]).toContain('u.conta_ativa = 1')

    expect(await repositorio.mediaAvaliacoes(3, conn)).toBe(4.8)
    expect(await repositorio.mediaAvaliacoes(4, conn)).toBeNull()
    expect(await repositorio.contarViagensConcluidas(3, conn)).toBe(5)
    expect(conn.get.mock.calls[4][1]).toEqual([3, 3])
    expect(await repositorio.contarViagensConcluidas(4, conn)).toBe(0)
  })
})
