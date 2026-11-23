import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { signToken } from '../../src/middlewares/auth.js'
import { createTestApp } from './helpers/app.js'

const PERCURSO = ['Univille', 'Bairro', 'Centro']
const UMA_HORA = 60 * 60 * 1000

function saidaEm(horas) {
  return new Date(Date.now() + horas * UMA_HORA).toISOString()
}

describe('Integração de exclusão de conta (RF-024, RF-025, RNF-004, RN-005, RN-009, CA-009)', () => {
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
      senha_hash: `hash-usuario-${indice}`,
      telefone: `(47) 99999-${String(1000 + indice)}`,
      foto_perfil_path: `perfis/usuario-${indice}.jpg`,
      conta_ativa: 1,
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO usuarios
        (nome_completo, matricula, email_institucional, senha_hash, telefone, foto_perfil_path, conta_ativa)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        dados.nome_completo,
        dados.matricula,
        dados.email_institucional,
        dados.senha_hash,
        dados.telefone,
        dados.foto_perfil_path,
        dados.conta_ativa,
      ],
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
      [
        usuario.id,
        dados.marca,
        dados.modelo,
        dados.cor,
        dados.placa,
        dados.ano,
        dados.capacidade_passageiros,
      ],
    )
    return contexto.db.get('SELECT * FROM veiculos WHERE id = ?', [resultado.lastID])
  }

  async function criarOferta(motorista, veiculo, overrides = {}) {
    const dados = {
      origem: 'Univille',
      destino: 'Centro',
      paradas: [...PERCURSO],
      data_hora_saida: saidaEm(2),
      vagas_total: 2,
      valor: 0,
      estado: 'ABERTA',
      ...overrides,
    }
    const resultado = await contexto.db.run(
      `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas,
        data_hora_saida, vagas_total, valor, estado)
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

  async function inserirReserva(ofertaId, passageiroId) {
    const resultado = await contexto.db.run(
      `INSERT INTO reservas (oferta_id, passageiro_id, status)
       VALUES (?, ?, 'CONFIRMADA')`,
      [ofertaId, passageiroId],
    )
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [resultado.lastID])
  }

  async function excluirConta(usuario) {
    const resposta = await contexto.request
      .delete('/api/me')
      .set('Authorization', auth(usuario))
      .send()
    expect([200, 204]).toContain(resposta.status)
    return resposta
  }

  async function buscarUsuario(usuarioId) {
    return contexto.db.get('SELECT * FROM usuarios WHERE id = ?', [usuarioId])
  }

  async function buscarOferta(ofertaId) {
    return contexto.db.get('SELECT * FROM ofertas WHERE id = ?', [ofertaId])
  }

  async function buscarReserva(reservaId) {
    return contexto.db.get('SELECT * FROM reservas WHERE id = ?', [reservaId])
  }

  async function eventos(entidadeTipo, entidadeId) {
    const linhas = await contexto.db.all(
      `SELECT * FROM historico_eventos
       WHERE entidade_tipo = ? AND entidade_id = ? ORDER BY id ASC`,
      [entidadeTipo, entidadeId],
    )
    return linhas.map((linha) => ({
      ...linha,
      detalhes: JSON.parse(linha.detalhes || '{}'),
    }))
  }

  async function penalidades(usuarioId) {
    return contexto.db.all('SELECT * FROM penalidades WHERE usuario_id = ?', [usuarioId])
  }

  async function contarOfertas(motoristaId) {
    const linha = await contexto.db.get(
      'SELECT COUNT(*) AS total FROM ofertas WHERE motorista_id = ?',
      [motoristaId],
    )
    return Number(linha.total)
  }

  async function contarReservas(ofertaId, passageiroId) {
    const linha = await contexto.db.get(
      `SELECT COUNT(*) AS total FROM reservas
       WHERE oferta_id = ? AND passageiro_id = ?`,
      [ofertaId, passageiroId],
    )
    return Number(linha.total)
  }

  it('[RF-024/RF-025/RN-005/CA-009] cancela futuras sem penalidade, registra natureza distinta e anonimiza dados', async () => {
    const excluido = await criarUsuario(0, {
      nome_completo: 'Nome Sensivel Excluido',
      email_institucional: 'excluido.sensivel@univille.br',
      telefone: '(47) 98888-0000',
      foto_perfil_path: 'perfis/foto-sensivel.jpg',
    })
    const passageiroAfetado = await criarUsuario(1)
    const outroMotorista = await criarUsuario(2)
    const outroPassageiro = await criarUsuario(3)

    const veiculoExcluido = await criarVeiculo(excluido)
    const veiculoAlheio = await criarVeiculo(outroMotorista, { placa: 'XYZ9A87' })

    const ofertaPropria = await criarOferta(excluido, veiculoExcluido, {
      data_hora_saida: saidaEm(2),
    })
    const reservaAfetada = await inserirReserva(ofertaPropria.id, passageiroAfetado.id)

    const ofertaAlheia = await criarOferta(outroMotorista, veiculoAlheio, {
      data_hora_saida: saidaEm(2),
    })
    const reservaExcluido = await inserirReserva(ofertaAlheia.id, excluido.id)
    const reservaOutro = await inserirReserva(ofertaAlheia.id, outroPassageiro.id)

    const ofertaPassada = await criarOferta(excluido, veiculoExcluido, {
      data_hora_saida: saidaEm(-2),
      estado: 'CONCLUIDA',
    })

    await excluirConta(excluido)

    const ofertaCancelada = await buscarOferta(ofertaPropria.id)
    expect(ofertaCancelada.estado).toBe('CANCELADA')
    expect(ofertaCancelada.natureza_cancelamento).toBe('exclusao_conta')

    const afetada = await buscarReserva(reservaAfetada.id)
    expect(afetada.status).toBe('CANCELADA')
    expect(afetada.natureza_cancelamento).toBe('exclusao_conta')

    const doExcluido = await buscarReserva(reservaExcluido.id)
    expect(doExcluido.status).toBe('CANCELADA')
    expect(doExcluido.natureza_cancelamento).toBe('exclusao_conta')

    const naoAfetada = await buscarReserva(reservaOutro.id)
    expect(naoAfetada.status).toBe('CONFIRMADA')
    expect(naoAfetada.natureza_cancelamento).toBeNull()

    const preservada = await buscarOferta(ofertaPassada.id)
    expect(preservada.estado).toBe('CONCLUIDA')

    for (const usuario of [excluido, passageiroAfetado, outroMotorista, outroPassageiro]) {
      expect(await penalidades(usuario.id)).toHaveLength(0)
    }

    const eventosOferta = await eventos('oferta', ofertaPropria.id)
    expect(eventosOferta.some((evento) => (
      evento.tipo_evento === 'OFERTA_CANCELADA'
      && evento.natureza === 'CANCELAMENTO_EXCLUSAO_CONTA'
    ))).toBe(true)

    const eventosReservaAfetada = await eventos('reserva', reservaAfetada.id)
    expect(eventosReservaAfetada.some((evento) => (
      evento.tipo_evento === 'RESERVA_CANCELADA'
      && evento.natureza === 'CANCELAMENTO_EXCLUSAO_CONTA'
    ))).toBe(true)

    const eventosReservaExcluido = await eventos('reserva', reservaExcluido.id)
    expect(eventosReservaExcluido.some((evento) => (
      evento.tipo_evento === 'RESERVA_CANCELADA'
      && evento.natureza === 'CANCELAMENTO_EXCLUSAO_CONTA'
    ))).toBe(true)

    const eventosConta = await eventos('usuario', excluido.id)
    expect(eventosConta.some((evento) => evento.tipo_evento === 'CONTA_EXCLUIDA')).toBe(true)

    const anonimizado = await buscarUsuario(excluido.id)
    expect(Number(anonimizado.conta_ativa)).toBe(0)
    expect(anonimizado.matricula).toBe(excluido.matricula)
    expect(anonimizado.nome_completo).not.toBe(excluido.nome_completo)
    expect(anonimizado.nome_completo).not.toContain('Sensivel')
    expect(anonimizado.email_institucional).not.toBe(excluido.email_institucional)
    expect(anonimizado.email_institucional).not.toContain('excluido.sensivel')
    expect(anonimizado.telefone).not.toBe(excluido.telefone)
    expect(anonimizado.senha_hash).not.toBe(excluido.senha_hash)
    expect(!anonimizado.foto_perfil_path || anonimizado.foto_perfil_path !== excluido.foto_perfil_path).toBe(true)

    const eventosAnonimizacao = await contexto.db.all(
      `SELECT * FROM historico_eventos
       WHERE entidade_tipo = 'usuario' AND entidade_id = ?`,
      [excluido.id],
    )
    expect(eventosAnonimizacao.length).toBeGreaterThan(0)
  })

  it('[RF-024/CA-009] bloqueia novas ofertas e reservas da conta excluída', async () => {
    const excluido = await criarUsuario(0)
    const outroMotorista = await criarUsuario(1)

    const veiculoExcluido = await criarVeiculo(excluido)
    const veiculoAlheio = await criarVeiculo(outroMotorista, { placa: 'XYZ9A87' })
    const ofertaAlheia = await criarOferta(outroMotorista, veiculoAlheio, {
      data_hora_saida: saidaEm(26),
      vagas_total: 2,
    })

    await excluirConta(excluido)

    const novaOferta = await contexto.request
      .post('/api/ofertas')
      .set('Authorization', auth(excluido))
      .send({
        veiculo_id: veiculoExcluido.id,
        origem: 'Univille',
        destino: 'Centro',
        paradas: [...PERCURSO],
        data_hora_saida: saidaEm(48),
        vagas_total: 2,
        valor: 0,
      })
    expect([401, 403]).toContain(novaOferta.status)
    expect(await contarOfertas(excluido.id)).toBe(0)

    const novaReserva = await contexto.request
      .post(`/api/ofertas/${ofertaAlheia.id}/reservas`)
      .set('Authorization', auth(excluido))
      .send({})
    expect([401, 403]).toContain(novaReserva.status)
    expect(await contarReservas(ofertaAlheia.id, excluido.id)).toBe(0)
  })
})
