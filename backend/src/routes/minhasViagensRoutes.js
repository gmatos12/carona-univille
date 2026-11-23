import { Router } from 'express'
import { listar } from '../controllers/minhasViagensController.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()
router.use(authenticate)

router.get('/', listar)

export { router, router as routes }
export default router
