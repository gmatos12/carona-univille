import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { applyMigration, runMigrations } from '../../src/db/migrations/run.js'
import { MATRICULAS_AUTORIZADAS } from '../../src/db/seeds/matriculasAutorizadas.js'
import { runSeed } from '../../src/db/seeds/run.js'
import { OfertaRepository } from '../../src/repositories/ofertaRepository.js'
import { ReservaRepository } from '../../src/repositories/reservaRepository.js'
import { createTestDatabase } from './helpers/testDb.js'

const MIGRACAO_INICIAL = '001_init.sql'
const MIGRACAO_CORRETIVA = '002_correcoes_t040_t050.sql'
const TRIGGERS_CAPACIDADE = Object.freeze([
  'trg_ofertas_vagas_minimas_reservadas',
  'trg_reservas_capacidade_insert',
  'trg_reservas_capacidade_update',
])

let contexto
let db
let sqlTriggersAntes
let resultadoAplicacao
let resultadoRepeticao

const reservaRepository = new ReservaRepository()
const ofertaRepository = new OfertaRepository()

beforeAll(async () => {
  contexto = await createTestDatabase({ migrate: false, seed: false })
  db = contexto.connection

  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)
  await applyMigration(db, MIGRACAO_INICIAL)

  const linhas = await db.all(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'trigger' AND name IN (${TRIGGERS_CAPACIDADE.map(() => '?').join(', ')})`,
    [...TRIGGERS_CAPACIDADE],
  )
  sqlTriggersAntes = Object.fromEntries(linhas.map((linha) => [linha.name, linha.sql]))

  resultadoAplicacao = await runMigrations({ connection: db })
  resultadoRepeticao = await runMigrations({ connection: db })
  await runSeed({ connection: db })
}, 30000)

afterEach(async () => {
  await contexto.reset()
})

afterAll(async () => {
  await contexto.close()
}, 30000)

async function criarUsuario(indice) {
  const matricula = MATRICULAS_AUTORIZADAS[indice]
  const resultado = await db.run(
    `INSERT INTO usuarios (nome_completo, matricula, email_institucional, senha_hash, telefone)
     VALUES (?, ?, ?, ?, ?)`,
    [
      `Usuario ${indice}`,
      matricula,
      `usuario${indice}@univille.br`,
      '$2b$10$hashmockadoapenasparafixture',
      `(47) 99999-${String(indice).padStart(4, '0')}`,
    ],
  )
  return db.get('SELECT * FROM usuarios WHERE id = ?', [resultado.lastID])
}

async function criarVeiculo(usuario) {
  const resultado = await db.run(
    `INSERT INTO veiculos (usuario_id, marca, modelo, cor, placa, ano, capacidade_passageiros)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [usuario.id, 'Fiat', 'Uno', 'Branco', `ABC${String(usuario.id).padStart(4, '0')}`, 2020, 2],
  )
  return db.get('SELECT * FROM veiculos WHERE id = ?', [resultado.lastID])
}

async function criarOferta(motorista, veiculo, vagasTotal = 2) {
  const resultado = await db.run(
    `INSERT INTO ofertas (motorista_id, veiculo_id, origem, destino, paradas, data_hora_saida,
      vagas_total, valor, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      motorista.id,
      veiculo.id,
      'Univille',
      'Centro',
      JSON.stringify(['Univille', 'Centro']),
      '2027-03-15T08:00:00.000Z',
      vagasTotal,
      0,
      'ABERTA',
    ],
  )
  return db.get('SELECT * FROM ofertas WHERE id = ?', [resultado.lastID])
}

async function criarReserva(oferta, passageiro) {
  const resultado = await db.run(
    'INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)',
    [oferta.id, passageiro.id, 'CONFIRMADA'],
  )
  return db.get('SELECT * FROM reservas WHERE id = ?', [resultado.lastID])
}

describe('Migration corretiva e integridade de reservas no SQLite', () => {
  it('aplica a nova migration em banco que já executou 001_init.sql', async () => {
    expect(resultadoAplicacao.applied).toEqual([MIGRACAO_CORRETIVA])
    expect(resultadoAplicacao.skipped).toContain(MIGRACAO_INICIAL)
    expect(sqlTriggersAntes.trg_reservas_capacidade_insert).toContain("status = 'CONFIRMADA'")
    expect(sqlTriggersAntes.trg_ofertas_vagas_minimas_reservadas).toContain("status = 'CONFIRMADA'")

    const depois = await db.all(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'trigger' AND name IN (${TRIGGERS_CAPACIDADE.map(() => '?').join(', ')})`,
      [...TRIGGERS_CAPACIDADE],
    )
    const sqlDepois = Object.fromEntries(depois.map((linha) => [linha.name, linha.sql]))

    for (const nome of TRIGGERS_CAPACIDADE) {
      expect(sqlDepois[nome]).toContain("status IN ('CONFIRMADA', 'NO_SHOW')")
    }
  })

  it('aplica a nova migration uma única vez', async () => {
    expect(resultadoRepeticao.applied).toEqual([])
    expect(resultadoRepeticao.skipped).toEqual([MIGRACAO_INICIAL, MIGRACAO_CORRETIVA])

    const registro = await db.get(
      'SELECT COUNT(*) AS total FROM schema_migrations WHERE name = ?',
      [MIGRACAO_CORRETIVA],
    )
    expect(registro.total).toBe(1)

    for (const nome of TRIGGERS_CAPACIDADE) {
      const trigger = await db.get('SELECT COUNT(*) AS total FROM sqlite_master WHERE type = ? AND name = ?', ['trigger', nome])
      expect(trigger.total).toBe(1)
    }
  })

  it('considera NO_SHOW como ocupante de vaga depois da migration corretiva', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, 1)
    const reserva = await criarReserva(oferta, passageiro)

    await db.run(
      'UPDATE reservas SET status = ?, natureza_cancelamento = NULL WHERE id = ?',
      ['NO_SHOW', reserva.id],
    )

    expect(await reservaRepository.contarOcupantes(oferta.id)).toBe(1)
    expect(await reservaRepository.vagasDisponiveis(oferta.id)).toBe(0)

    const salva = await ofertaRepository.buscarPorId(oferta.id)
    expect(salva.reservas_confirmadas).toBe(1)
    expect(salva.vagas_disponiveis).toBe(0)
    await expect(
      db.run('UPDATE ofertas SET vagas_total = 0 WHERE id = ?', [oferta.id]),
    ).rejects.toThrow(/reservas/i)
  })

  it('bloqueia transições inválidas por SQL direto', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const outro = await criarUsuario(2)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, 2)
    const cancelada = await criarReserva(oferta, passageiro)
    const noShow = await criarReserva(oferta, outro)

    await db.run('UPDATE reservas SET status = ? WHERE id = ?', ['CANCELADA', cancelada.id])
    await db.run('UPDATE reservas SET status = ? WHERE id = ?', ['NO_SHOW', noShow.id])

    await expect(
      db.run('UPDATE reservas SET status = ? WHERE id = ?', ['CONFIRMADA', cancelada.id]),
    ).rejects.toThrow(/transicao de status de reserva invalida/i)
    await expect(
      db.run('UPDATE reservas SET status = ? WHERE id = ?', ['NO_SHOW', cancelada.id]),
    ).rejects.toThrow(/transicao de status de reserva invalida/i)
    await expect(
      db.run('UPDATE reservas SET status = ? WHERE id = ?', ['CANCELADA', cancelada.id]),
    ).rejects.toThrow(/transicao de status de reserva invalida/i)
    await expect(
      db.run('UPDATE reservas SET status = ? WHERE id = ?', ['CONFIRMADA', noShow.id]),
    ).rejects.toThrow(/transicao de status de reserva invalida/i)
    await expect(
      db.run('UPDATE reservas SET status = ? WHERE id = ?', ['CANCELADA', noShow.id]),
    ).rejects.toThrow(/transicao de status de reserva invalida/i)
    await expect(
      db.run('UPDATE reservas SET status = ? WHERE id = ?', ['NO_SHOW', noShow.id]),
    ).rejects.toThrow(/transicao de status de reserva invalida/i)

    const linhas = await db.all('SELECT id, status FROM reservas ORDER BY id')
    expect(linhas.map((linha) => linha.status)).toEqual(['CANCELADA', 'NO_SHOW'])
  })

  it('bloqueia INSERT direto com status CANCELADA ou NO_SHOW', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, 2)

    for (const status of ['CANCELADA', 'NO_SHOW']) {
      await expect(
        db.run(
          'INSERT INTO reservas (oferta_id, passageiro_id, status) VALUES (?, ?, ?)',
          [oferta.id, passageiro.id, status],
        ),
      ).rejects.toThrow(/CONFIRMADA/i)
    }

    await expect(
      db.run(
        `INSERT INTO reservas (oferta_id, passageiro_id, status, natureza_cancelamento)
         VALUES (?, ?, ?, ?)`,
        [oferta.id, passageiro.id, 'CONFIRMADA', 'passageiro'],
      ),
    ).rejects.toThrow(/natureza_cancelamento/i)
  })

  it('bloqueia natureza_cancelamento incompatível com NO_SHOW por SQL direto', async () => {
    const motorista = await criarUsuario(0)
    const passageiro = await criarUsuario(1)
    const veiculo = await criarVeiculo(motorista)
    const oferta = await criarOferta(motorista, veiculo, 1)
    const reserva = await criarReserva(oferta, passageiro)

    await expect(
      db.run(
        `UPDATE reservas SET status = ?, natureza_cancelamento = ? WHERE id = ?`,
        ['NO_SHOW', 'passageiro', reserva.id],
      ),
    ).rejects.toThrow(/natureza_cancelamento/i)

    await db.run(
      'UPDATE reservas SET status = ?, natureza_cancelamento = NULL WHERE id = ?',
      ['NO_SHOW', reserva.id],
    )
    const salva = await db.get('SELECT * FROM reservas WHERE id = ?', [reserva.id])
    expect(salva.status).toBe('NO_SHOW')
    expect(salva.natureza_cancelamento).toBeNull()
  })
})
