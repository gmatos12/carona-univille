import fs from 'node:fs/promises'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GeUAAAAASUVORK5CYII=',
  'base64',
)
const [MATRICULA_PRIMEIRO, MATRICULA_SEGUNDO, MATRICULA_TERCEIRO] = MATRICULAS_AUTORIZADAS

function desembrulhar(body) {
  const resposta = body?.data ?? body ?? {}
  return resposta.perfil ?? resposta.usuario ?? resposta.user ?? resposta
}

function campo(body, nomes) {
  const perfil = desembrulhar(body)
  for (const nome of nomes) {
    if (perfil[nome] !== undefined) return perfil[nome]
  }
  return undefined
}

function chavesProibidas(body) {
  const encontradas = new Set()

  function percorrer(valor) {
    if (Array.isArray(valor)) {
      valor.forEach(percorrer)
      return
    }
    if (!valor || typeof valor !== 'object') return

    for (const [chave, conteudo] of Object.entries(valor)) {
      if (/matricula|email|telefone|penalidade|senha/i.test(chave)) encontradas.add(chave)
      percorrer(conteudo)
    }
  }

  percorrer(body)
  return [...encontradas]
}

describe('Integração de perfil próprio e público (RF-003, RF-004, RNF-002, RNF-004, RN-008, CA-002)', () => {
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

  async function criarUsuario(overrides = {}) {
    const dados = {
      nome_completo: 'Ana Maria Silva',
      matricula: MATRICULA_PRIMEIRO,
      email_institucional: 'ana.silva@univille.br',
      senha_hash: '$2b$10$hashmockadoapenasparafixture',
      telefone: '(47) 99999-1234',
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO usuarios (nome_completo, matricula, email_institucional, senha_hash, telefone)
       VALUES (?, ?, ?, ?, ?)`,
      [dados.nome_completo, dados.matricula, dados.email_institucional, dados.senha_hash, dados.telefone],
    )
    return contexto.db.get('SELECT * FROM usuarios WHERE id = ?', [resultado.lastID])
  }

  function tokenDo(usuario) {
    return signToken({
      sub: String(usuario.id),
      matricula: usuario.matricula,
      email_institucional: usuario.email_institucional,
    })
  }

  function requisitarPerfilProprio(usuario) {
    return contexto.request.get('/api/me').set('Authorization', `Bearer ${tokenDo(usuario)}`)
  }

  function requisitarPerfilPublico(usuario) {
    return contexto.request.get(`/api/usuarios/${usuario.id}/perfil-publico`)
  }

  async function veiculoDo(usuario) {
    const resultado = await contexto.db.run(
      `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario.id, 'Fiat', 'Uno', 'Branco', 'ABC1D23', 2020, 3],
    )
    return contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [resultado.lastID])
  }

  async function ofertaConcluidaDo(usuario, veiculo) {
    const resultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida,
        vagas_total, valor, estado, concluida_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONCLUIDA', ?)`,
      [
        usuario.id,
        veiculo.id,
        'Univille',
        'Centro',
        JSON.stringify(['Univille', 'Centro']),
        '2026-11-20T08:00:00.000Z',
        3,
        0,
        '2026-11-20T09:00:00.000Z',
      ],
    )
    return contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [resultado.lastID])
  }

  it('[RF-003/RNF-002] GET /api/me retorna os dados do próprio usuário sem credenciais', async () => {
    const usuario = await criarUsuario()

    const resposta = await requisitarPerfilProprio(usuario)

    expect(resposta.status).toBe(200)
    expect(campo(resposta.body, ['nome_completo', 'nome'])).toBe(usuario.nome_completo)
    expect(desembrulhar(resposta.body).matricula).toBe(usuario.matricula)
    expect(desembrulhar(resposta.body).email_institucional).toBe(usuario.email_institucional)
    expect(desembrulhar(resposta.body).telefone).toBe(usuario.telefone)
    expect(JSON.stringify(resposta.body)).not.toContain('senha_hash')
  })

  it('[RF-003/RN-008] PUT /api/me edita dados próprios sem alterar a matrícula', async () => {
    const usuario = await criarUsuario()
    const token = tokenDo(usuario)

    const resposta = await contexto.request
      .put('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome_completo: 'Ana Maria Souza', telefone: '(47) 88888-4321' })

    expect(resposta.status).toBe(200)
    const atualizado = await contexto.db.get('SELECT * FROM usuarios WHERE id = ?', [usuario.id])
    expect(atualizado.nome_completo).toBe('Ana Maria Souza')
    expect(atualizado.telefone).toBe('(47) 88888-4321')
    expect(atualizado.matricula).toBe(usuario.matricula)
  })

  it('[RNF-002/CA-002] GET /api/me exige autenticação', async () => {
    await criarUsuario()

    const resposta = await contexto.request.get('/api/me')

    expect(resposta.status).toBe(401)
  })

  it('[RF-003/RF-004] POST /api/me/foto adiciona foto de perfil opcional e persiste o caminho local', async () => {
    const usuario = await criarUsuario()

    const resposta = await contexto.request
      .post('/api/me/foto')
      .set('Authorization', `Bearer ${tokenDo(usuario)}`)
      .attach('foto', PNG_1X1, { filename: 'perfil.png', contentType: 'image/png' })

    expect([200, 201]).toContain(resposta.status)

    const perfil = await requisitarPerfilProprio(usuario)
    expect(perfil.status).toBe(200)
    const caminho = campo(perfil.body, ['foto_perfil_path', 'foto_perfil', 'foto', 'foto_url'])
    expect(typeof caminho).toBe('string')
    expect(caminho.length).toBeGreaterThan(0)

    const arquivos = await fs.readdir(contexto.uploadDir)
    expect(arquivos.some((arquivo) => /\.(png|jpe?g)$/i.test(arquivo))).toBe(true)
  })

  it('[RF-003/RF-004] DELETE /api/me/foto remove a foto de perfil', async () => {
    const usuario = await criarUsuario()
    const token = tokenDo(usuario)

    await contexto.request
      .post('/api/me/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', PNG_1X1, { filename: 'perfil.png', contentType: 'image/png' })

    const remocao = await contexto.request.delete('/api/me/foto').set('Authorization', `Bearer ${token}`)

    expect([200, 204]).toContain(remocao.status)

    const atualizado = await contexto.db.get('SELECT foto_perfil_path FROM usuarios WHERE id = ?', [usuario.id])
    expect(atualizado.foto_perfil_path).toBeNull()
  })

  it('[RF-004/RNF-004] perfil público exibe nome, foto, média e quantidade de viagens concluídas', async () => {
    const avaliado = await criarUsuario({
      foto_perfil_path: 'perfis/ana.png',
    })
    const avaliadorUm = await criarUsuario({
      matricula: MATRICULA_SEGUNDO,
      email_institucional: 'bruno.lima@univille.br',
    })
    const avaliadorDois = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'carla.souza@univille.br',
    })
    const veiculo = await veiculoDo(avaliado)
    const oferta = await ofertaConcluidaDo(avaliado, veiculo)

    for (const [avaliador, nota] of [
      [avaliadorUm, 4],
      [avaliadorDois, 5],
    ]) {
      await contexto.db.run(
        `INSERT INTO avaliacoes (oferta_id, avaliador_id, avaliado_id, nota) VALUES (?, ?, ?, ?)`,
        [oferta.id, avaliador.id, avaliado.id, nota],
      )
    }

    const resposta = await requisitarPerfilPublico(avaliado)

    expect(resposta.status).toBe(200)
    expect(campo(resposta.body, ['nome_completo', 'nome'])).toBe(avaliado.nome_completo)
    expect(campo(resposta.body, ['foto_perfil_path', 'foto_perfil', 'foto', 'foto_url'])).toBeTruthy()
    expect(Number(campo(resposta.body, ['media_avaliacoes', 'avaliacao_media', 'media', 'reputacao']))).toBe(4.5)
    expect(Number(campo(resposta.body, ['viagens_concluidas', 'total_viagens_concluidas', 'qtd_viagens_concluidas']))).toBe(1)
  })

  it('[RF-004] perfil público sem avaliações exibe "Sem avaliações"', async () => {
    const usuario = await criarUsuario()

    const resposta = await requisitarPerfilPublico(usuario)

    expect(resposta.status).toBe(200)
    expect(JSON.stringify(resposta.body)).toContain('Sem avaliações')
    expect(Number(campo(resposta.body, ['viagens_concluidas', 'total_viagens_concluidas', 'qtd_viagens_concluidas']))).toBe(0)
  })

  it('[RF-004/RN-008/CA-002] perfil público não expõe matrícula, e-mail, telefone, penalidades nem senha', async () => {
    const usuario = await criarUsuario()
    await contexto.db.run(
      `INSERT INTO penalidades (usuario_id, pontos, motivo, tipo_evento, referencia) VALUES (?, ?, ?, ?, ?)`,
      [usuario.id, 1, 'cancelamento com menos de 24h', 'CANCELAMENTO_PASSAGEIRO', 'viagem:1'],
    )

    const resposta = await requisitarPerfilPublico(usuario)

    expect(resposta.status).toBe(200)
    const texto = JSON.stringify(resposta.body)
    expect(texto).not.toContain(usuario.matricula)
    expect(texto).not.toContain(usuario.email_institucional)
    expect(texto).not.toContain(usuario.telefone)
    expect(texto).not.toContain(usuario.senha_hash)
    expect(chavesProibidas(resposta.body)).toEqual([])
  })
})
