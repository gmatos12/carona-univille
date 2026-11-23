import { asyncHandler } from '../middlewares/errorHandler.js'
import { exclusaoContaService } from '../services/exclusaoContaService.js'
import { UploadService } from '../services/uploadService.js'
import { usuarioService } from '../services/usuarioService.js'

function uploadsPara(req) {
  return new UploadService({
    uploadDir: req.app.get('uploadDir'),
    usuarios: usuarioService,
  })
}

const perfil = asyncHandler(async (req, res) => {
  const dados = await usuarioService.perfilProprio(req.user.id)
  return res.status(200).json({ perfil: dados })
})

const atualizar = asyncHandler(async (req, res) => {
  const dados = await usuarioService.atualizarPerfil(req.user.id, req.body)
  return res.status(200).json({ perfil: dados })
})

const adicionarFoto = asyncHandler(async (req, res) => {
  const dados = await uploadsPara(req).adicionarFotoPerfil(req.user.id, req.file)
  return res.status(200).json({ perfil: dados })
})

const removerFoto = asyncHandler(async (req, res) => {
  const dados = await uploadsPara(req).removerFotoPerfil(req.user.id)
  return res.status(200).json({ perfil: dados })
})

const perfilPublico = asyncHandler(async (req, res) => {
  const dados = await usuarioService.perfilPublico(req.params.id)
  return res.status(200).json({ perfil: dados })
})

const excluir = asyncHandler(async (req, res) => {
  await exclusaoContaService.excluir(req.user.id)
  return res.status(204).send()
})

export { perfil, atualizar, adicionarFoto, removerFoto, perfilPublico, excluir }

export default { perfil, atualizar, adicionarFoto, removerFoto, perfilPublico, excluir }
