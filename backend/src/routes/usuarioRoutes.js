import { Router } from 'express'
import { authenticate } from '../middlewares/auth.js'
import { uploadFotoPerfil } from '../middlewares/upload.js'
import {
  adicionarFoto,
  atualizar,
  excluir,
  perfil,
  perfilPublico,
  removerFoto,
} from '../controllers/usuarioController.js'

const router = Router()

router.get('/usuarios/:id/perfil-publico', perfilPublico)

router.get('/me', authenticate, perfil)
router.put('/me', authenticate, atualizar)
router.post('/me/foto', authenticate, uploadFotoPerfil, adicionarFoto)
router.delete('/me/foto', authenticate, removerFoto)
router.delete('/me', authenticate, excluir)

export { router, router as routes }
export default router
