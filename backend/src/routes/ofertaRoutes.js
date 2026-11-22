import { Router } from 'express'
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

export { router, router as routes }
export default router
