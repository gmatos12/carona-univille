import { beforeAll, describe, expect, it } from 'vitest'

const CAMINHOS_MODULOS = [
  '../../src/services/uploadService.js',
  '../../src/middlewares/upload.js',
]

const NOMES_VALIDACAO = [
  'validarArquivo',
  'validarImagem',
  'validarFoto',
  'validarFotoPerfil',
  'validarImagemPerfil',
  'validarUpload',
  'validarUploadFotoPerfil',
  'validateUpload',
  'validateImage',
  'validateFile',
]

const LIMITE_BYTES = 2 * 1024 * 1024
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GeUAAAAASUVORK5CYII=',
  'base64',
)
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
)

function arquivo(conteudo, mimetype, nome) {
  return {
    originalname: nome,
    filename: nome,
    name: nome,
    mimetype,
    type: mimetype,
    size: conteudo?.length ?? 0,
    buffer: conteudo,
    data: conteudo,
  }
}

function preencherAte(total) {
  return Buffer.concat([PNG, Buffer.alloc(total - PNG.length)])
}

function normalizar(resultado) {
  if (resultado === false) return { valido: false }
  if (typeof resultado === 'string' && resultado.trim() !== '') return { valido: false }

  if (resultado && typeof resultado === 'object') {
    if (resultado.valido === false || resultado.valid === false || resultado.ok === false) return { valido: false }
    if (resultado.erro || resultado.error) return { valido: false }
  }

  return { valido: true }
}

describe('Validação de upload da foto de perfil do usuário (RF-003, RNF-002, RNF-004, PEND-002)', () => {
  let validar

  beforeAll(async () => {
    const resultados = await Promise.allSettled(CAMINHOS_MODULOS.map((caminho) => import(caminho)))
    const namespaces = resultados.filter((resultado) => resultado.status === 'fulfilled').map((resultado) => resultado.value)

    for (const modulo of namespaces) {
      for (const nome of NOMES_VALIDACAO) {
        for (const origem of [modulo, modulo.default]) {
          if (origem && typeof origem[nome] === 'function') {
            validar = origem[nome]
            return
          }
        }
      }
    }

    throw new Error(
      'Não foi encontrada função de validação de upload de foto de perfil em uploadService.js ou middlewares/upload.js',
    )
  })

  async function avaliar(entrada) {
    const tentativas = [
      () => validar(entrada),
      () => validar(entrada?.buffer ?? entrada),
    ]

    let ultimoErro
    for (const tentativa of tentativas) {
      try {
        return normalizar(await tentativa())
      } catch (erro) {
        ultimoErro = erro
      }
    }

    return { valido: false, erro: ultimoErro }
  }

  it('[RF-003/PEND-002] aceita foto PNG dentro do limite de 2 MB', async () => {
    const resultado = await avaliar(arquivo(PNG, 'image/png', 'perfil.png'))

    expect(resultado.valido).toBe(true)
  })

  it('[RF-003/PEND-002] aceita foto JPEG dentro do limite de 2 MB', async () => {
    const resultado = await avaliar(arquivo(JPEG, 'image/jpeg', 'perfil.jpg'))

    expect(resultado.valido).toBe(true)
  })

  it('[PEND-002] aceita arquivo com exatamente 2 MB', async () => {
    const resultado = await avaliar(arquivo(preencherAte(LIMITE_BYTES), 'image/png', 'limite.png'))

    expect(resultado.valido).toBe(true)
  })

  it('[RNF-002/PEND-002] rejeita arquivo acima de 2 MB', async () => {
    const resultado = await avaliar(arquivo(preencherAte(LIMITE_BYTES + 1), 'image/png', 'grande.png'))

    expect(resultado.valido).toBe(false)
  })

  it('[RNF-002/PEND-002] rejeita tipo diferentes de JPEG/PNG (GIF)', async () => {
    const resultado = await avaliar(arquivo(PNG, 'image/gif', 'perfil.gif'))

    expect(resultado.valido).toBe(false)
  })

  it('[RNF-002/PEND-002] rejeita tipo diferentes de JPEG/PNG (PDF)', async () => {
    const resultado = await avaliar(arquivo(PNG, 'application/pdf', 'perfil.pdf'))

    expect(resultado.valido).toBe(false)
  })

  it('[RNF-002/PEND-002] rejeita tipo diferentes de JPEG/PNG (SVG)', async () => {
    const resultado = await avaliar(arquivo(PNG, 'image/svg+xml', 'perfil.svg'))

    expect(resultado.valido).toBe(false)
  })

  it('[RF-003] foto de perfil é opcional: ausência de arquivo é válida', async () => {
    const resultado = await avaliar(arquivo(undefined, undefined, undefined))

    expect(resultado.valido).toBe(true)
  })
})
