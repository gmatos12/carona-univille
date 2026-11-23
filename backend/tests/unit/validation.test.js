import { describe, expect, it } from 'vitest'
import validate, {
  arrayOf,
  boolean,
  date,
  integer,
  number,
  objectOf,
  oneOf,
  string,
  validate as validateMiddleware,
  validateBody,
  validateParams,
  validateQuery,
  validateRequest,
} from '../../src/middlewares/validate.js'
import { ApiError, SemanticValidationError, STATUS, ValidationError } from '../../src/middlewares/errorHandler.js'

function executar(middleware, req = {}, res = {}) {
  let chamadas = 0
  let erroRecebido

  return new Promise((resolve) => {
    middleware(req, res, (erro) => {
      chamadas += 1
      erroRecebido = erro
      resolve()
    })
  }).then(() => ({ req, erro: erroRecebido, chamadas }))
}

async function erroDe(middleware, req) {
  const resultado = await executar(middleware, req)

  expect(resultado.chamadas).toBe(1)
  expect(resultado.erro).toBeInstanceOf(Error)
  return resultado.erro
}

function esperarErro(erro, status, mensagem, field, detalhe = mensagem) {
  expect(erro.status).toBe(status)
  expect(erro.statusCode).toBe(status)
  expect(erro.message).toBe(mensagem)
  expect(erro.details).toEqual([{ field, message: detalhe }])
}

describe('Fábricas de regras e normalização de schema (RNF-002, RNF-005)', () => {
  it('[RNF-005] cria regras com o tipo e as opções informadas', () => {
    expect(string({ trim: false })).toEqual({ type: 'string', trim: false })
    expect(number({ min: 1 })).toEqual({ type: 'number', min: 1 })
    expect(integer()).toEqual({ type: 'integer' })
    expect(boolean()).toEqual({ type: 'boolean' })
    expect(date()).toEqual({ type: 'date' })
    expect(oneOf(['a', 'b'], { required: true })).toEqual({
      type: 'enum',
      required: true,
      values: ['a', 'b'],
    })
    expect(arrayOf(string())).toEqual({ type: 'array', items: { type: 'string' } })
    expect(objectOf({ nome: string() })).toEqual({
      type: 'object',
      fields: { nome: { type: 'string' } },
    })
  })

  it('[RNF-005] expõe as fábricas e os middlewares na exportação padrão', () => {
    expect(Object.keys(validate)).toEqual([
      'string',
      'number',
      'integer',
      'boolean',
      'date',
      'oneOf',
      'arrayOf',
      'objectOf',
      'validate',
      'validateBody',
      'validateQuery',
      'validateParams',
      'validateRequest',
    ])
    expect(validate.validate).toBe(validateMiddleware)
  })

  it('[RNF-002] aceita definições em forma de texto, lista e objeto inferido', async () => {
    const resultado = await executar(validateBody({
      texto: 'string',
      opcao: ['a', 'b'],
      lista: { items: 'integer' },
      objeto: { fields: { ativo: 'boolean' } },
      vazio: {},
    }), { body: {
      texto: 'ok',
      opcao: 'b',
      lista: [1],
      objeto: { ativo: false },
      vazio: 'texto',
    } })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({
      texto: 'ok',
      opcao: 'b',
      lista: [1],
      objeto: { ativo: false },
      vazio: 'texto',
    })
  })

  it('[RNF-002] infere enum a partir de values em definição de objeto', async () => {
    const resultado = await executar(validateBody({ opcao: { values: ['a', 'b'] } }), {
      body: { opcao: 'b' },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body.opcao).toBe('b')
  })

  it('[RNF-002] preserva listas e objetos quando itens ou campos não são informados', async () => {
    const resultado = await executar(validateBody({
      lista: { type: 'array' },
      objeto: objectOf(),
      simbolo: { type: 'symbol' },
    }), {
      body: { lista: [1, 'x'], objeto: { qualquer: 1 }, simbolo: Symbol('x') },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body.lista).toEqual([1, 'x'])
    expect(resultado.req.body.objeto).toEqual({ qualquer: 1 })
    expect(typeof resultado.req.body.simbolo).toBe('symbol')
  })

  it('[RNF-002] rejeita definição com tipo desconhecido', async () => {
    const erro = await erroDe(validateBody({ campo: () => true }), { body: { campo: 'valor' } })

    esperarErro(erro, STATUS.BAD_REQUEST, 'Dados inválidos', 'campo', 'Deve ser function')
  })
})

describe('Validação de tipos e restrições (RNF-001, RNF-002)', () => {
  it('[RNF-002] valida texto, aplica trim e remove campos não permitidos', async () => {
    const resultado = await executar(validateBody({ nome: string() }), {
      body: { nome: '  Ana  ', senha: 'segredo' },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({ nome: 'Ana' })
  })

  it('[RNF-002] preserva espaços quando trim é desativado', async () => {
    const resultado = await executar(validateBody({ nome: string({ trim: false }) }), {
      body: { nome: '  Ana  ' },
    })

    expect(resultado.req.body.nome).toBe('  Ana  ')
  })

  it('[RNF-001] rejeita texto com tipo incorreto e campos vazios', async () => {
    const erroTipo = await erroDe(validateBody({ nome: string() }), { body: { nome: 42 } })
    esperarErro(erroTipo, STATUS.BAD_REQUEST, 'Dados inválidos', 'nome', 'Deve ser texto')

    const erroVazio = await erroDe(validateBody({ nome: string({ nonEmpty: true }) }), {
      body: { nome: '   ' },
    })
    esperarErro(erroVazio, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'nome', 'Não pode ficar vazio')
  })

  it('[RNF-001] aplica minLength e maxLength com mensagens específicas', async () => {
    const erroMinimo = await erroDe(validateBody({ nome: string({ minLength: 3 }) }), {
      body: { nome: 'ab' },
    })
    esperarErro(erroMinimo, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'nome', 'Tamanho mínimo: 3')

    const erroMaximo = await erroDe(validateBody({ nome: string({ maxLength: 3 }) }), {
      body: { nome: 'abcd' },
    })
    esperarErro(erroMaximo, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'nome', 'Tamanho máximo: 3')

    const resultado = await executar(validateBody({
      nome: string({ minLength: 2, maxLength: 4 }),
    }), { body: { nome: 'Ana' } })
    expect(resultado.erro).toBeUndefined()
  })

  it('[RNF-002] valida pattern em RegExp, string e regex com estado global', async () => {
    const regexGlobal = /^A\d$/g

    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      const resultado = await executar(validateBody({ codigo: string({ pattern: regexGlobal }) }), {
        body: { codigo: 'A1' },
      })
      expect(resultado.erro).toBeUndefined()
      expect(resultado.req.body.codigo).toBe('A1')
    }
    expect(regexGlobal.lastIndex).toBe(0)

    const porString = await executar(validateBody({ codigo: string({ pattern: '^A\\d$' }) }), {
      body: { codigo: 'A2' },
    })
    expect(porString.erro).toBeUndefined()

    const invalido = await erroDe(validateBody({ codigo: string({ pattern: /^A\d$/ }) }), {
      body: { codigo: 'B1' },
    })
    esperarErro(invalido, STATUS.BAD_REQUEST, 'Dados inválidos', 'codigo', 'Formato inválido')
  })

  it('[RNF-001] valida formato de e-mail', async () => {
    const valido = await executar(validateBody({ email: string({ format: 'email' }) }), {
      body: { email: 'aluno@univille.br' },
    })
    expect(valido.erro).toBeUndefined()

    const invalido = await erroDe(validateBody({ email: string({ format: 'email' }) }), {
      body: { email: 'aluno@@univille' },
    })
    esperarErro(invalido, STATUS.BAD_REQUEST, 'Dados inválidos', 'email', 'E-mail inválido')
  })

  it('[RNF-002] valida número finito e limites min/max', async () => {
    const valido = await executar(validateBody({ valor: number({ min: 1, max: 10 }) }), {
      body: { valor: 7.5 },
    })
    expect(valido.req.body.valor).toBe(7.5)

    const infinito = await erroDe(validateBody({ valor: number() }), { body: { valor: Number.POSITIVE_INFINITY } })
    esperarErro(infinito, STATUS.BAD_REQUEST, 'Dados inválidos', 'valor', 'Deve ser número')

    const texto = await erroDe(validateBody({ valor: number() }), { body: { valor: '7' } })
    esperarErro(texto, STATUS.BAD_REQUEST, 'Dados inválidos', 'valor', 'Deve ser número')

    const abaixo = await erroDe(validateBody({ valor: number({ min: 2 }) }), { body: { valor: 1 } })
    esperarErro(abaixo, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'valor', 'Valor mínimo: 2')

    const acima = await erroDe(validateBody({ valor: number({ max: 5 }) }), { body: { valor: 6 } })
    esperarErro(acima, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'valor', 'Valor máximo: 5')
  })

  it('[RNF-002] valida inteiro, booleano e data', async () => {
    const inteiroValido = await executar(validateBody({
      idade: integer({ min: 0, max: 120 }),
      ativo: boolean(),
      data: date(),
    }), { body: { idade: 20, ativo: true, data: '2026-11-23T10:00:00.000Z' } })
    expect(inteiroValido.erro).toBeUndefined()

    const inteiroInvalido = await erroDe(validateBody({ idade: integer() }), { body: { idade: 20.5 } })
    esperarErro(inteiroInvalido, STATUS.BAD_REQUEST, 'Dados inválidos', 'idade', 'Deve ser inteiro')

    const limiteInvalido = await erroDe(validateBody({ idade: integer({ max: 10 }) }), { body: { idade: 11 } })
    esperarErro(limiteInvalido, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'idade', 'Valor máximo: 10')

    const booleanoInvalido = await erroDe(validateBody({ ativo: boolean() }), { body: { ativo: 'true' } })
    esperarErro(booleanoInvalido, STATUS.BAD_REQUEST, 'Dados inválidos', 'ativo', 'Deve ser booleano')
  })

  it('[RNF-001] valida data inválida com mensagem consistente', async () => {
    for (const valor of ['ontem', 1763911200000, new Date()]) {
      const erro = await erroDe(validateBody({ data: date() }), { body: { data: valor } })
      esperarErro(erro, STATUS.BAD_REQUEST, 'Dados inválidos', 'data', 'Data inválida')
    }
  })

  it('[RNF-002] valida enum e rejeita valores fora da lista', async () => {
    const valido = await executar(validateBody({ estado: oneOf(['ABERTA', 'FECHADA']) }), {
      body: { estado: 'ABERTA' },
    })
    expect(valido.erro).toBeUndefined()

    const invalido = await erroDe(validateBody({ estado: oneOf(['ABERTA']) }), {
      body: { estado: 'CANCELADA' },
    })
    esperarErro(invalido, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'estado', 'Valor não permitido')

    const semLista = await erroDe(validateBody({ estado: { type: 'enum' } }), {
      body: { estado: 'ABERTA' },
    })
    esperarErro(semLista, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'estado', 'Valor não permitido')
  })

  it('[RNF-002] valida listas, limites de itens e cada elemento', async () => {
    const valido = await executar(validateBody({ vagas: arrayOf(integer({ min: 1 }), { minItems: 1, maxItems: 2 }) }), {
      body: { vagas: ['2', 3] },
    })
    expect(valido.erro).toBeInstanceOf(ValidationError)

    const semCoercao = await executar(validateBody({ vagas: arrayOf(integer()) }), {
      body: { vagas: [2, 3] },
    })
    expect(semCoercao.erro).toBeUndefined()
    expect(semCoercao.req.body.vagas).toEqual([2, 3])

    const tipo = await erroDe(validateBody({ vagas: arrayOf(integer()) }), { body: { vagas: '1,2' } })
    esperarErro(tipo, STATUS.BAD_REQUEST, 'Dados inválidos', 'vagas', 'Deve ser uma lista')

    const insuficiente = await erroDe(validateBody({ vagas: arrayOf(integer(), { minItems: 2 }) }), {
      body: { vagas: [1] },
    })
    esperarErro(insuficiente, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'vagas', 'Itens mínimos: 2')

    const excesso = await erroDe(validateBody({ vagas: arrayOf(integer(), { maxItems: 1 }) }), {
      body: { vagas: [1, 2] },
    })
    esperarErro(excesso, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'vagas', 'Itens máximos: 1')

    const itemInvalido = await erroDe(validateBody({ vagas: arrayOf(integer()) }), {
      body: { vagas: [1, 'x'] },
    })
    esperarErro(itemInvalido, STATUS.BAD_REQUEST, 'Dados inválidos', 'vagas[1]', 'Deve ser inteiro')
  })

  it('[RNF-002] valida objetos aninhados e aplica allowlist em cada nível', async () => {
    const schema = {
      endereco: objectOf({
        rua: string(),
        numero: integer(),
        detalhes: objectOf({ complemento: string() }),
      }),
    }
    const resultado = await executar(validateBody(schema), {
      body: {
        endereco: {
          rua: ' Rua A ',
          numero: 12,
          detalhes: { complemento: 'Apto 1', secreto: 'x' },
          ignorado: 'y',
        },
        outro: 'z',
      },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({
      endereco: {
        rua: 'Rua A',
        numero: 12,
        detalhes: { complemento: 'Apto 1' },
      },
    })

    const tipo = await erroDe(validateBody({ endereco: objectOf({ rua: string() }) }), {
      body: { endereco: 'Rua A' },
    })
    esperarErro(tipo, STATUS.BAD_REQUEST, 'Dados inválidos', 'endereco', 'Deve ser um objeto')
  })
})

describe('Obrigatoriedade, nulidade e coerção (RNF-002)', () => {
  it('[RNF-001] exige campos obrigatórios e opcionais explicitados', async () => {
    for (const regra of [string({ required: true }), string({ optional: false })]) {
      const erro = await erroDe(validateBody({ nome: regra }), { body: {} })
      esperarErro(erro, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'nome', 'Campo obrigatório')
    }

    const ausente = await executar(validateBody({ nome: string() }), { body: {} })
    expect(ausente.erro).toBeUndefined()
    expect(ausente.req.body).toEqual({})
  })

  it('[RNF-002] aplica nullable antes das demais regras', async () => {
    const valido = await executar(validateBody({
      observacao: string({ nullable: true, minLength: 5 }),
    }), { body: { observacao: null } })
    expect(valido.req.body.observacao).toBeNull()

    const invalido = await erroDe(validateBody({ observacao: string() }), {
      body: { observacao: null },
    })
    esperarErro(invalido, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'observacao', 'Campo não pode ser nulo')
  })

  it('[RNF-002] converte valores textualmente quando coerce é habilitado', async () => {
    const resultado = await executar(validateBody({
      idade: integer(),
      preco: number(),
      ativo: boolean(),
      nome: string({ coerce: true }),
    }, { coerce: true }), {
      body: { idade: ' 42 ', preco: ' 7.5 ', ativo: ' TRUE ', nome: 'Ana' },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({ idade: 42, preco: 7.5, ativo: true, nome: 'Ana' })
  })

  it('[RNF-002] aceita variações de booleano e mantém valores não convertidos', async () => {
    const resultado = await executar(validateQuery({
      a: boolean(),
      b: boolean(),
      c: boolean(),
      d: number(),
    }, { coerce: true }), {
      query: { a: '1', b: 'false', c: '0', d: 9 },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.query).toEqual({ a: true, b: false, c: false, d: 9 })

    const invalido = await erroDe(validateBody({ a: boolean() }, { coerce: true }), {
      body: { a: 'talvez' },
    })
    esperarErro(invalido, STATUS.BAD_REQUEST, 'Dados inválidos', 'a', 'Deve ser booleano')
  })

  it('[RNF-002] rejeita número vazio após coerção', async () => {
    const erro = await erroDe(validateBody({ valor: number() }, { coerce: true }), {
      body: { valor: '   ' },
    })
    esperarErro(erro, STATUS.BAD_REQUEST, 'Dados inválidos', 'valor', 'Deve ser número')
  })

  it('[RNF-002] permite que a regra sobrescreva a opção global de coerção', async () => {
    const semCoercao = await erroDe(validateQuery({ idade: number() }, { coerce: false }), {
      query: { idade: '42' },
    })
    esperarErro(semCoercao, STATUS.BAD_REQUEST, 'Dados inválidos', 'idade', 'Deve ser número')

    const comCoercao = await executar(validateBody({ idade: number({ coerce: true }) }), {
      body: { idade: '42' },
    })
    expect(comCoercao.req.body.idade).toBe(42)
  })
})

describe('Validação customizada, transformação e status de erro (RNF-001, RNF-005)', () => {
  it('[RNF-001] converte retorno false ou texto da validação customizada em erro 422', async () => {
    const erroFalso = await erroDe(validateBody({
      campo: string({ validate: () => false }),
    }), { body: { campo: 'x' } })
    esperarErro(erroFalso, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'campo', 'Valor inválido')

    const erroTexto = await erroDe(validateBody({
      campo: string({ validate: () => 'Use outro valor' }),
    }), { body: { campo: 'x' } })
    esperarErro(erroTexto, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'campo', 'Use outro valor')
  })

  it('[RNF-005] repassa erros e resultados estruturados da validação customizada', async () => {
    const erroSimples = new Error('falha externa')
    const repassado = await erroDe(validateBody({
      campo: string({ validate: () => erroSimples }),
    }), { body: { campo: 'x' } })
    expect(repassado).toBe(erroSimples)

    const erroApi = new ApiError(409, 'Conflito externo', 'CUSTOM')
    const repassadoApi = await erroDe(validateBody({
      campo: string({ validate: () => erroApi }),
    }), { body: { campo: 'x' } })
    expect(repassadoApi).toBe(erroApi)

    const estruturado = await erroDe(validateBody({
      campo: string({ validate: () => ({ valid: false }) }),
    }), { body: { campo: 'x' } })
    esperarErro(estruturado, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'campo', 'Valor inválido')

    const comMensagem = await erroDe(validateBody({
      campo: string({ validate: () => ({ valid: false, message: 'Regra específica' }) }),
    }), { body: { campo: 'x' } })
    esperarErro(comMensagem, STATUS.UNPROCESSABLE, 'Dados não processáveis', 'campo', 'Regra específica')
  })

  it('[RNF-001] preserva status e mensagem de uma validação customizada estruturada', async () => {
    const erro = await erroDe(validateBody({
      campo: string({ validate: () => ({ valid: false, message: 'Placa já cadastrada', status: STATUS.CONFLICT }) }),
    }), { body: { campo: 'ABC1D23' } })

    expect(erro).toBeInstanceOf(ApiError)
    esperarErro(erro, STATUS.CONFLICT, 'Placa já cadastrada', 'campo', 'Placa já cadastrada')
    expect(erro.code).toBe('API_ERROR')
  })

  it('[RNF-005] aceita validações customizadas válidas e ignora valores ausentes ou nulos', async () => {
    const contexto = []
    const schema = {
      campo: string({
        validate: (valor, ctx) => {
          contexto.push(['validate', valor, ctx.field, ctx.source, ctx.req.usuario])
          return true
        },
        transform: (valor, ctx) => {
          contexto.push(['transform', valor, ctx.field, ctx.source, ctx.req.usuario])
          return valor.toUpperCase()
        },
      }),
      nulo: string({
        nullable: true,
        validate: () => {
          contexto.push(['nulo'])
          return true
        },
      }),
      ausente: string({
        validate: () => {
          contexto.push(['ausente'])
          return true
        },
      }),
      naoFuncao: string({ validate: 'ignorado' }),
    }
    const resultado = await executar(validateBody(schema), {
      body: { campo: 'ana', nulo: null, naoFuncao: 'ok' },
      usuario: 'aluno',
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({ campo: 'ANA', nulo: null, naoFuncao: 'ok' })
    expect(contexto).toEqual([
      ['validate', 'ana', 'campo', 'body', 'aluno'],
      ['transform', 'ana', 'campo', 'body', 'aluno'],
    ])
  })

  it('[RNF-002] aplica transform também a itens de lista', async () => {
    const resultado = await executar(validateBody({
      nomes: arrayOf(string({ transform: (valor) => valor.toUpperCase() })),
    }), { body: { nomes: ['ana', 'bruno'] } })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body.nomes).toEqual(['ANA', 'BRUNO'])
  })
})

describe('Sanitização, paths aninhados e fontes da requisição (RNF-002, RNF-005)', () => {
  it('[RNF-002] sanitiza params, query e body com allowlist própria', async () => {
    const resultado = await executar(validateRequest({
      params: { id: integer() },
      query: { pagina: integer(), ordem: string() },
      body: { nome: string() },
    }), {
      params: { id: '12', extra: 1 },
      query: { pagina: '2', extra: 2 },
      body: { nome: ' Ana ', extra: 3 },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.params).toEqual({ id: 12 })
    expect(resultado.req.query).toEqual({ pagina: 2 })
    expect(resultado.req.body).toEqual({ nome: 'Ana' })
  })

  it('[RNF-002] usa colonas vazias quando a fonte não existe', async () => {
    const resultado = await executar(validateRequest({
      body: { nome: string() },
      query: { nome: string() },
    }), {})

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({})
    expect(resultado.req.query).toEqual({})
  })

  it('[RNF-005] aplica opções globais e permite fontes personalizadas', async () => {
    const semCoercao = await erroDe(validateRequest({
      body: { idade: number() },
      options: { coerce: false },
    }), { body: { idade: '42' } })
    esperarErro(semCoercao, STATUS.BAD_REQUEST, 'Dados inválidos', 'idade', 'Deve ser número')

    const personalizada = await executar(validateMiddleware({ nome: string() }, { source: 'headers' }), {
      headers: { nome: ' Ana ', secreto: 'x' },
    })
    expect(personalizada.erro).toBeUndefined()
    expect(personalizada.req.headers).toEqual({ nome: 'Ana' })
  })

  it('[RNF-005] usa body como fonte padrão em validate', async () => {
    const resultado = await executar(validateMiddleware({ nome: string() }), {
      body: { nome: ' Ana ' },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({ nome: 'Ana' })
  })

  it('[RNF-005] mantém os apelidos de validação por fonte', async () => {
    const body = await executar(validateBody({ nome: string() }), { body: { nome: 'Ana' } })
    const query = await executar(validateQuery({ idade: number() }), { query: { idade: '42' } })
    const params = await executar(validateParams({ id: integer() }), { params: { id: '7' } })

    expect(body.req.body).toEqual({ nome: 'Ana' })
    expect(query.req.query.idade).toBe(42)
    expect(params.req.params.id).toBe(7)
  })

  it('[RNF-002] cria e substitui paths aninhados durante a sanitização', async () => {
    const resultado = await executar(validateBody({
      'endereco.rua': string(),
      'endereco.numero': integer(),
      enderecoCompleto: objectOf({ 'detalhe.rua': string() }),
    }), {
      body: {
        endereco: { rua: ' Rua B ', numero: 9, oculto: true },
        enderecoCompleto: { detalhe: { rua: ' Rua C ', oculto: true } },
        ignorado: 'texto',
      },
    })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({
      endereco: { rua: 'Rua B', numero: 9 },
      enderecoCompleto: { detalhe: { rua: 'Rua C' } },
    })
  })

  it('[RNF-002] não lê propriedades herdadas do protótipo', async () => {
    const resultado = await executar(validateBody({
      toString: string(),
      'constructor.name': string(),
    }), { body: {} })

    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.body).toEqual({})
  })

  it('[RNF-002] não permite poluição de protótipo ao gravar paths aninhados', async () => {
    const corpo = JSON.parse('{"__proto__":{"poluido":"sim"},"constructor":{"prototype":{"poluido":"sim"}}}')
    const resultado = await executar(validateBody({
      '__proto__.poluido': string(),
      'constructor.prototype.poluido': string(),
    }), { body: corpo })

    expect(resultado.erro).toBeUndefined()
    expect({}.poluido).toBeUndefined()
    expect(Object.prototype.poluido).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(resultado.req.body, '__proto__')).toBe(true)
  })

  it('[RNF-002] rejeita corpo que não é objeto', async () => {
    const erro = await erroDe(validateBody({ nome: string() }), { body: 'texto' })

    esperarErro(erro, STATUS.BAD_REQUEST, 'Dados inválidos', 'body', 'Objeto inválido')
  })

  it('[RNF-005] encaminha schema inválido como erro para o next', async () => {
    const erro = await erroDe(validateRequest({ body: [] }), { body: {} })

    expect(erro).toBeInstanceOf(TypeError)
    expect(erro.message).toBe('Schema de validação deve ser um objeto')
  })

  it('[RNF-002] substitui fontes somente leitura quando possível', async () => {
    const req = {}
    Object.defineProperty(req, 'query', { get: () => ({ nome: ' Ana ', extra: 1 }), configurable: true })

    const resultado = await executar(validateQuery({ nome: string() }), req)
    expect(resultado.erro).toBeUndefined()
    expect(resultado.req.query).toEqual({ nome: 'Ana' })
  })

  it('[RNF-005] encaminha falha ao substituir fonte não configurável', async () => {
    const req = {}
    Object.defineProperty(req, 'body', { get: () => ({}), configurable: false })

    const erro = await erroDe(validateBody({ nome: string() }), req)
    expect(erro).toBeInstanceOf(TypeError)
  })
})

describe('Encaminhamento de erros dos middlewares (RNF-001, RNF-005)', () => {
  it('[RNF-001] usa ValidationError para erros de tipo e SemanticValidationError para regras', async () => {
    const tipo = await erroDe(validateBody({ nome: string() }), { body: { nome: 1 } })
    expect(tipo).toBeInstanceOf(ValidationError)
    expect(tipo).not.toBeInstanceOf(SemanticValidationError)
    expect(tipo.code).toBe('VALIDATION_ERROR')

    const regra = await erroDe(validateBody({ nome: string({ required: true }) }), { body: {} })
    expect(regra).toBeInstanceOf(SemanticValidationError)
    expect(regra).toBeInstanceOf(ValidationError)
    expect(regra.code).toBe('UNPROCESSABLE_ENTITY')
  })

  it('[RNF-005] validateRequest encaminha o erro sem chamar o fluxo normal', async () => {
    const middleware = validateRequest({ body: { nome: string({ required: true }) } })
    const resultado = await executar(middleware, { body: {} })

    expect(resultado.chamadas).toBe(1)
    expect(resultado.erro).toBeInstanceOf(SemanticValidationError)
  })
})
