import { Router } from 'express'
import { authenticate, requireContaAtiva } from '../middlewares/auth.js'
import { alterar, criar, interromper } from '../controllers/recorrenciaController.js'

const router = Router()
router.use(authenticate)

router.post('/', requireContaAtiva, criar)
router.put('/:id', requireContaAtiva, alterar)
router.post('/:id/interromper', requireContaAtiva, interromper)

export { router, router as routes }
export default router
