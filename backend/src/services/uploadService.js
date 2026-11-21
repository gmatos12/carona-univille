import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { UnprocessableError } from '../middlewares/errorHandler.js'
import { UsuarioService } from './usuarioService.js'

export const MAX_FILE_SIZE = 2 * 1024 * 1024
export const TIPOS_PERMITIDOS = Object.freeze(['image/jpeg', 'image/png'])
export const CAMPO_FOTO = 'foto'

const EXTENSOES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
})

export function inferirMimetype(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  return null
}

export function validarArquivo(arquivo) {
  if (Buffer.isBuffer(arquivo)) {
    return validarArquivo({ buffer: arquivo, size: arquivo.length })
  }
  if (!arquivo) return { valido: true }

  const buffer = arquivo.buffer ?? arquivo.data
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { valido: true }

  const tamanhoInformado = Number(arquivo.size)
  const tamanho = Number.isFinite(tamanhoInformado) ? tamanhoInformado : buffer.length
  if (tamanho > MAX_FILE_SIZE || buffer.length > MAX_FILE_SIZE) {
    return { valido: false, erro: 'Arquivo excede o limite de 2 MB' }
  }

  const informado = arquivo.mimetype ?? arquivo.type ?? null
  const mimetype = informado || inferirMimetype(buffer)
  if (!TIPOS_PERMITIDOS.includes(mimetype)) {
    return { valido: false, erro: 'Formato de imagem não suportado; use JPEG ou PNG' }
  }

  return { valido: true, mimetype, extensao: EXTENSOES[mimetype] }
}

export const validarImagem = validarArquivo
export const validarFoto = validarArquivo
export const validarFotoPerfil = validarArquivo
export const validarImagemPerfil = validarArquivo
export const validarUpload = validarArquivo
export const validarUploadFotoPerfil = validarArquivo
export const validateUpload = validarArquivo
export const validateImage = validarArquivo
export const validateFile = validarArquivo

function resolverDiretorio(valor) {
  const selecionado = valor || process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'src/uploads/perfis')
  return path.isAbsolute(selecionado) ? path.resolve(selecionado) : path.resolve(process.cwd(), selecionado)
}

export class UploadService {
  constructor({ uploadDir, usuarios = new UsuarioService() } = {}) {
    this.uploadDir = resolverDiretorio(uploadDir)
    this.usuarios = usuarios
  }

  validar(arquivo) {
    return validarArquivo(arquivo)
  }

  async salvar(arquivo, usuarioId) {
    const validacao = validarArquivo(arquivo)
    if (!validacao.valido) throw new UnprocessableError(validacao.erro)
    if (!arquivo || !arquivo.buffer) return null

    await fs.mkdir(this.uploadDir, { recursive: true })
    const nome = `${String(usuarioId)}-${randomUUID()}.${validacao.extensao}`
    await fs.writeFile(path.join(this.uploadDir, nome), arquivo.buffer)
    return nome
  }

  async remover(caminho) {
    if (!caminho) return false
    const nome = path.basename(String(caminho))
    if (!nome) return false

    await fs.unlink(path.join(this.uploadDir, nome)).catch(() => undefined)
    return true
  }

  async adicionarFotoPerfil(usuarioId, arquivo, connection) {
    const anterior = await this.usuarios.perfilProprio(usuarioId, connection)
    const caminho = await this.salvar(arquivo, usuarioId)
    if (!caminho) return anterior

    const perfil = await this.usuarios.atualizarFotoPerfil(usuarioId, caminho, connection)
    if (anterior?.foto_perfil_path && anterior.foto_perfil_path !== caminho) {
      await this.remover(anterior.foto_perfil_path)
    }
    return perfil
  }

  async removerFotoPerfil(usuarioId, connection) {
    const anterior = await this.usuarios.perfilProprio(usuarioId, connection)
    const perfil = await this.usuarios.removerFotoPerfil(usuarioId, connection)
    if (anterior?.foto_perfil_path) await this.remover(anterior.foto_perfil_path)
    return perfil
  }
}

export const uploadService = new UploadService()

export default {
  MAX_FILE_SIZE,
  TIPOS_PERMITIDOS,
  validarArquivo,
  validarImagem,
  validarFoto,
  validarFotoPerfil,
  validarImagemPerfil,
  validarUpload,
  validarUploadFotoPerfil,
  validateUpload,
  validateImage,
  validateFile,
  UploadService,
  uploadService,
}
