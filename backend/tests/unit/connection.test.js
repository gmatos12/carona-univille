import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  closeConnection,
  createConnection,
  createTestConnection,
  getConnection,
  withImmediateTransaction,
} from '../../src/db/connection.js'

const conexoes = []

async function criarConexao(options = {}) {
  const conexao = await createConnection({ filePath: ':memory:', ...options })
  conexoes.push(conexao)
  return conexao
}

async function criarTabela(conexao) {
  await conexao.exec('CREATE TABLE itens (id INTEGER PRIMARY KEY AUTOINCREMENT, valor TEXT NOT NULL)')
}

afterEach(async () => {
  while (conexoes.length) await conexoes.pop().close()
})

afterAll(async () => {
  await closeConnection()
})

describe('Conexão SQLite e transações (RNF-003, RNF-004)', () => {
  it('[RNF-003] cria conexão em memória e interpreta opção de teste', async () => {
    const conexao = await criarConexao({ test: 'yes' })
    const outra = await criarConexao({ test: '0' })

    expect(conexao.filePath).toBe(':memory:')
    expect(conexao.isTest).toBe(true)
    expect(outra.isTest).toBe(false)
    expect(conexao.db).toBeTruthy()
  })

  it('[RNF-003] executa run, get, all e exec com parâmetros', async () => {
    const conexao = await criarConexao()
    await criarTabela(conexao)

    const resultado = await conexao.run('INSERT INTO itens (valor) VALUES (?)', ['A'])

    expect(resultado.lastID).toBe(1)
    expect(resultado.changes).toBe(1)
    expect(await conexao.get('SELECT * FROM itens WHERE id = ?', [1])).toEqual({ id: 1, valor: 'A' })
    await conexao.run('INSERT INTO itens (valor) VALUES (?)', ['B'])
    expect(await conexao.all('SELECT valor FROM itens ORDER BY id')).toEqual([
      { valor: 'A' },
      { valor: 'B' },
    ])
    await expect(conexao.run('INSERT INTO tabela_inexistente VALUES (?)', ['x'])).rejects.toThrow()
    await expect(conexao.get('SELECT * FROM tabela_inexistente')).rejects.toThrow()
    await expect(conexao.all('SELECT * FROM tabela_inexistente')).rejects.toThrow()
  })

  it('[RNF-003] confirma transação e desfaz alterações em caso de erro', async () => {
    const conexao = await criarConexao()
    await criarTabela(conexao)

    const resultado = await conexao.transaction(async (transacao) => {
      await transacao.run('INSERT INTO itens (valor) VALUES (?)', ['confirmado'])
      return 'ok'
    })

    expect(resultado).toBe('ok')
    expect(await conexao.all('SELECT valor FROM itens')).toEqual([{ valor: 'confirmado' }])

    const erro = new Error('falha na transação')
    await expect(conexao.transaction(async (transacao) => {
      await transacao.run('INSERT INTO itens (valor) VALUES (?)', ['revertido'])
      throw erro
    })).rejects.toBe(erro)

    expect(await conexao.all('SELECT valor FROM itens')).toEqual([{ valor: 'confirmado' }])
    await expect(conexao.transaction('nao-e-funcao')).rejects.toThrow(TypeError)
  })

  it('[RNF-003] serializa transações concorrentes', async () => {
    const conexao = await criarConexao()
    const ordem = []

    await Promise.all([
      conexao.transaction(async () => {
        ordem.push('inicio-1')
        await new Promise((resolve) => setTimeout(resolve, 10))
        ordem.push('fim-1')
      }),
      conexao.transaction(async () => {
        ordem.push('inicio-2')
        ordem.push('fim-2')
      }),
    ])

    expect(ordem).toEqual(['inicio-1', 'fim-1', 'inicio-2', 'fim-2'])
  })

  it('[RNF-003] bloqueia operações após o fechamento', async () => {
    const conexao = await criarConexao()
    await conexao.close()

    await expect(conexao.run('SELECT 1')).rejects.toThrow('Database connection is closed')
    await expect(conexao.get('SELECT 1')).rejects.toThrow('Database connection is closed')
    await expect(conexao.all('SELECT 1')).rejects.toThrow('Database connection is closed')
    await expect(conexao.exec('SELECT 1')).rejects.toThrow('Database connection is closed')
    await expect(conexao.transaction(() => undefined)).rejects.toThrow('Database connection is closed')
    await expect(conexao.transaction(null)).rejects.toThrow(TypeError)
    await expect(conexao.close()).resolves.toBeUndefined()
  })

  it('[RNF-003] createTestConnection cria arquivo temporário e remove no cleanup', async () => {
    const conexao = await createTestConnection({ fileName: 'unit.db' })
    const diretorio = path.dirname(conexao.filePath)

    expect(conexao.isTest).toBe(true)
    expect(conexao.filePath).toMatch(/carona-test-/)
    expect(path.basename(conexao.filePath)).toBe('unit.db')
    await criarTabela(conexao)
    expect(await conexao.all("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual(
      expect.arrayContaining([{ name: 'itens' }]),
    )

    const cleanup = conexao.cleanup
    expect(cleanup()).toBe(cleanup())
    await cleanup()
    await expect(fs.stat(diretorio)).rejects.toThrow()
  })

  it('[RNF-003] getConnection compartilha instância e withImmediateTransaction a reutiliza', async () => {
    const compartilhada = await getConnection({ test: true })
    expect(await getConnection()).toBe(compartilhada)

    const conexao = await criarConexao()
    await criarTabela(conexao)
    expect(await withImmediateTransaction(conexao, async (transacao) => {
      await transacao.run('INSERT INTO itens (valor) VALUES (?)', ['transacao'])
      return 7
    })).toBe(7)
    expect(await conexao.get('SELECT valor FROM itens')).toEqual({ valor: 'transacao' })

    await expect(withImmediateTransaction({}, () => undefined)).rejects.toThrow('Invalid database connection')
    await expect(withImmediateTransaction(null, () => undefined)).rejects.toThrow(TypeError)

    await closeConnection()
    const nova = await getConnection({ test: true })
    expect(nova).not.toBe(compartilhada)
    await closeConnection()
    await expect(closeConnection()).resolves.toBeUndefined()
  })
})
