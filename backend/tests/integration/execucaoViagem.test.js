import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const MILISEGUNDOS_POR_MINUTO = 60 * 1000
const PERCURSO = ['Univille', 'Bairro', 'Centro']

function isoDeslocado(minutos) {
  return new Date(Date.now() + minutos * MILISEGUNDOS_POR_MINUTO).toISOString()
}

function resultadosDaBusca(body) {
  const candidatos = [
    body,
    body?.data,
    body?.resultados,
    body?.ofertas,
    body?.data?.resultados,
    body?.data?.ofertas,
    body?.data?.itens,
    body?.data?.rows,
  ]
  for (const candidato of candidatos) {
    if (Array.isArray(candidato)) return candidato
  }
  return []
}

function ofertaDoResultado(item) {
  return item?.oferta ?? item?.data ?? item
}

function idDaOferta(item) {
  const oferta = ofertaDoResultado(item)
  return oferta?.id ?? oferta?.oferta_id ?? oferta?.ofertaId
}

function idsDaBusca(body) {
  return resultadosDaBusca(body).map(idDaOferta)
}

describe('Integração de execução da viagem (RF-017, RF-022, RNF-004, RN-009, CA-008)', () => {
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

  async function criarUsuario(indice, overrides = {}) {
    const dados = {
      nome_completo: `Usuario ${indice}`,
      matricula: MATRICULAS_AUTORIZADAS[indice],
      email_institucional: `usuario${indice}@univille.br`,
      senha_hash: '$2b$10$hashmockadoapenasparafixture',
      telefone: `(47) 99999-${String(1000 + indice).padStart(4, '0')}`,
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
      placa: 'ABC1D23',
      ano: 2020,
      capacidade_passageiros: 4,
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
      paradas: [...PERCURSO],
      data_hora_saida: isoDeslocado(-30),
      vagas_total: 3,
      valor: 0,
      estado: 'ABERTA',
      iniciada_em: null,
      concluida_em: null,
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida,
        vagas_total, valor, estado, iniciada_em, concluida_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        motorista.id,
        veiculo.id,
        dados.origem,
        dados.destino,
        JSON.stringify(dados.paradas),
        dados.data_hora_saida,
        dados.vagas_total,
        dados.valor,
        dados.estado,
        dados.iniciada_em,
        dados.concluida_em,
      ],
    )
    return contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [resultado.lastID])
  }

  async function criarReserva(oferta, passageiro, status = 'CONFIRMADA') {
    const resultado = await contexto.db.run(
      'INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)',
      [oferta.id, passageiro.id, status],
    )
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [resultado.lastID])
  }

  async function detalhar(usuario, ofertaId) {
    return contexto.request
      .get(`/api/ofertas/${ofertaId}`)
      .set('Authorization', auth(usuario))
  }

  async function buscar(usuario, filtros = {}) {
    const saida = new Date(filtros.dataHoraSaida ?? isoDeslocado(-30))
    const data = saida.toISOString().slice(0, 10)
    const horario = saida.toISOString().slice(11, 16)
    return contexto.request
      .get('/api/ofertas/busca')
      .set('Authorization', auth(usuario))
      .query({
        origem: 'Univille',
        destino: 'Centro',
        data,
        horario,
        ...filtros.query,
      })
  }

  it('[RF-017/RN-009] motorista inicia e conclui a viagem a partir do horário previsto', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { data_hora_saida: isoDeslocado(-5) })
    await criarReserva(oferta, passageiro)

    const inicio = await contexto.request
      .post(`/api/ofertas/${oferta.id}/iniciar`)
      .set('Authorization', auth(motorista))
      .send({})

    expect(inicio.status).toBe(200)
    const salvaInicio = await contexto.db.get(
      'SELECT estado, iniciada_em, concluida_em FROM ofertas WHERE id = ?',
      [oferta.id],
    )
    expect(salvaInicio.estado).toBe('EM_ANDAMENTO')
    expect(salvaInicio.iniciada_em).not.toBeNull()
    expect(salvaInicio.concluida_em).toBeNull()

    const conclusao = await contexto.request
      .post(`/api/ofertas/${oferta.id}/concluir`)
      .set('Authorization', auth(motorista))
      .send({})

    expect(conclusao.status).toBe(200)
    const salvaConclusao = await contexto.db.get(
      'SELECT estado, iniciada_em, concluida_em FROM ofertas WHERE id = ?',
      [oferta.id],
    )
    expect(salvaConclusao.estado).toBe('CONCLUIDA')
    expect(salvaConclusao.iniciada_em).not.toBeNull()
    expect(salvaConclusao.concluida_em).not.toBeNull()
  })

  it('[RNF-002/RN-008] somente o motorista inicia e conclui a viagem', async () => {
    const motorista = await criarUsuario(0)
    const terceiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, { data_hora_saida: isoDeslocado(-5) })

    const inicioTerceiro = await contexto.request
      .post(`/api/ofertas/${oferta.id}/iniciar`)
      .set('Authorization', auth(terceiro))
      .send({})
    const conclusaoTerceiro = await contexto.request
      .post(`/api/ofertas/${oferta.id}/concluir`)
      .set('Authorization', auth(terceiro))
      .send({})

    expect([401, 403, 404]).toContain(inicioTerceiro.status)
    expect([401, 403, 404]).toContain(conclusaoTerceiro.status)
    expect((await contexto.db.get('SELECT estado FROM ofertas WHERE id = ?', [oferta.id])).estado).toBe('ABERTA')

    const inicioMotorista = await contexto.request
      .post(`/api/ofertas/${oferta.id}/iniciar`)
      .set('Authorization', auth(motorista))
      .send({})
    expect(inicioMotorista.status).toBe(200)
  })

  it('[RF-022/RN-009/CA-008] após o horário previsto, oferta sai da busca, fica visível só a participantes e não aceita novas reservas', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const terceiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, {
      data_hora_saida: isoDeslocado(-15),
      estado: 'ABERTA',
    })
    await criarReserva(oferta, passageiro)

    const buscaMotorista = await buscar(motorista, { dataHoraSaida: oferta.data_hora_saida })
    const buscaPassageiro = await buscar(passageiro, { dataHoraSaida: oferta.data_hora_saida })
    const buscaTerceiro = await buscar(terceiro, { dataHoraSaida: oferta.data_hora_saida })

    expect(buscaMotorista.status).toBe(200)
    expect(buscaPassageiro.status).toBe(200)
    expect(buscaTerceiro.status).toBe(200)
    expect(idsDaBusca(buscaMotorista.body)).not.toContain(oferta.id)
    expect(idsDaBusca(buscaPassageiro.body)).not.toContain(oferta.id)
    expect(idsDaBusca(buscaTerceiro.body)).not.toContain(oferta.id)

    const detalheMotorista = await detalhar(motorista, oferta.id)
    const detalhePassageiro = await detalhar(passageiro, oferta.id)
    const detalheTerceiro = await detalhar(terceiro, oferta.id)

    expect(detalheMotorista.status).toBe(200)
    expect(detalhePassageiro.status).toBe(200)
    expect([403, 404]).toContain(detalheTerceiro.status)

    const reservaTerceiro = await contexto.request
      .post(`/api/ofertas/${oferta.id}/reservas`)
      .set('Authorization', auth(terceiro))
      .send({})

    expect(reservaTerceiro.status).toBe(409)
    const ocupantes = await contexto.db.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND status IN ('CONFIRMADA', 'NO_SHOW')`,
      [oferta.id],
    )
    expect(ocupantes.total).toBe(1)
  })

  it('[RF-017/RF-022/RN-009] oferta iniciada ou concluída não aparece na busca e não aceita novas reservas', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const terceiro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)

    const iniciada = await criarOferta(motorista, veiculo, {
      data_hora_saida: isoDeslocado(-20),
      estado: 'EM_ANDAMENTO',
      iniciada_em: isoDeslocado(-10),
    })
    await criarReserva(iniciada, passageiro)

    const buscaIniciada = await buscar(motorista, { dataHoraSaida: iniciada.data_hora_saida })
    expect(buscaIniciada.status).toBe(200)
    expect(idsDaBusca(buscaIniciada.body)).not.toContain(iniciada.id)

    const reservaIniciada = await contexto.request
      .post(`/api/ofertas/${iniciada.id}/reservas`)
      .set('Authorization', auth(terceiro))
      .send({})
    expect(reservaIniciada.status).toBe(409)

    const concluida = await criarOferta(motorista, veiculo, {
      data_hora_saida: isoDeslocado(-60),
      estado: 'CONCLUIDA',
      iniciada_em: isoDeslocado(-50),
      concluida_em: isoDeslocado(-40),
    })
    const buscaConcluida = await buscar(motorista, { dataHoraSaida: concluida.data_hora_saida })
    expect(buscaConcluida.status).toBe(200)
    expect(idsDaBusca(buscaConcluida.body)).not.toContain(concluida.id)

    const reservaConcluida = await contexto.request
      .post(`/api/ofertas/${concluida.id}/reservas`)
      .set('Authorization', auth(terceiro))
      .send({})
    expect(reservaConcluida.status).toBe(409)
  })
})
