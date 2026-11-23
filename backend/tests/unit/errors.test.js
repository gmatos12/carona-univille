import { describe, expect, it } from 'vitest'
import errorHandler, {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  STATUS,
  SemanticValidationError,
  UnauthorizedError,
  UnprocessableError,
  ValidationError,
  asyncHandler,
  errorHandler as middlewareDeErro,
  normalizeError,
  notFoundHandler,
} from '../../src/middlewares/errorHandler.js'

function resposta() {
  return {
    codigo: null,
    corpo: null,
    status(codigo) {
      this.codigo = codigo
      return this
    },
    json(corpo) {
      this.corpo = corpo
      return this
    },
  }
}

function executarMiddlewearDeErro(erro, res = resposta()) {
  const encaminhados = []
  const req = {}
  middlewareDeErro(erro, req, res, (valor) => encaminhados.push(valor))
  return { res, encaminhados }
}

describe('STATUS e classes de erro (RNF-001, RNF-005)', () => {
  it('[RNF-005] expõe status imutáveis', () => {
    expect(STATUS).toEqual({
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      UNPROCESSABLE: 422,
      INTERNAL: 500,
    })
    expect(Object.isFrozen(STATUS)).toBe(true)
  })

  it('[RNF-001] constrói ApiError com status, código e detalhes', () => {
    const detalhes = [{ field: 'email', message: 'E-mail inválido' }]
    const erro = new ApiError(418, 'Não foi possível processar', 'CUSTOM', detalhes)

    expect(erro).toBeInstanceOf(Error)
    expect(erro.name).toBe('ApiError')
    expect(erro.status).toBe(418)
    expect(erro.statusCode).toBe(418)
    expect(erro.code).toBe('CUSTOM')
    expect(erro.message).toBe('Não foi possível processar')
    expect(erro.details).toEqual(detalhes)
    expect(new ApiError(500, 'Sem detalhes').details).toBeUndefined()
  })

  it('[RNF-001] define mensagens e códigos padrão das subclasses', () => {
    const casos = [
      [new ValidationError(), 400, 'Dados inválidos', 'VALIDATION_ERROR'],
      [new SemanticValidationError(), 422, 'Dados não processáveis', 'UNPROCESSABLE_ENTITY'],
      [new UnauthorizedError(), 401, 'Autenticação necessária', 'UNAUTHORIZED'],
      [new ForbiddenError(), 403, 'Acesso negado a este recurso', 'FORBIDDEN'],
      [new NotFoundError(), 404, 'Recurso não encontrado', 'NOT_FOUND'],
      [new ConflictError(), 409, 'Conflito com o estado atual do recurso', 'CONFLICT'],
      [new UnprocessableError(), 422, 'Regra de negócio não atendida', 'UNPROCESSABLE_ENTITY'],
    ]

    for (const [erro, status, mensagem, codigo] of casos) {
      expect(erro).toBeInstanceOf(ApiError)
      expect(erro.status).toBe(status)
      expect(erro.statusCode).toBe(status)
      expect(erro.message).toBe(mensagem)
      expect(erro.code).toBe(codigo)
      expect(erro.name).toBe(erro.constructor.name)
    }
  })

  it('[RNF-001] aceita mensagens e detalhes personalizados', () => {
    expect(new ValidationError('Revise os dados', [{ field: 'nome' }])).toMatchObject({
      status: 400,
      message: 'Revise os dados',
      details: [{ field: 'nome' }],
    })
    expect(new SemanticValidationError('Regra específica', 'detalhe').details).toBe('detalhe')
    expect(new UnauthorizedError('Entre novamente').message).toBe('Entre novamente')
    expect(new ForbiddenError('Somente o dono').message).toBe('Somente o dono')
    expect(new NotFoundError('Viagem inexistente').message).toBe('Viagem inexistente')
    expect(new ConflictError('Placa duplicada').message).toBe('Placa duplicada')
    expect(new UnprocessableError('Horário inválido').message).toBe('Horário inválido')
    expect(SemanticValidationError.prototype).toBeInstanceOf(ValidationError)
  })
})

describe('Normalização de erros (RNF-001, RNF-002, RNF-005)', () => {
  it('[RNF-001] preserva ApiError com e sem detalhes', () => {
    const detalhes = [{ field: 'email', message: 'E-mail inválido' }]

    expect(normalizeError(new ValidationError('Dados inválidos', detalhes))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: detalhes,
    })
    expect(normalizeError(new ForbiddenError())).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Acesso negado a este recurso',
    })
  })

  const casos = [
    {
      nome: 'corpo JSON inválido informado pelo parser',
      erro: () => ({ type: 'entity.parse.failed' }),
      esperado: { status: 400, code: 'INVALID_JSON', message: 'Corpo da requisição inválido' },
    },
    {
      nome: 'SyntaxError com status 400',
      erro: () => Object.assign(new SyntaxError('unexpected token'), { status: 400 }),
      esperado: { status: 400, code: 'INVALID_JSON', message: 'Corpo da requisição inválido' },
    },
    {
      nome: 'token expirado',
      erro: () => Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }),
      esperado: { status: 401, code: 'TOKEN_EXPIRED', message: 'Token expirado' },
    },
    {
      nome: 'token inválido',
      erro: () => Object.assign(new Error('invalid signature'), { name: 'JsonWebTokenError' }),
      esperado: { status: 401, code: 'TOKEN_INVALID', message: 'Token inválido' },
    },
    {
      nome: 'token antes do período de validade',
      erro: () => Object.assign(new Error('not active'), { name: 'NotBeforeError' }),
      esperado: { status: 401, code: 'TOKEN_INVALID', message: 'Token inválido' },
    },
    {
      nome: 'arquivo grande demais',
      erro: () => Object.assign(new Error('upload'), { code: 'LIMIT_FILE_SIZE' }),
      esperado: { status: 422, code: 'UNPROCESSABLE_ENTITY', message: 'Arquivo excede o tamanho permitido' },
    },
    {
      nome: 'banco ocupado',
      erro: () => Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }),
      esperado: { status: 409, code: 'CONFLICT', message: 'Recurso temporariamente indisponível' },
    },
    {
      nome: 'banco bloqueado com variação de código',
      erro: () => Object.assign(new Error('database table is locked'), { code: 'SQLITE_LOCKED_SHAREDCACHE' }),
      esperado: { status: 409, code: 'CONFLICT', message: 'Recurso temporariamente indisponível' },
    },
    {
      nome: 'restrição unique',
      erro: () => Object.assign(new Error('UNIQUE constraint failed: usuarios.email'), {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      }),
      esperado: { status: 409, code: 'CONFLICT', message: 'Já existe um registro com esses dados' },
    },
    {
      nome: 'restrição de chave primária',
      erro: () => Object.assign(new Error('PRIMARY KEY constraint failed'), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' }),
      esperado: { status: 409, code: 'CONFLICT', message: 'Já existe um registro com esses dados' },
    },
    {
      nome: 'restrição de chave estrangeira',
      erro: () => Object.assign(new Error('FOREIGN KEY constraint failed'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
      esperado: { status: 422, code: 'UNPROCESSABLE_ENTITY', message: 'Referência inválida' },
    },
    {
      nome: 'restrição check',
      erro: () => Object.assign(new Error('CHECK constraint failed: vagas > 0'), { code: 'SQLITE_CONSTRAINT_CHECK' }),
      esperado: { status: 422, code: 'UNPROCESSABLE_ENTITY', message: 'Dados não atendem às regras de negócio' },
    },
    {
      nome: 'restrição not null',
      erro: () => Object.assign(new Error('NOT NULL constraint failed: ofertas.id'), { code: 'SQLITE_CONSTRAINT' }),
      esperado: { status: 422, code: 'UNPROCESSABLE_ENTITY', message: 'Dados não atendem às regras de negócio' },
    },
    {
      nome: 'restrição de banco não identificada',
      erro: () => Object.assign(new Error('constraint failed'), { code: 'SQLITE_CONSTRAINT_TRIGGER' }),
      esperado: { status: 409, code: 'CONFLICT', message: 'Conflito ao salvar dados' },
    },
    {
      nome: 'erro desconhecido',
      erro: () => new Error('detalhe interno sensível'),
      esperado: { status: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
    },
    {
      nome: 'valor nulo',
      erro: () => null,
      esperado: { status: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
    },
  ]

  it.each(casos)('[RNF-001] normaliza $nome', ({ erro, esperado }) => {
    expect(normalizeError(erro())).toEqual(esperado)
  })

  it('[RNF-002] não expõe mensagens internas no fallback', () => {
    expect(normalizeError(new Error('senha: 1234')).message).toBe('Erro interno do servidor')
  })
})

describe('Middleware de erro e utilitários (RNF-001, RNF-005)', () => {
  it('[RNF-001] responde com status, código e detalhes do erro', () => {
    const { res, encaminhados } = executarMiddlewearDeErro(
      new ValidationError('Dados inválidos', [{ field: 'email', message: 'E-mail inválido' }]),
    )

    expect(res.codigo).toBe(400)
    expect(res.corpo).toEqual({
      error: 'Dados inválidos',
      code: 'VALIDATION_ERROR',
      details: [{ field: 'email', message: 'E-mail inválido' }],
    })
    expect(encaminhados).toEqual([])
  })

  it('[RNF-001] omite detalhes ausentes e usa o status normalizado', () => {
    const { res } = executarMiddlewearDeErro(new ConflictError('Placa duplicada'))

    expect(res.codigo).toBe(409)
    expect(res.corpo).toEqual({ error: 'Placa duplicada', code: 'CONFLICT' })
    expect(Object.prototype.hasOwnProperty.call(res.corpo, 'details')).toBe(false)
  })

  it('[RNF-005] delega ao próximo middleware quando headers já foram enviados', () => {
    const res = Object.assign(resposta(), { headersSent: true })
    const erro = new Error('falha')
    const { res: respostaUsada, encaminhados } = executarMiddlewearDeErro(erro, res)

    expect(respostaUsada.codigo).toBeNull()
    expect(respostaUsada.corpo).toBeNull()
    expect(encaminhados).toEqual([erro])
  })

  it('[RNF-005] notFoundHandler encaminha erro 404', () => {
    const encaminhados = []
    notFoundHandler({}, {}, (erro) => encaminhados.push(erro))

    expect(encaminhados).toHaveLength(1)
    expect(encaminhados[0]).toBeInstanceOf(NotFoundError)
  })

  it('[RNF-005] asyncHandler encaminha erros síncronos e assíncronos', async () => {
    const erroSincrono = new Error('falha sincrona')
    const encaminhadosSincronos = []
    await expect(asyncHandler(() => {
      throw erroSincrono
    })({}, {}, (erro) => {
      encaminhadosSincronos.push(erro)
    })).resolves.toBeUndefined()
    expect(encaminhadosSincronos).toEqual([erroSincrono])

    const erroAssincrono = new Error('falha assincrona')
    const encaminhadosAssincronos = []
    await asyncHandler(async () => {
      throw erroAssincrono
    })({}, {}, (erro) => {
      encaminhadosAssincronos.push(erro)
    })
    expect(encaminhadosAssincronos).toEqual([erroAssincrono])
  })

  it('[RNF-005] asyncHandler preserva retorno e argumentos do handler', async () => {
    const req = { usuario: 'aluno' }
    const res = resposta()
    let recebido
    const valor = await asyncHandler((reqRecebido, resRecebido, next) => {
      recebido = [reqRecebido, resRecebido, next]
      return 'ok'
    })(req, res, () => {})

    expect(valor).toBe('ok')
    expect(recebido[0]).toBe(req)
    expect(recebido[1]).toBe(res)
    expect(typeof recebido[2]).toBe('function')
  })

  it('[RNF-005] exporta todos os utilitários na exportação padrão', () => {
    expect(errorHandler.STATUS).toBe(STATUS)
    expect(errorHandler.ApiError).toBe(ApiError)
    expect(errorHandler.ValidationError).toBe(ValidationError)
    expect(errorHandler.SemanticValidationError).toBe(SemanticValidationError)
    expect(errorHandler.UnauthorizedError).toBe(UnauthorizedError)
    expect(errorHandler.ForbiddenError).toBe(ForbiddenError)
    expect(errorHandler.NotFoundError).toBe(NotFoundError)
    expect(errorHandler.ConflictError).toBe(ConflictError)
    expect(errorHandler.UnprocessableError).toBe(UnprocessableError)
    expect(errorHandler.normalizeError).toBe(normalizeError)
    expect(errorHandler.errorHandler).toBe(middlewareDeErro)
    expect(errorHandler.notFoundHandler).toBe(notFoundHandler)
    expect(errorHandler.asyncHandler).toBe(asyncHandler)
  })
})
