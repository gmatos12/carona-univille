import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { combineDateAndTime } from '../../src/utils/dateTime.js'
import { construirPercurso } from '../../src/utils/percurso.js'
import { createTestApp } from './helpers/app.js'

const [MATRICULA_MOTORISTA, MATRICULA_PASSAGEIRO, MATRICULA_TERCEIRO] = MATRICULAS_AUTORIZADAS
const PERCURSO = construirPercurso('Univille', ['Bairro', 'Shopping'], 'Centro')
const HORARIO = '10:00'
const MILISEGUNDOS_POR_MINUTO = 60 * 1000

function dataLocal(offsetDias) {
  const data = new Date()
  data.setDate(data.getDate() + offsetDias)
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

const DATA_FUTURA = dataLocal(2)
const DATA_PASSADA = dataLocal(-1)

function horarioISO(data, deslocamentoMinutos = 0) {
  return new Date(
    combineDateAndTime(data, HORARIO).getTime() + deslocamentoMinutos * MILISEGUNDOS_POR_MINUTO,
  ).toISOString()
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

function situacaoDaOferta(item) {
  const oferta = ofertaDoResultado(item)
  const valor = oferta?.situacao ?? oferta?.status ?? oferta?.situacao_oferta
    ?? oferta?.estado_situacao ?? oferta?.situacao?.nome
  return typeof valor === 'string' ? valor.trim().toLowerCase() : ''
}

function vagasDisponiveis(item) {
  const oferta = ofertaDoResultado(item)
  const informadas = oferta?.vagas_disponiveis ?? oferta?.vagasDisponiveis
    ?? oferta?.vagas_livres ?? oferta?.vagas
  if (informadas !== undefined && informadas !== null) return Number(informadas)

  const total = Number(oferta?.vagas_total ?? oferta?.vagas ?? 0)
  const ocupadas = Number(oferta?.reservas_confirmadas ?? oferta?.vagas_ocupadas ?? 0)
  return total - ocupadas
}

function paradasDaOferta(item) {
  const oferta = ofertaDoResultado(item)
  const valor = oferta?.paradas ?? oferta?.percurso ?? oferta?.pontos
  if (Array.isArray(valor)) return valor
  if (typeof valor === 'string') {
    try {
      const analisado = JSON.parse(valor)
      if (Array.isArray(analisado)) return analisado
    } catch {
      return []
    }
  }
  return []
}

function nomeMotorista(item) {
  const oferta = ofertaDoResultado(item)
  return oferta?.motorista?.nome_completo ?? oferta?.motorista?.nome
    ?? oferta?.motorista?.nomeCompleto ?? oferta?.motorista?.usuario?.nome_completo
    ?? oferta?.motorista?.usuario?.nome ?? oferta?.nome_motorista
    ?? oferta?.motorista_nome ?? oferta?.motorista_nome_completo ?? oferta?.motorista
}

describe('Integração de busca de ofertas (RF-011, RF-012, RF-022, RNF-004, RN-009, CA-003, CA-008)', () => {
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
      placa: 'ABC1D23',
      ano: 2020,
      capacidade_passageiros: 6,
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
      data_hora_saida: horarioISO(DATA_FUTURA),
      vagas_total: 3,
      valor: 5,
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
        JSON.stringify(dados.paradas),
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
      'INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)',
      [oferta.id, passageiro.id, status],
    )
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [resultado.lastID])
  }

  function buscar(usuario, filtros = {}) {
    return contexto.request
      .get('/api/ofertas/busca')
      .set('Authorization', auth(usuario))
      .query({
        origem: 'Univille',
        destino: 'Centro',
        data: DATA_FUTURA,
        horario: HORARIO,
        ...filtros,
      })
  }

  function detalhar(usuario, oferta) {
    return contexto.request
      .get(`/api/ofertas/${oferta.id}`)
      .set('Authorization', auth(usuario))
  }

  it('[RF-011/RN-009/CA-003] ordena os resultados pela proximidade do horário desejado', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)
    const exata = await criarOferta(motorista, veiculo, { data_hora_saida: horarioISO(DATA_FUTURA) })
    const maisProxima = await criarOferta(motorista, veiculo, { data_hora_saida: horarioISO(DATA_FUTURA, -5) })
    const proxima = await criarOferta(motorista, veiculo, { data_hora_saida: horarioISO(DATA_FUTURA, 10) })
    const distante = await criarOferta(motorista, veiculo, { data_hora_saida: horarioISO(DATA_FUTURA, -25) })
    await criarOferta(motorista, veiculo, { data_hora_saida: horarioISO(DATA_FUTURA, 31) })

    const resposta = await buscar(motorista)

    expect(resposta.status).toBe(200)
    expect(idsDaBusca(resposta.body)).toEqual([
      exata.id,
      maisProxima.id,
      proxima.id,
      distante.id,
    ])
  })

  it('[RF-011/CA-003] em empate de horário, ordena pela maior quantidade de vagas', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)
    const saida = horarioISO(DATA_FUTURA)
    const poucasVagas = await criarOferta(motorista, veiculo, { data_hora_saida: saida, vagas_total: 1 })
    const muitasVagas = await criarOferta(motorista, veiculo, { data_hora_saida: saida, vagas_total: 5 })

    const resposta = await buscar(motorista)

    expect(resposta.status).toBe(200)
    expect(idsDaBusca(resposta.body)).toEqual([muitasVagas.id, poucasVagas.id])
  })

  it('[RF-011] resultados trazem percurso, horário, vagas, valor, motorista e situação', async () => {
    const motorista = await criarUsuario({ nome_completo: 'Motorista Busca' })
    const veiculo = await criarVeiculo(motorista)
    await criarOferta(motorista, veiculo, { valor: 12.5, vagas_total: 4 })

    const resposta = await buscar(await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'passageiro.busca@univille.br',
    }))

    expect(resposta.status).toBe(200)
    const [resultado] = resultadosDaBusca(resposta.body)
    expect(resultado).toBeDefined()
    expect(String(nomeMotorista(resultado))).toContain('Motorista Busca')
    expect(paradasDaOferta(resultado)).toEqual(PERCURSO)
    expect(resultado?.data_hora_saida ?? resultado?.horario ?? resultado?.horario_saida).toBeDefined()
    expect(vagasDisponiveis(resultado)).toBe(4)
    expect(Number(ofertaDoResultado(resultado)?.valor)).toBe(12.5)
    expect(
      ['situacao', 'status', 'situacao_oferta', 'estado_situacao']
        .some((chave) => chave in ofertaDoResultado(resultado)),
    ).toBe(true)
  })

  it('[RF-007/RNF-002/RN-008/CA-002] busca não expõe placa nem dados sensíveis do motorista', async () => {
    const motorista = await criarUsuario({
      nome_completo: 'Motorista Privacidade',
      telefone: '(47) 99999-9876',
    })
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'passageiro.privacidade@univille.br',
    })
    const veiculo = await criarVeiculo(motorista, { placa: 'PLACA_SECRETA' })
    await criarOferta(motorista, veiculo)
    await contexto.db.run(
      `INSERT INTO penalidades (usuario_id, pontos, motivo, tipo_evento, referencia)
       VALUES (?, ?, ?, ?, ?)`,
      [motorista.id, 1, 'PENALIDADE_SECRETA', 'CANCELAMENTO_MOTORISTA', 'oferta:1'],
    )

    const resposta = await buscar(passageiro)

    expect(resposta.status).toBe(200)
    const texto = JSON.stringify(resposta.body)
    expect(texto).not.toContain(veiculo.placa)
    expect(texto).not.toContain(motorista.matricula)
    expect(texto).not.toContain(motorista.email_institucional)
    expect(texto).not.toContain(motorista.telefone)
    expect(texto).not.toContain('PENALIDADE_SECRETA')
    expect(Object.keys(ofertaDoResultado(resultadosDaBusca(resposta.body)[0]).motorista ?? {})).not.toContain('penalidades')
  })

  it('[RF-012/CA-003] oferta lotada permanece na busca com situação "Lotada"', async () => {
    const motorista = await criarUsuario()
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'passageiro.lotada@univille.br',
    })
    const outro = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'outro.lotada@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const lotada = await criarOferta(motorista, veiculo, { vagas_total: 2, valor: 0 })
    const disponivel = await criarOferta(motorista, veiculo, { data_hora_saida: horarioISO(DATA_FUTURA, 15) })
    await criarReserva(lotada, passageiro)
    await criarReserva(lotada, outro)

    const resposta = await buscar(passageiro)

    expect(resposta.status).toBe(200)
    const resultados = resultadosDaBusca(resposta.body)
    expect(idsDaBusca(resposta.body)).toEqual(expect.arrayContaining([lotada.id, disponivel.id]))
    const resultadoLotada = resultados.find((item) => idDaOferta(item) === lotada.id)
    expect(situacaoDaOferta(resultadoLotada)).toBe('lotada')
    expect(vagasDisponiveis(resultadoLotada)).toBe(0)
  })

  it('[RF-022/RN-009/CA-008] ao atingir o horário a oferta sai da busca, inclusive para participantes', async () => {
    const motorista = await criarUsuario()
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'passageiro.atrasado@univille.br',
    })
    const terceiro = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'terceiro.atrasado@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const ofertaPassada = await criarOferta(motorista, veiculo, {
      data_hora_saida: horarioISO(DATA_PASSADA),
    })
    await criarReserva(ofertaPassada, passageiro)

    const buscaParticipante = await buscar(passageiro, {
      data: DATA_PASSADA,
      horario: HORARIO,
    })
    const buscaTerceiro = await buscar(terceiro, {
      data: DATA_PASSADA,
      horario: HORARIO,
    })

    expect(buscaParticipante.status).toBe(200)
    expect(buscaTerceiro.status).toBe(200)
    expect(idsDaBusca(buscaParticipante.body)).not.toContain(ofertaPassada.id)
    expect(idsDaBusca(buscaTerceiro.body)).not.toContain(ofertaPassada.id)
  })

  it('[RF-022/RN-009/CA-008] após o horário o detalhe fica visível só a participantes, sem início registrado', async () => {
    const motorista = await criarUsuario()
    const passageiro = await criarUsuario({
      matricula: MATRICULA_PASSAGEIRO,
      email_institucional: 'passageiro.detalhe@univille.br',
    })
    const terceiro = await criarUsuario({
      matricula: MATRICULA_TERCEIRO,
      email_institucional: 'terceiro.detalhe@univille.br',
    })
    const veiculo = await criarVeiculo(motorista)
    const ofertaPassada = await criarOferta(motorista, veiculo, {
      data_hora_saida: horarioISO(DATA_PASSADA),
      estado: 'ABERTA',
    })
    await criarReserva(ofertaPassada, passageiro)

    const salva = await contexto.db.get(
      'SELECT estado, iniciada_em, concluida_em FROM ofertas WHERE id = ?',
      [ofertaPassada.id],
    )
    expect(salva.estado).toBe('ABERTA')
    expect(salva.iniciada_em).toBeNull()

    const detalheParticipante = await detalhar(passageiro, ofertaPassada)
    expect(detalheParticipante.status).toBe(200)
    expect(String(JSON.stringify(detalheParticipante.body))).toContain(String(ofertaPassada.id))

    const detalheMotorista = await detalhar(motorista, ofertaPassada)
    expect(detalheMotorista.status).toBe(200)

    const detalheTerceiro = await detalhar(terceiro, ofertaPassada)
    expect([403, 404]).toContain(detalheTerceiro.status)
  })

  it('[RF-022/RN-009/CA-008] ofertas concluídas e canceladas não aparecem na busca', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)
    const aberta = await criarOferta(motorista, veiculo)
    await criarOferta(motorista, veiculo, { estado: 'CONCLUIDA' })
    await criarOferta(motorista, veiculo, { estado: 'CANCELADA' })

    const resposta = await buscar(motorista)

    expect(resposta.status).toBe(200)
    expect(idsDaBusca(resposta.body)).toEqual([aberta.id])
  })

  it('[RF-022/RN-009/CA-008] oferta com horário atingido não reaparece mesmo com situação AGUARDANDO_INICIO', async () => {
    const motorista = await criarUsuario()
    const veiculo = await criarVeiculo(motorista)
    const ofertaPassada = await criarOferta(motorista, veiculo, {
      data_hora_saida: horarioISO(DATA_PASSADA),
      estado: 'ABERTA',
    })
    const ofertaFutura = await criarOferta(motorista, veiculo)

    const respostaPassada = await buscar(motorista, { data: DATA_PASSADA, horario: HORARIO })
    expect(respostaPassada.status).toBe(200)
    expect(idsDaBusca(respostaPassada.body)).not.toContain(ofertaPassada.id)

    const respostaFutura = await buscar(motorista)
    expect(respostaFutura.status).toBe(200)
    expect(idsDaBusca(respostaFutura.body)).toEqual([ofertaFutura.id])
  })
})
