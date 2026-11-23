import { asyncHandler } from '../middlewares/errorHandler.js'
import { execucaoViagemService } from '../services/execucaoViagemService.js'

const iniciar = asyncHandler(async (req, res) => {
  const oferta = await execucaoViagemService.iniciar(req.params.id, req.user.id)
  return res.status(200).json({ oferta })
})

const concluir = asyncHandler(async (req, res) => {
  const oferta = await execucaoViagemService.concluir(req.params.id, req.user.id)
  return res.status(200).json({ oferta })
})

export { iniciar, concluir }
export default { iniciar, concluir }
