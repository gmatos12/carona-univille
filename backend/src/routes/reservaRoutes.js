import { Router } from 'express'
import { cancelarReserva } from '../controllers/cancelamentoController.js'
import { registrarNoShowPassageiro } from '../controllers/noShowController.js'
import { criar } from '../controllers/reservaController.js'
import { authenticate, requireContaAtiva } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.post('/ofertas/:id/reservas', requireContaAtiva, criar)
router.post('/reservas/:id/cancelar', cancelarReserva)
router.post('/reservas/:id/no-show', registrarNoShowPassageiro)

export { router, router as routes }
export default router
