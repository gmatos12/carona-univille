import { asyncHandler } from '../middlewares/errorHandler.js'
import { noShowService } from '../services/noShowService.js'

const registrarNoShowPassageiro = asyncHandler(async (req, res) => {
  const resultado = await noShowService.registrarNoShowPassageiro(req.params.id, req.user.id)
  return res.status(200).json(resultado)
})

const registrarAusenciaMotorista = asyncHandler(async (req, res) => {
  const resultado = await noShowService.registrarAusenciaMotorista(req.params.id, req.user.id)
  return res.status(200).json(resultado)
})

export { registrarNoShowPassageiro, registrarAusenciaMotorista }
export default { registrarNoShowPassageiro, registrarAusenciaMotorista }
