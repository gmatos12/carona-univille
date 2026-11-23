import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { UnprocessableError } from '../../src/middlewares/errorHandler.js'
import {
  MAX_FILE_SIZE,
  TIPOS_PERMITIDOS,
  UploadService,
  inferirMimetype,
  validarArquivo,
} from '../../src/services/uploadService.js'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GeUAAAAASUVORK5CYII=',
  'base64',
)
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

function arquivo(buffer = PNG, mimetype = 'image/png', size = buffer.length) {
  return { originalname: 'perfil.png', buffer, mimetype, size }
}

describe('Validação e infraestrutura de upload (RF-003, RNF-002, RNF-004)', () => {
  let diretorio

  beforeAll(async () => {
    diretorio = await fs.mkdtemp(path.join(os.tmpdir(), 'carona-upload-unit-'))
  })

  afterAll(async () => {
    await fs.rm(diretorio, { recursive: true, force: true })
  })

  it('[RNF-002] infere mimetype pelo cabeçalho do arquivo', () => {
    expect(inferirMimetype(PNG)).toBe('image/png')
    expect(inferirMimetype(JPEG)).toBe('image/jpeg')
    expect(inferirMimetype(Buffer.from([1, 2, 3]))).toBeNull()
    expect(inferirMimetype(Buffer.from([1, 2]))).toBeNull()
    expect(inferirMimetype('image/png')).toBeNull()
    expect(TIPOS_PERMITIDOS).toEqual(['image/jpeg', 'image/png'])
    expect(MAX_FILE_SIZE).toBe(2 * 1024 * 1024)
  })

  it('[RNF-002] valida tamanho, formato e ausência de arquivo', () => {
    expect(validarArquivo(arquivo())).toEqual({ valido: true, mimetype: 'image/png', extensao: 'png' })
    expect(validarArquivo(PNG)).toEqual({ valido: true, mimetype: 'image/png', extensao: 'png' })
    expect(validarArquivo({ data: JPEG })).toEqual({ valido: true, mimetype: 'image/jpeg', extensao: 'jpg' })
    expect(validarArquivo({ buffer: JPEG, size: JPEG.length })).toEqual({
      valido: true,
      mimetype: 'image/jpeg',
      extensao: 'jpg',
    })
    expect(validarArquivo(arquivo(Buffer.alloc(0), undefined, 0))).toEqual({ valido: true })
    expect(validarArquivo(null)).toEqual({ valido: true })
    expect(validarArquivo({ buffer: 'nao-buffer' })).toEqual({ valido: true })
  })

  it('[RNF-002] rejeita arquivos acima do limite ou com formato não suportado', () => {
    expect(validarArquivo(arquivo(PNG, 'image/png', MAX_FILE_SIZE + 1))).toEqual({
      valido: false,
      erro: 'Arquivo excede o limite de 2 MB',
    })
    const grande = Buffer.concat([PNG, Buffer.alloc(MAX_FILE_SIZE)])
    expect(validarArquivo(arquivo(grande, 'image/png', 'texto')).erro).toBe('Arquivo excede o limite de 2 MB')
    expect(validarArquivo(arquivo(PNG, 'image/gif'))).toEqual({
      valido: false,
      erro: 'Formato de imagem não suportado; use JPEG ou PNG',
    })
    expect(validarArquivo({ buffer: Buffer.from([1, 2, 3, 4]), size: 4 }).valido).toBe(false)
  })

  it('[RF-003] salva imagem com extensão inferida e nome único', async () => {
    const service = new UploadService({ uploadDir: diretorio })
    const nome = await service.salvar(arquivo(), 7)

    expect(nome).toMatch(/^7-[0-9a-f-]{36}\.png$/)
    expect((await fs.readFile(path.join(diretorio, nome))).equals(PNG)).toBe(true)
    expect(await service.salvar(null, 7)).toBeNull()
    await expect(service.salvar(arquivo(PNG, 'image/gif'), 7)).rejects.toBeInstanceOf(UnprocessableError)
  })

  it('[RF-003] não grava arquivo vazio como imagem inválida', async () => {
    const service = new UploadService({ uploadDir: diretorio })
    const antes = await fs.readdir(diretorio)

    expect(await service.salvar(arquivo(Buffer.alloc(0), undefined, 0), 8)).toBeNull()
    expect(await fs.readdir(diretorio)).toEqual(antes)
  })

  it('[RF-003] remove apenas o arquivo indicado e ignora falhas', async () => {
    const service = new UploadService({ uploadDir: diretorio })
    const nome = await service.salvar(arquivo(), 9)
    const caminho = path.join(diretorio, nome)

    expect(await service.remover(null)).toBe(false)
    expect(await service.remover('')).toBe(false)
    expect(await service.remover(path.join('outro', 'diretorio', nome))).toBe(true)
    await expect(fs.stat(caminho)).rejects.toThrow()
    expect(await service.remover('inexistente.png')).toBe(true)
  })

  it('[RF-003] adiciona foto, limpa foto anterior e mantém perfil quando não há arquivo', async () => {
    const anterior = await serviceFixture()
    const service = anterior.service

    await fs.writeFile(path.join(diretorio, 'antigo.png'), 'antigo')
    service.usuarios.perfilProprio.mockResolvedValue({ id: 3, foto_perfil_path: 'antigo.png' })

    const atualizado = await service.adicionarFotoPerfil(3, arquivo(JPEG, 'image/jpeg'), CONEXAO)

    expect(atualizado.foto_perfil_path).toMatch(/^3-[0-9a-f-]{36}\.jpg$/)
    expect(service.usuarios.atualizarFotoPerfil).toHaveBeenCalledWith(
      3,
      atualizado.foto_perfil_path,
      CONEXAO,
    )
    await expect(fs.stat(path.join(diretorio, 'antigo.png'))).rejects.toThrow()

    const semArquivo = await service.adicionarFotoPerfil(3, null, CONEXAO)
    expect(semArquivo).toEqual({ id: 3, foto_perfil_path: 'antigo.png' })
    expect(service.usuarios.atualizarFotoPerfil).toHaveBeenCalledTimes(1)

    service.usuarios.perfilProprio.mockResolvedValue({ id: 3, foto_perfil_path: null })
    const espião = vi.spyOn(service, 'remover')
    await service.adicionarFotoPerfil(3, arquivo(), CONEXAO)
    expect(espião).not.toHaveBeenCalled()
  })

  it('[RF-003] removerFotoPerfil apaga a imagem anterior', async () => {
    const { service } = await serviceFixture()
    const nome = await service.salvar(arquivo(), 4)

    service.usuarios.perfilProprio.mockResolvedValue({ id: 4, foto_perfil_path: nome })
    service.usuarios.removerFotoPerfil.mockResolvedValue({ id: 4, foto_perfil_path: null })

    expect(await service.removerFotoPerfil(4, CONEXAO)).toEqual({ id: 4, foto_perfil_path: null })
    expect(service.usuarios.removerFotoPerfil).toHaveBeenCalledWith(4, CONEXAO)
    await expect(fs.stat(path.join(diretorio, nome))).rejects.toThrow()
  })

  async function serviceFixture() {
    const usuarios = {
      perfilProprio: vi.fn(),
      atualizarFotoPerfil: vi.fn(),
      removerFotoPerfil: vi.fn(),
    }
    usuarios.perfilProprio.mockResolvedValue({ id: 3, foto_perfil_path: null })
    usuarios.atualizarFotoPerfil.mockImplementation(async (id, caminho) => ({
      id,
      foto_perfil_path: caminho,
    }))
    usuarios.removerFotoPerfil.mockResolvedValue({ id: 3, foto_perfil_path: null })

    return { service: new UploadService({ uploadDir: diretorio, usuarios }), usuarios }
  }
})

const CONEXAO = { nome: 'conexao-fake' }
