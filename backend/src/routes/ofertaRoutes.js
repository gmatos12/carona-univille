import { Router } from 'express'
import { cancelarOferta } from '../controllers/cancelamentoController.js'
import { authenticate } from '../middlewares/auth.js'
import {
  atualizar,
  buscar,
  criar,
  detalhar,
} from '../controllers/ofertaController.js'

const router = Router()

router.use(authenticate)

router.post('/', criar)
router.get('/busca', buscar)
router.get('/:id', detalhar)
router.put('/:id', atualizar)
router.post('/:id/cancelar', cancelarOferta)

export { router, router as routes }
export default router
