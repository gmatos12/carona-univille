import { Router } from 'express'
import { cancelarOferta } from '../controllers/cancelamentoController.js'
import { authenticate } from '../middlewares/auth.js'
import { avaliar } from '../controllers/avaliacaoController.js'
import { concluir, iniciar } from '../controllers/execucaoController.js'
import { registrarAusenciaMotorista } from '../controllers/noShowController.js'
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
router.post('/:id/iniciar', iniciar)
router.post('/:id/concluir', concluir)
router.post('/:id/cancelar', cancelarOferta)
router.post('/:id/ausencia-motorista', registrarAusenciaMotorista)
router.post('/:id/avaliacoes', avaliar)

export { router, router as routes }
export default router
