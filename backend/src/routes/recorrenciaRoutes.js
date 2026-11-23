import { Router } from 'express'
import { authenticate } from '../middlewares/auth.js'
import { alterar, criar, interromper } from '../controllers/recorrenciaController.js'

const router = Router()
router.use(authenticate)

router.post('/', criar)
router.put('/:id', alterar)
router.post('/:id/interromper', interromper)

export { router, router as routes }
export default router
