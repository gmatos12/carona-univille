import { Router } from 'express'
import { cadastrar, login } from '../controllers/authController.js'

const router = Router()

router.post('/cadastro', cadastrar)
router.post('/login', login)

export { router, router as routes }
export default router
