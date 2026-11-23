import { describe, expect, it } from 'vitest'
import moduloAutorizacao, {
  authorize,
  authorizeAll,
  authorizeAny,
  authorizeOwner,
  authorizeResource,
  authorizeSelf,
  isOwner,
  requireOwner,
  requireSelf,
} from '../../src/middlewares/authorize.js'
import { ForbiddenError, UnauthorizedError } from '../../src/middlewares/errorHandler.js'

function executar(middleware, req = {}) {
  const encaminhados = []

  return new Promise((resolve) => {
    middleware(req, {}, (erro) => {
      encaminhados.push(erro)
      resolve()
    })
  }).then(() => encaminhados)
}

describe('authorize (RNF-002, RNF-005, CA-002)', () => {
  it('[RNF-005] exige uma função de verificação', () => {
    for (const valor of [undefined, null, 'true', 1, {}]) {
      expect(() => authorize(valor)).toThrow(TypeError)
    }
    expect(() => authorize(() => true)).not.toThrow()
  })

  it('[RNF-002] exige usuário autenticado por padrão', async () => {
    const encaminhados = await executar(authorize(() => true), {})

    expect(encaminhados).toHaveLength(1)
    expect(encaminhados[0]).toBeInstanceOf(UnauthorizedError)
    expect(encaminhados[0].status).toBe(401)
    expect(encaminhados[0].message).toBe('Autenticação necessária')
  })

  it('[RNF-002] permite requisições sem usuário quando requireUser é false', async () => {
    const encaminhados = await executar(authorize(() => true, { requireUser: false }), {})

    expect(encaminhados).toEqual([undefined])
  })

  it('[CA-002] permite acesso quando o predicado retorna true ou objeto allow', async () => {
    const permitido = await executar(authorize((req) => req.user.id === 7), { user: { id: 7 } })
    expect(permitido).toEqual([undefined])

    const objeto = await executar(authorize(() => ({ allowed: true })), { user: { id: 7 } })
    expect(objeto).toEqual([undefined])

    const assincrono = await executar(authorize(async () => true), { user: { id: 7 } })
    expect(assincrono).toEqual([undefined])
  })

  it('[CA-002] nega acesso para resultados que não indicam permissão explícita', async () => {
    for (const resultado of [false, undefined, null, 1, 'sim', { allowed: false }, {}]) {
      const encaminhados = await executar(authorize(() => resultado), { user: { id: 7 } })

      expect(encaminhados).toHaveLength(1)
      expect(encaminhados[0]).toBeInstanceOf(ForbiddenError)
      expect(encaminhados[0].status).toBe(403)
      expect(encaminhados[0].message).toBe('Acesso negado a este recurso')
    }
  })

  it('[RNF-001] usa mensagens personalizadas das opções e do predicado', async () => {
    const dasOpcoes = await executar(authorize(() => false, { message: 'Somente motoristas' }), { user: { id: 7 } })
    expect(dasOpcoes[0].message).toBe('Somente motoristas')

    const doPredicado = await executar(authorize(() => ({ allowed: false, message: 'Viagem lotada' })), {
      user: { id: 7 },
    })
    expect(doPredicado[0].message).toBe('Viagem lotada')

    const semMensagem = await executar(authorize(() => ({ allowed: false, message: 42 }), {
      message: 'Alternativa',
    }), { user: { id: 7 } })
    expect(semMensagem[0].message).toBe('Alternativa')
  })

  it('[RNF-005] encaminha exceções do predicado sem transformá-las', async () => {
    const erro = new Error('falha na consulta')
    const encaminhados = await executar(authorize(() => {
      throw erro
    }), { user: { id: 7 } })

    expect(encaminhados).toEqual([erro])
  })
})

describe('isOwner e authorizeOwner (RNF-002, CA-002)', () => {
  it('[CA-002] compara identificadores por valor textual', () => {
    expect(isOwner({ user: { id: 7 } }, { usuario_id: 7 })).toBe(true)
    expect(isOwner({ user: { id: '7' } }, { usuario_id: 7 })).toBe(true)
    expect(isOwner({ user: { id: 7 } }, { usuario_id: 8 })).toBe(false)
  })

  it('[CA-002] considera ausência de usuário, recurso ou identificador como negação', () => {
    expect(isOwner({}, { usuario_id: 7 })).toBe(false)
    expect(isOwner({ user: { id: 7 } }, null)).toBe(false)
    expect(isOwner({ user: { id: null } }, { usuario_id: null })).toBe(false)
    expect(isOwner({ user: { id: 7 } }, {})).toBe(false)
  })

  it('[RNF-005] aceita campo e extrator personalizados', () => {
    const req = { user: { id: 7 } }

    expect(isOwner(req, { dono_id: 7 }, { ownerField: 'dono_id' })).toBe(true)
    expect(isOwner(req, { qualquer: 7 }, {
      getOwnerId: (resource, reqRecebido) => {
        expect(resource.qualquer).toBe(7)
        expect(reqRecebido).toBe(req)
        return '7'
      },
    })).toBe(true)
  })

  it('[CA-002] autoriza apenas o dono do recurso padrão', async () => {
    const permitido = await executar(authorizeOwner(), {
      user: { id: 7 },
      resource: { usuario_id: 7 },
    })
    expect(permitido).toEqual([undefined])

    const negado = await executar(authorizeOwner(), {
      user: { id: 7 },
      resource: { usuario_id: 8 },
    })
    expect(negado[0]).toBeInstanceOf(ForbiddenError)
  })

  it('[RNF-005] autoriza com getResource e opções repassadas', async () => {
    const req = { user: { id: 7 }, resource: { usuario_id: 8 }, viagem: { dono_id: 7 } }
    const encaminhados = await executar(authorizeOwner({
      getResource: (reqRecebido) => reqRecebido.viagem,
      ownerField: 'dono_id',
    }), req)

    expect(encaminhados).toEqual([undefined])
  })
})

describe('authorizeSelf (RNF-002, CA-002)', () => {
  it('[CA-002] compara o usuário autenticado com o parâmetro id', async () => {
    const permitido = await executar(authorizeSelf(), { user: { id: 7 }, params: { id: '7' } })
    expect(permitido).toEqual([undefined])

    const negado = await executar(authorizeSelf(), { user: { id: 7 }, params: { id: '8' } })
    expect(negado[0]).toBeInstanceOf(ForbiddenError)
  })

  it('[RNF-005] aceita parâmetro e extrator personalizados', async () => {
    const req = { user: { id: 7 }, params: { id: 1, usuarioId: '7' } }

    expect(await executar(authorizeSelf({ parameter: 'usuarioId' }), req)).toEqual([undefined])
    expect(await executar(authorizeSelf({ getUserId: (reqRecebido) => reqRecebido.params.usuarioId }), req))
      .toEqual([undefined])
    expect((await executar(authorizeSelf(), { user: { id: 7 }, params: {} }))[0]).toBeInstanceOf(ForbiddenError)
  })
})

describe('authorizeAny e authorizeAll (RNF-002, RNF-005)', () => {
  it('[RNF-005] rejeita listas inválidas na criação do middleware', () => {
    expect(() => authorizeAny(null)).toThrow(TypeError)
    expect(() => authorizeAny(() => true)).toThrow(TypeError)
    expect(() => authorizeAny(null)).toThrow('authorizeAny exige uma lista de verificações')
    expect(() => authorizeAll(undefined)).toThrow(TypeError)
    expect(() => authorizeAll('true')).toThrow('authorizeAll exige uma lista de verificações')
  })

  it('[RNF-002] authorizeAny permite se pelo menos uma verificação passa', async () => {
    const req = { user: { id: 7 } }

    expect(await executar(authorizeAny([() => false, () => true]), req)).toEqual([undefined])
    expect(await executar(authorizeAny([() => true, () => true]), req)).toEqual([undefined])

    const negado = await executar(authorizeAny([() => false, () => false], { message: 'Nenhuma regra atendida' }), req)
    expect(negado[0]).toBeInstanceOf(ForbiddenError)
    expect(negado[0].message).toBe('Nenhuma regra atendida')
  })

  it('[RNF-002] authorizeAll exige que todas as verificações passem', async () => {
    const req = { user: { id: 7 } }

    expect(await executar(authorizeAll([() => true, () => true]), req)).toEqual([undefined])

    const negado = await executar(authorizeAll([() => true, () => false], { message: 'Regras insuficientes' }), req)
    expect(negado[0]).toBeInstanceOf(ForbiddenError)
    expect(negado[0].message).toBe('Regras insuficientes')
  })

  it('[RNF-005] aceita verificações assíncronas e resultados estruturados', async () => {
    const req = { user: { id: 7 } }
    const assincrona = async () => true
    const estruturada = () => ({ allowed: true })

    expect(await executar(authorizeAny([() => false, assincrona]), req)).toEqual([undefined])
    expect(await executar(authorizeAll([assincrona, estruturada]), req)).toEqual([undefined])

    const negado = await executar(authorizeAll([assincrona, async () => false]), req)
    expect(negado[0]).toBeInstanceOf(ForbiddenError)
  })

  it('[RNF-005] ignora entradas que não são funções e encaminha falhas', async () => {
    const req = { user: { id: 7 } }

    expect((await executar(authorizeAny([null, 'x', () => false]), req))[0]).toBeInstanceOf(ForbiddenError)
    expect((await executar(authorizeAll([null, () => true]), req))[0]).toBeInstanceOf(ForbiddenError)

    const erro = new Error('falha na lista')
    const encaminhados = await executar(authorizeAny([() => {
      throw erro
    }]), req)
    expect(encaminhados).toEqual([erro])
  })
})

describe('Aliases e exportação padrão (RNF-005)', () => {
  it('[RNF-005] mantém aliases e exportações consistentes', () => {
    expect(authorizeResource).toBe(authorizeOwner)
    expect(requireOwner).toBe(authorizeOwner)
    expect(requireSelf).toBe(authorizeSelf)
    expect(moduloAutorizacao.authorize).toBe(authorize)
    expect(moduloAutorizacao.authorizeOwner).toBe(authorizeOwner)
    expect(moduloAutorizacao.authorizeResource).toBe(authorizeResource)
    expect(moduloAutorizacao.authorizeSelf).toBe(authorizeSelf)
    expect(moduloAutorizacao.authorizeAny).toBe(authorizeAny)
    expect(moduloAutorizacao.authorizeAll).toBe(authorizeAll)
    expect(moduloAutorizacao.isOwner).toBe(isOwner)
    expect(moduloAutorizacao.requireOwner).toBe(requireOwner)
    expect(moduloAutorizacao.requireSelf).toBe(requireSelf)
  })
})
