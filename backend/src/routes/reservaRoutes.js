import { Router } from 'express'
import { cancelarReserva } from '../controllers/cancelamentoController.js'
import { criar } from '../controllers/reservaController.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.post('/ofertas/:id/reservas', criar)
router.post('/reservas/:id/cancelar', cancelarReserva)

export { router, router as routes }
export default router
