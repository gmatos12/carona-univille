import { UnprocessableError } from './errorHandler.js'
import {
  CAMPO_FOTO,
  MAX_FILE_SIZE,
  inferirMimetype,
  validarArquivo,
} from '../services/uploadService.js'

export {
  CAMPO_FOTO,
  MAX_FILE_SIZE,
  TIPOS_PERMITIDOS,
  inferirMimetype,
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
} from '../services/uploadService.js'

const SOBRA_MULTIPART = 64 * 1024
const CAMPOS_ARQUIVO = Object.freeze([CAMPO_FOTO, 'file', 'imagem', 'perfil'])
const LIMITE_CORPO = MAX_FILE_SIZE + SOBRA_MULTIPART

function parametro(texto, nome) {
  const padrao = new RegExp(`${nome}\\s*=\\s*(?:"([^"]+)"|([^;]+))`, 'i')
  const correspondencia = padrao.exec(texto || '')
  if (!correspondencia) return null
  return (correspondencia[1] ?? correspondencia[2]).trim()
}

function cabecalhosDaParte(texto) {
  const cabecalhos = {}
  for (const linha of texto.split('\r\n')) {
    const separador = linha.indexOf(':')
    if (separador === -1) continue
    cabecalhos[linha.slice(0, separador).trim().toLowerCase()] = linha.slice(separador + 1).trim()
  }
  return cabecalhos
}

async function lerCorpo(req) {
  const partes = []
  let total = 0

  for await (const parte of req) {
    total += parte.length
    if (total > LIMITE_CORPO) {
      throw new UnprocessableError('Corpo da requisição excede o limite permitido')
    }
    partes.push(parte)
  }

  return Buffer.concat(partes)
}

function separarPartes(corpo, boundary) {
  const delimitador = Buffer.from(`--${boundary}`)
  const partes = []
  let inicio = corpo.indexOf(delimitador)

  if (inicio === -1) return partes
  inicio += delimitador.length

  while (inicio < corpo.length) {
    if (corpo.slice(inicio, inicio + 2).toString() === '--') break
    if (corpo.slice(inicio, inicio + 2).toString() === '\r\n') inicio += 2

    const fim = corpo.indexOf(delimitador, inicio)
    if (fim === -1) break

    let conteudo = corpo.slice(inicio, fim)
    if (conteudo.slice(-2).toString() === '\r\n') conteudo = conteudo.slice(0, -2)
    partes.push(conteudo)
    inicio = fim + delimitador.length
  }

  return partes
}

function interpretarParte(parte) {
  const separador = parte.indexOf('\r\n\r\n')
  if (separador === -1) return null

  const cabecalhos = cabecalhosDaParte(parte.slice(0, separador).toString('latin1'))
  const disposicao = cabecalhos['content-disposition'] || ''
  const conteudo = parte.slice(separador + 4)

  return {
    campo: parametro(disposicao, 'name'),
    nomeOriginal: parametro(disposicao, 'filename'),
    mimetype: cabecalhos['content-type'] || null,
    conteudo,
  }
}

async function uploadFotoPerfil(req, res, next) {
  try {
    req.file = undefined

    if (!req.is || !req.is('multipart/form-data')) return next()

    const boundary = parametro(req.headers['content-type'], 'boundary')
    if (!boundary) throw new UnprocessableError('Requisição multipart sem boundary')

    const corpo = await lerCorpo(req)
    for (const parte of separarPartes(corpo, boundary)) {
      const item = interpretarParte(parte)
      if (!item || !item.nomeOriginal || !CAMPOS_ARQUIVO.includes(item.campo)) continue

      const arquivo = {
        fieldname: item.campo,
        originalname: item.nomeOriginal,
        mimetype: item.mimetype || inferirMimetype(item.conteudo),
        size: item.conteudo.length,
        buffer: item.conteudo,
      }
      const validacao = validarArquivo(arquivo)
      if (!validacao.valido) throw new UnprocessableError(validacao.erro)

      req.file = arquivo
      break
    }

    return next()
  } catch (erro) {
    return next(erro)
  }
}

export const upload = uploadFotoPerfil
export const uploadFoto = uploadFotoPerfil
export const uploadPerfil = uploadFotoPerfil
export const fotoPerfilUpload = uploadFotoPerfil

export {
  uploadFotoPerfil,
  uploadFotoPerfil as uploadFotoPerfilMiddleware,
}

export default uploadFotoPerfil
