import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const [MATRICULA_MOTORISTA, MATRICULA_PASSAGEIRO, MATRICULA_TERCEIRO] = MATRICULAS_AUTORIZADAS
const PLACA = 'ABC1D23'
const PLACA_OUTRO = 'XYZ9K87'
const SAIDA_FUTURA = '2027-01-20T08:00:00.000Z'

function desembrulhar(body) {
  const resposta = body?.data ?? body ?? {}
  return resposta.veiculo ?? resposta.vehicles ?? resposta
}

function chavesDeFoto(body) {
  const encontradas = new Set()

  function percorrer(valor) {
    if (Array.isArray(valor)) {
      valor.forEach(percorrer)
      return
    }
    if (!valor || typeof valor !== 'object') return

    for (const [chave, conteudo] of Object.entries(valor)) {
      if (/foto|imagem|image|photo/i.test(chave)) encontradas.add(chave)
      percorrer(conteudo)
    }
  }

  percorrer(body)
  return [...encontradas]
}

describe('Integração de veículos (RF-006, RF-007, RNF-004, RN-002, RN-008, CA-002)', () => {
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

  async function criarOferta(motorista, veiculo, overrides = {}) {
    const dados = {
      origem: 'Univille',
      destino: 'Centro',
      paradas: JSON.stringify(['Univille', 'Centro']),
      data_hora_saida: SAIDA_FUTURA,
      vagas_total: 3,
      valor: 0,
      estado: 'ABERTA',
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida,
        vagas_total, valor, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        motorista.id,
        veiculo.id,
        dados.origem,
        dados.destino,
        dados.paradas,
        dados.data_hora_saida,
        dados.vagas_total,
        dados.valor,
        dados.estado,
      ],
    )
    return contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [resultado.lastID])
  }

  async function criarReserva(oferta, passageiro, status = 'CONFIRMADA') {
    const resultado = await contexto.db.run(
      `INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)`,
      [oferta.id, passageiro.id, 'CONFIRMADA'],
    )
    if (status !== 'CONFIRMADA') {
      await contexto.db.run('UPDATE reservas SET status = ? WHERE id = ?', [status, resultado.lastID])
    }
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [resultado.lastID])
  }

  function detalheOferta(oferta, usuario) {
    return contexto.request.get(`/api/ofertas/${oferta.id}`).set('Authorization', auth(usuario))
  }

  function dadosVeiculo(overrides = {}) {
    return {
      marca: 'Fiat',
      modelo: 'Uno',
      cor: 'Branco',
      placa: PLACA,
      ano: 2020,
      capacidade_passageiros: 3,
      ...overrides,
    }
  }

  it('[RF-006/RN-002] cadastra veículo com capacidade_passageiros inteira maior que zero e sem foto', async () => {
    const motorista = await criarUsuario()

    const resposta = await contexto.request
      .post('/api/veiculos')
      .set('Authorization', auth(motorista))
      .send(dadosVeiculo({ foto: 'data:image/png;base64,iVBORw0KGgo=' }))

    expect(resposta.status).toBe(201)
    expect(desembrulhar(resposta.body)).toMatchObject({
      marca: 'Fiat',
      modelo: 'Uno',
      placa: PLACA,
      capacidade_passageiros: 3,
      ano: 2020,
    })
    expect(chavesDeFoto(resposta.body)).toEqual([])

    const salvo = await contexto.db.get('SELECT * FROM veiculos WHERE placa = ?', [PLACA])
    expect(salvo).toBeDefined()
    expect(salvo.usuario_id).toBe(motorista.id)
    expect(salvo.capacidade_passageiros).toBe(3)
  })

  it('[RF-006/RN-002] rejeita capacidade_passageiros igual a zero ou negativa', async () => {
    const motorista = await criarUsuario()

    const zero = await contexto.request
      .post('/api/veiculos')
      .set('Authorization', auth(motorista))
      .send(dadosVeiculo({ capacidade_passageiros: 0, placa: 'AAA1A11' }))

    const negativa = await contexto.request
      .post('/api/veiculos')
      .set('Authorization', auth(motorista))
      .send(dadosVeiculo({ capacidade_passageiros: -1, placa: 'BBB2B22' }))

    expect([400, 409, 422]).toContain(zero.status)
    expect([400, 409, 422]).toContain(negativa.status)

    const total = await contexto.db.get('SELECT COUNT(*) AS total FROM veiculos')
    expect(total.total).toBe(0)
  })

  it('[RF-006/RN-002] rejeita capacidade_passageiros não inteira', async () => {
    const motorista = await criarUsuario()

    const resposta = await contexto.request
      .post('/api/veiculos')
      .set('Authorization', auth(motorista))
      .send(dadosVeiculo({ capacidade_passageiros: 2.5 }))

    expect([400, 409, 422]).toContain(resposta.status)
  })

  it('[RF-006/RNF-002] GET /api/veiculos lista apenas os veículos do motorista autenticado', async () => {
    const motorista = await criarUsuario()
    const outro = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'carla.souza@univille.br',
    })
    await criarVeiculo(motorista)
    await criarVeiculo(outro, { placa: PLACA_OUTRO, capacidade_passageiros: 4 })

    const resposta = await contexto.request.get('/api/veiculos').set('Authorization', auth(motorista))

    expect(resposta.status).toBe(200)
    const veiculos = resposta.body.veiculos ?? resposta.body.data ?? resposta.body
    expect(veiculos).toHaveLength(1)
    expect(veiculos[0].placa).toBe(PLACA)
  })

  it('[RNF-002/RN-008] GET /api/veiculos/:id retorna apenas veículo próprio', async () => {
    const motorista = await criarUsuario()
    const outro = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'carla.souza@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const veiculoAlheio = await criarVeiculo(outro, { placa: PLACA_OUTRO })

    const proprio = await contexto.request
      .get(`/api/veiculos/${veiculo.id}`)
      .set('Authorization', auth(motorista))
    const alheio = await contexto.request
      .get(`/api/veiculos/${veiculoAlheio.id}`)
      .set('Authorization', auth(motorista))

    expect(proprio.status).toBe(200)
    expect(desembrulhar(proprio.body).placa).toBe(PLACA)
    expect([401, 403, 404]).toContain(alheio.status)
  })

  it('[RF-006] PUT /api/veiculos/:id atualiza apenas veículo próprio', async () => {
    const motorista = await criarUsuario()
    const outro = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'carla.souza@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const veiculoAlheio = await criarVeiculo(outro, { placa: PLACA_OUTRO })

    const proprio = await contexto.request
      .put(`/api/veiculos/${veiculo.id}`)
      .set('Authorization', auth(motorista))
      .send({ cor: 'Prata', capacidade_passageiros: 4 })

    const alheio = await contexto.request
      .put(`/api/veiculos/${veiculoAlheio.id}`)
      .set('Authorization', auth(motorista))
      .send({ cor: 'Preto' })

    expect([200, 204]).toContain(proprio.status)
    expect([401, 403, 404]).toContain(alheio.status)
    expect((await contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [veiculo.id])).cor).toBe('Prata')
    expect((await contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [veiculo.id])).capacidade_passageiros).toBe(4)
    expect((await contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [veiculoAlheio.id])).cor).toBe('Branco')
  })

  it('[RF-006/RN-008] DELETE /api/veiculos/:id remove apenas veículo próprio', async () => {
    const motorista = await criarUsuario()
    const outro = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'carla.souza@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const veiculoAlheio = await criarVeiculo(outro, { placa: PLACA_OUTRO })

    const proprio = await contexto.request.delete(`/api/veiculos/${veiculo.id}`).set('Authorization', auth(motorista))
    const alheio = await contexto.request
      .delete(`/api/veiculos/${veiculoAlheio.id}`)
      .set('Authorization', auth(motorista))

    expect([200, 204]).toContain(proprio.status)
    expect([401, 403, 404]).toContain(alheio.status)
    expect(await contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [veiculo.id])).toBeUndefined()
    expect(await contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [veiculoAlheio.id])).toBeDefined()
  })

  it('[RN-002] vagas da oferta não podem ultrapassar a capacidade_passageiros do veículo', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista, { capacidade_passageiros: 2 })

    const resposta = await contexto.request
      .post('/api/ofertas')
      .set('Authorization', auth(motorista))
      .send({
        veiculo_id: veiculo.id,
        origem: 'Univille',
        destino: 'Centro',
        paradas: ['Univille', 'Centro'],
        data_hora_saida: SAIDA_FUTURA,
        vagas_total: 3,
        valor: 0,
      })

    expect([400, 409, 422]).toContain(resposta.status)
    const total = await contexto.db.get('SELECT COUNT(*) AS total FROM ofertas')
    expect(total.total).toBe(0)

    await expect(
      contexto.db.run(
        `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida,
          vagas_total, valor, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA')`,
        [
          motorista.id,
          veiculo.id,
          'Univille',
          'Centro',
          JSON.stringify(['Univille', 'Centro']),
          SAIDA_FUTURA,
          3,
          0,
        ],
      ),
    ).rejects.toThrow(/capacidade/i)
  })

  it('[RF-007/RN-008/CA-002] dono do veículo vê a placa no detalhe da oferta', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { vagas_total: 3 })

    const resposta = await detalheOferta(oferta, motorista)

    expect(resposta.status).toBe(200)
    expect(JSON.stringify(resposta.body)).toContain(PLACA)
  })

  it('[RF-007/RN-008/CA-002] usuário sem reserva não vê a placa no detalhe da oferta', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)
    const estranho = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'bruno.lima@univille.br',
    })

    const resposta = await detalheOferta(oferta, estranho)

    expect(resposta.status).toBe(200)
    expect(JSON.stringify(resposta.body)).not.toContain(PLACA)
  })

  it('[RF-007/RN-008/CA-002] passageiro com reserva confirmada vê a placa no detalhe da oferta', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'bruno.lima@univille.br',
    })
    await criarReserva(oferta, passageiro, 'CONFIRMADA')

    const resposta = await detalheOferta(oferta, passageiro)

    expect(resposta.status).toBe(200)
    expect(JSON.stringify(resposta.body)).toContain(PLACA)
  })

  it('[RF-007/RN-008/CA-002] passageiro com reserva cancelada não vê a placa no detalhe da oferta', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo)
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'bruno.lima@univille.br',
    })
    await criarReserva(oferta, passageiro, 'CANCELADA')

    const resposta = await detalheOferta(oferta, passageiro)

    expect(resposta.status).toBe(200)
    expect(JSON.stringify(resposta.body)).not.toContain(PLACA)
  })
})
