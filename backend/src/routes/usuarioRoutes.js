import { Router } from 'express'
import { authenticate } from '../middlewares/auth.js'
import { uploadFotoPerfil } from '../middlewares/upload.js'
import {
  adicionarFoto,
  atualizar,
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

export { router, router as routes }
export default router
