import { Router } from 'express'
import { criar } from '../controllers/reservaController.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.post('/ofertas/:id/reservas', criar)

export { router, router as routes }
export default router
