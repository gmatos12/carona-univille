import jwt from 'jsonwebtoken'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { createTestApp } from './helpers/app.js'

const SENHA = 'Senha@Forte2026'
const [MATRICULA_AUTORIZADA_A, MATRICULA_AUTORIZADA_B] = MATRICULAS_AUTORIZADAS
const MATRICULA_NAO_AUTORIZADA = '00000000'
const EMAIL_PRIMEIRO_USUARIO = 'ana.silva@univille.br'
const EMAIL_SEGUNDO_USUARIO = 'bruno.lima@univille.br'

function dadosCadastro(overrides = {}) {
  return {
    nome_completo: 'Ana Maria Silva',
    matricula: MATRICULA_AUTORIZADA_A,
    email_institucional: EMAIL_PRIMEIRO_USUARIO,
    senha: SENHA,
    telefone: '(47) 99999-1234',
    ...overrides,
  }
}

function dadosLogin(overrides = {}) {
  return {
    email_institucional: EMAIL_PRIMEIRO_USUARIO,
    senha: SENHA,
    ...overrides,
  }
}

function extrairToken(body) {
  const resposta = body?.data ?? body
  return resposta?.token ?? resposta?.access_token ?? resposta?.accessToken ?? null
}

function extrairUsuario(body) {
  const resposta = body?.data ?? body
  return resposta?.usuario ?? resposta?.user ?? resposta ?? null
}

function naoExpoeSenha(body) {
  const texto = JSON.stringify(body ?? {})
  return !texto.includes(SENHA) && !texto.includes('senha_hash') && !texto.includes('"senha"')
}

describe('Integração de cadastro e login (RF-001, RF-002, RNF-002, RNF-004, RN-001, CA-001)', () => {
  let contexto

  beforeAll(async () => {
    contexto = await createTestApp()
  })

  afterEach(async () => {
    await contexto.reset()
  })

  afterAll(async () => {
    await contexto.close()
  })

  async function cadastrar(overrides = {}) {
    return contexto.request.post('/api/auth/cadastro').send(dadosCadastro(overrides))
  }

  async function login(overrides = {}) {
    return contexto.request.post('/api/auth/login').send(dadosLogin(overrides))
  }

  async function buscarUsuarioPorEmail(email) {
    return contexto.db.get('SELECT * FROM usuarios WHERE email_institucional = ?', [email])
  }

  async function buscarUsuarioPorId(id) {
    return contexto.db.get('SELECT * FROM usuarios WHERE id = ?', [id])
  }

  async function contarUsuarios() {
    const resultado = await contexto.db.get('SELECT COUNT(*) AS total FROM usuarios')
    return resultado.total
  }

  it('[RF-001/RN-001/CA-001] cria conta com matrícula autorizada pela base local fictícia', async () => {
    const resposta = await cadastrar()

    expect(resposta.status).toBe(201)
    expect(extrairUsuario(resposta.body)).toMatchObject({
      matricula: MATRICULA_AUTORIZADA_A,
      email_institucional: EMAIL_PRIMEIRO_USUARIO,
    })
    expect(naoExpoeSenha(resposta.body)).toBe(true)

    const usuario = await buscarUsuarioPorEmail(EMAIL_PRIMEIRO_USUARIO)
    expect(usuario).toBeDefined()
    expect(usuario.matricula).toBe(MATRICULA_AUTORIZADA_A)
    expect(usuario.conta_ativa).toBe(1)
    expect(usuario.senha_hash).not.toBe(SENHA)
    expect(usuario.senha_hash).toMatch(/^\$2[aby]\$/)

    const matricula = await contexto.db.get(
      'SELECT utilizada FROM matriculas_autorizadas WHERE matricula = ?',
      [MATRICULA_AUTORIZADA_A],
    )
    expect(matricula.utilizada).toBe(1)
  })

  it('[RF-001/RN-001/CA-001] rejeita cadastro com matrícula fora da base local autorizada', async () => {
    const resposta = await cadastrar({ matricula: MATRICULA_NAO_AUTORIZADA })

    expect([400, 409, 422]).toContain(resposta.status)
    expect(naoExpoeSenha(resposta.body)).toBe(true)
    expect(await buscarUsuarioPorEmail(EMAIL_PRIMEIRO_USUARIO)).toBeUndefined()
    expect(await contarUsuarios()).toBe(0)
  })

  it('[RF-001/RNF-004] rejeita cadastro com campos obrigatórios ausentes', async () => {
    const { senha, ...dadosSemSenha } = dadosCadastro()
    const resposta = await contexto.request.post('/api/auth/cadastro').send(dadosSemSenha)

    expect([400, 422]).toContain(resposta.status)
    expect(await contarUsuarios()).toBe(0)
  })

  it('[RF-001/RNF-002] não permite e-mail institucional duplicado', async () => {
    const primeiro = await cadastrar()
    expect(primeiro.status).toBe(201)

    const segundo = await cadastrar({
      matricula: MATRICULA_AUTORIZADA_B,
      email_institucional: EMAIL_PRIMEIRO_USUARIO,
      nome_completo: 'Bruno Lima',
    })

    expect([400, 409, 422]).toContain(segundo.status)
    expect(await contarUsuarios()).toBe(1)

    const matriculaNaoUtilizada = await contexto.db.get(
      'SELECT utilizada FROM matriculas_autorizadas WHERE matricula = ?',
      [MATRICULA_AUTORIZADA_B],
    )
    expect(matriculaNaoUtilizada.utilizada).toBe(0)
  })

  it('[RF-001/RN-001] não permite matrícula duplicada', async () => {
    const primeiro = await cadastrar()
    expect(primeiro.status).toBe(201)

    const segundo = await cadastrar({
      email_institucional: EMAIL_SEGUNDO_USUARIO,
      nome_completo: 'Bruno Lima',
    })

    expect([400, 409, 422]).toContain(segundo.status)
    expect(await contarUsuarios()).toBe(1)
    expect(await buscarUsuarioPorEmail(EMAIL_SEGUNDO_USUARIO)).toBeUndefined()
  })

  it('[RF-002/RN-001/CA-001] mantém a matrícula imutável após a validação no cadastro', async () => {
    const cadastro = await cadastrar()
    expect(cadastro.status).toBe(201)

    const usuario = await buscarUsuarioPorEmail(EMAIL_PRIMEIRO_USUARIO)
    const autenticacao = await login()
    const token = extrairToken(autenticacao.body)
    expect(token).toBeTruthy()

    const edicao = await contexto.request
      .put('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ matricula: MATRICULA_AUTORIZADA_B, nome_completo: 'Ana Maria Souza' })

    expect(edicao.status).toBeLessThan(500)
    expect((await buscarUsuarioPorId(usuario.id)).matricula).toBe(MATRICULA_AUTORIZADA_A)

    await expect(
      contexto.db.run('UPDATE usuarios SET matricula = ? WHERE id = ?', [MATRICULA_AUTORIZADA_B, usuario.id]),
    ).rejects.toThrow(/matricula imutavel/i)
    expect((await buscarUsuarioPorId(usuario.id)).matricula).toBe(MATRICULA_AUTORIZADA_A)
  })

  it('[RF-002/RNF-002] autentica com e-mail e senha corretos e emite JWT com validade de 8h', async () => {
    const cadastro = await cadastrar()
    expect(cadastro.status).toBe(201)

    const resposta = await login()
    expect(resposta.status).toBe(200)
    expect(naoExpoeSenha(resposta.body)).toBe(true)

    const token = extrairToken(resposta.body)
    expect(typeof token).toBe('string')

    const payload = jwt.decode(token)
    expect(payload).toBeTruthy()
    expect(payload.exp - payload.iat).toBe(8 * 60 * 60)

    const usuario = await buscarUsuarioPorEmail(EMAIL_PRIMEIRO_USUARIO)
    expect(String(payload.sub ?? payload.id)).toBe(String(usuario.id))
  })

  it('[RF-002/RNF-002] rejeita login com senha incorreta', async () => {
    const cadastro = await cadastrar()
    expect(cadastro.status).toBe(201)

    const resposta = await login({ senha: 'SenhaErrada2026' })

    expect(resposta.status).toBe(401)
    expect(extrairToken(resposta.body)).toBeNull()
    expect(naoExpoeSenha(resposta.body)).toBe(true)
  })

  it('[RF-002/RNF-002] rejeita login com e-mail institucional inexistente', async () => {
    const resposta = await login({ email_institucional: EMAIL_SEGUNDO_USUARIO })

    expect(resposta.status).toBe(401)
    expect(extrairToken(resposta.body)).toBeNull()
  })
})
