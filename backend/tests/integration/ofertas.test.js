import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { NATUREZAS, TIPOS_EVENTO } from '../../src/repositories/historicoRepository.js'
import { createTestApp } from './helpers/app.js'

const [MATRICULA_MOTORISTA, MATRICULA_PASSAGEIRO, MATRICULA_TERCEIRO] = MATRICULAS_AUTORIZADAS
const PLACA = 'ABC1D23'
const SAIDA_FUTURA = '2027-03-15T08:00:00.000Z'
const SAIDA_ALTERADA = '2027-03-15T09:30:00.000Z'
const PERCURSO = ['Univille', 'Bairro', 'Centro']

function desembrulhar(body) {
  const resposta = body?.data ?? body ?? {}
  return resposta.oferta ?? resposta
}

function paradasDaOferta(oferta) {
  if (Array.isArray(oferta?.paradas)) return oferta.paradas
  if (!oferta?.paradas) return []
  return JSON.parse(oferta.paradas)
}

function detalhesDoEvento(evento) {
  if (!evento?.detalhes) return {}
  return typeof evento.detalhes === 'string' ? JSON.parse(evento.detalhes) : evento.detalhes
}

describe('Integração de criação e edição de ofertas (RF-008, RF-009, RNF-004, RN-002, RN-003)', () => {
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
      matricula: MATRICULA_MOTORISTA,
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

  function auth(usuario) {
    return `Bearer ${signToken({
      sub: String(usuario.id),
      matricula: usuario.matricula,
      email_institucional: usuario.email_institucional,
    })}`
  }

  async function criarVeiculo(usuario, overrides = {}) {
    const dados = {
      marca: 'Fiat',
      modelo: 'Uno',
      cor: 'Branco',
      placa: PLACA,
      ano: 2020,
      capacidade_passageiros: 3,
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario.id, dados.marca, dados.modelo, dados.cor, dados.placa, dados.ano, dados.capacidade_passageiros],
    )
    return contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [resultado.lastID])
  }

  function dadosOferta(veiculo, overrides = {}) {
    return {
      veiculo_id: veiculo.id,
      origem: 'Univille',
      destino: 'Centro',
      paradas: [...PERCURSO],
      data_hora_saida: SAIDA_FUTURA,
      vagas_total: 2,
      valor: 0,
      ...overrides,
    }
  }

  async function criarOferta(motorista, veiculo, overrides = {}) {
    const dados = dadosOferta(veiculo, overrides)
    const resultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida,
        vagas_total, valor, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        motorista.id,
        veiculo.id,
        dados.origem,
        dados.destino,
        JSON.stringify(dados.paradas),
        dados.data_hora_saida,
        dados.vagas_total,
        dados.valor,
        dados.estado ?? 'ABERTA',
      ],
    )
    return contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [resultado.lastID])
  }

  async function criarReserva(oferta, passageiro, status = 'CONFIRMADA') {
    const resultado = await contexto.db.run(
      `INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)`,
      [oferta.id, passageiro.id, status],
    )
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [resultado.lastID])
  }

  function criarOfertaViaApi(motorista, veiculo, overrides = {}) {
    return contexto.request
      .post('/api/ofertas')
      .set('Authorization', auth(motorista))
      .send(dadosOferta(veiculo, overrides))
  }

  function editarOfertaViaApi(motorista, ofertaId, alteracoes) {
    return contexto.request
      .put(`/api/ofertas/${ofertaId}`)
      .set('Authorization', auth(motorista))
      .send(alteracoes)
  }

  function eventosDaOferta(ofertaId) {
    return contexto.db.all(
      `SELECT * FROM historico_eventos
       WHERE entidade_tipo = 'oferta' AND entidade_id = ?
       ORDER BY id`,
      [ofertaId],
    )
  }

  it('[RF-008/RN-003] POST /api/ofertas cria oferta com valor zero e vagas dentro da capacidade do veículo', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista, { capacidade_passageiros: 3 })

    const resposta = await criarOfertaViaApi(motorista, veiculo, { valor: 0, vagas_total: 3 })

    expect([200, 201]).toContain(resposta.status)
    const oferta = desembrulhar(resposta.body)
    expect(Number(oferta.valor)).toBe(0)
    expect(Number(oferta.vagas_total ?? oferta.vagas)).toBe(3)

    const salva = await contexto.db.get('SELECT * FROM ofertas WHERE motorista_id = ?', [motorista.id])
    expect(salva).toBeDefined()
    expect(salva.valor).toBe(0)
    expect(salva.vagas_total).toBe(3)
    expect(salva.estado).toBe('ABERTA')
    expect(paradasDaOferta(salva)).toEqual(PERCURSO)
  })

  it('[RF-008/RN-002] rejeita vagas_total acima da capacidade_passageiros do veículo', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista, { capacidade_passageiros: 2 })

    const resposta = await criarOfertaViaApi(motorista, veiculo, { vagas_total: 3 })

    expect([400, 409, 422]).toContain(resposta.status)
    expect((await contexto.db.get('SELECT COUNT(*) AS total FROM ofertas')).total).toBe(0)
    await expect(criarOferta(motorista, veiculo, { vagas_total: 3 })).rejects.toThrow(/capacidade/i)
  })

  it('[RF-008/RN-003] rejeita valor negativo na criação da oferta', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)

    const resposta = await criarOfertaViaApi(motorista, veiculo, { valor: -1 })

    expect([400, 409, 422]).toContain(resposta.status)
    expect((await contexto.db.get('SELECT COUNT(*) AS total FROM ofertas')).total).toBe(0)
  })

  it('[RF-009/RN-003] sem reservas, edição altera origem, destino, horário, paradas, vagas e valor', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista, { capacidade_passageiros: 4 })
    const oferta = await criarOferta(motorista, veiculo, { valor: 0, vagas_total: 1 })

    const resposta = await editarOfertaViaApi(motorista, oferta.id, {
      origem: 'Campus II',
      destino: 'Aeroporto',
      paradas: ['Campus II', 'Shopping', 'Aeroporto'],
      data_hora_saida: SAIDA_ALTERADA,
      vagas_total: 4,
      valor: 12.5,
    })

    expect([200, 201]).toContain(resposta.status)
    const salva = await contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [oferta.id])
    expect(salva.origem).toBe('Campus II')
    expect(salva.destino).toBe('Aeroporto')
    expect(salva.data_hora_saida).toBe(SAIDA_ALTERADA)
    expect(paradasDaOferta(salva)).toEqual(['Campus II', 'Shopping', 'Aeroporto'])
    expect(salva.vagas_total).toBe(4)
    expect(salva.valor).toBe(12.5)
  })

  it('[RF-009/RN-003] com reserva confirmada, origem, destino e horário são imutáveis', async () => {
    const motorista = await criarUsuario()
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'bruno.lima@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)
    await criarReserva(oferta, passageiro)

    const tentativas = [
      { origem: 'Outra Origem' },
      { destino: 'Outro Destino' },
      { data_hora_saida: SAIDA_ALTERADA },
    ]
    for (const alteracoes of tentativas) {
      const resposta = await editarOfertaViaApi(motorista, oferta.id, alteracoes)
      expect([400, 409, 422]).toContain(resposta.status)
    }

    const salva = await contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [oferta.id])
    expect(salva.origem).toBe('Univille')
    expect(salva.destino).toBe('Centro')
    expect(salva.data_hora_saida).toBe(SAIDA_FUTURA)
  })

  it('[RF-009/RN-003] com reserva confirmada, paradas e valor (inclusive zero) podem ser ajustados', async () => {
    const motorista = await criarUsuario()
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'bruno.lima@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { valor: 9.9 })
    await criarReserva(oferta, passageiro)

    const resposta = await editarOfertaViaApi(motorista, oferta.id, {
      paradas: ['Univille', 'Bairro Novo', 'Centro'],
      valor: 0,
    })

    expect([200, 201]).toContain(resposta.status)
    const salva = await contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [oferta.id])
    expect(paradasDaOferta(salva)).toEqual(['Univille', 'Bairro Novo', 'Centro'])
    expect(salva.valor).toBe(0)
    expect(salva.origem).toBe('Univille')
    expect(salva.destino).toBe('Centro')
    expect(salva.data_hora_saida).toBe(SAIDA_FUTURA)
  })

  it('[RF-009/RN-002/RN-003] com reservas, vagas são ajustáveis até a capacidade, nunca abaixo das confirmadas', async () => {
    const motorista = await criarUsuario()
    const primeiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'bruno.lima@univille.br',
    })
    const segundo = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'carla.souza@univille.br',
    })
    const veiculo = await criarVeiculo(motorista, { capacidade_passageiros: 3 })
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 2 })
    await criarReserva(oferta, primeiro)
    await criarReserva(oferta, segundo)

    const aumento = await editarOfertaViaApi(motorista, oferta.id, { vagas_total: 3 })
    expect([200, 201]).toContain(aumento.status)
    expect((await contexto.db.get('SELECT vagas_total FROM ofertas WHERE id = ?', [oferta.id])).vagas_total).toBe(3)

    const reducaoAbaixoDasReservas = await editarOfertaViaApi(motorista, oferta.id, { vagas_total: 1 })
    expect([400, 409, 422]).toContain(reducaoAbaixoDasReservas.status)
    expect((await contexto.db.get('SELECT vagas_total FROM ofertas WHERE id = ?', [oferta.id])).vagas_total).toBe(3)

    await expect(
      contexto.db.run('UPDATE ofertas SET vagas_total = 1 WHERE id = ?', [oferta.id]),
    ).rejects.toThrow(/reservas/i)
  })

  it('[RF-009/RN-002] edição não permite vagas acima da capacidade do veículo', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista, { capacidade_passageiros: 2 })
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 2 })

    const resposta = await editarOfertaViaApi(motorista, oferta.id, { vagas_total: 3 })

    expect([400, 409, 422]).toContain(resposta.status)
    expect((await contexto.db.get('SELECT vagas_total FROM ofertas WHERE id = ?', [oferta.id])).vagas_total).toBe(2)
  })

  it('[RF-009/RNF-002] apenas o motorista dono pode editar a oferta', async () => {
    const motorista = await criarUsuario()
    const terceiro = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'carla.souza@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { valor: 5 })

    const resposta = await editarOfertaViaApi(terceiro, oferta.id, { valor: 99 })

    expect([401, 403, 404]).toContain(resposta.status)
    expect((await contexto.db.get('SELECT valor FROM ofertas WHERE id = ?', [oferta.id])).valor).toBe(5)
  })

  it('[RF-009/RNF-004] criação e edição da oferta registram eventos no histórico com ator e alterações', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)

    const criacao = await criarOfertaViaApi(motorista, veiculo, { valor: 0 })
    expect([200, 201]).toContain(criacao.status)
    const ofertaId = desembrulhar(criacao.body).id
      ?? (await contexto.db.get('SELECT id FROM ofertas WHERE motorista_id = ?', [motorista.id])).id

    const edicao = await editarOfertaViaApi(motorista, ofertaId, { valor: 8, vagas_total: 3 })
    expect([200, 201]).toContain(edicao.status)

    const eventos = await eventosDaOferta(ofertaId)
    expect(eventos.map((evento) => evento.tipo_evento)).toEqual(
      expect.arrayContaining([TIPOS_EVENTO.OFERTA_CRIADA, TIPOS_EVENTO.OFERTA_EDITADA]),
    )
    for (const evento of eventos) {
      expect(evento.ator_usuario_id).toBe(motorista.id)
      expect(detalhesDoEvento(evento)).toMatchObject({ oferta_id: ofertaId })
    }

    const criacaoEvento = eventos.find((evento) => evento.tipo_evento === TIPOS_EVENTO.OFERTA_CRIADA)
    const edicaoEvento = eventos.find((evento) => evento.tipo_evento === TIPOS_EVENTO.OFERTA_EDITADA)
    expect(criacaoEvento.natureza).toBe(NATUREZAS.CRIACAO_OFERTA)
    expect(edicaoEvento.natureza).toBe(NATUREZAS.EDICAO_OFERTA)
    expect(detalhesDoEvento(edicaoEvento).alteracoes).toBeDefined()
  })

  it('[RF-009/RNF-004] edição rejeitada por regra de negócio não registra evento de histórico', async () => {
    const motorista = await criarUsuario()
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'bruno.lima@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)
    await criarReserva(oferta, passageiro)

    const resposta = await editarOfertaViaApi(motorista, oferta.id, { destino: 'Outro Destino' })
    expect([400, 409, 422]).toContain(resposta.status)

    const eventos = await eventosDaOferta(oferta.id)
    expect(eventos.filter((evento) => evento.tipo_evento === TIPOS_EVENTO.OFERTA_EDITADA)).toHaveLength(0)
  })
})
