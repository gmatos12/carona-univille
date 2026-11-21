import { Router } from 'express'
import { authenticate } from '../middlewares/auth.js'
import {
  atualizar,
  buscar,
  criar,
  excluir,
  listar,
} from '../controllers/veiculoController.js'

const router = Router()

router.use(authenticate)

router.post('/', criar)
router.get('/', listar)
router.get('/:id', buscar)
router.put('/:id', atualizar)
router.delete('/:id', excluir)

export { router, router as routes }
export default router
