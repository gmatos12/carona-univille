import { asyncHandler } from '../middlewares/errorHandler.js'
import { recorrenciaService } from '../services/recorrenciaService.js'

const criar = asyncHandler(async (req, res) => {
  const resultado = await recorrenciaService.criar(req.user.id, req.body)
  const recorrencia = resultado?.recorrencia ?? resultado
  return res.status(201).json({ recorrencia, ...resultado })
})

const alterar = asyncHandler(async (req, res) => {
  const recorrencia = await recorrenciaService.alterar(req.params.id, req.user.id, req.body)
  return res.status(200).json({ recorrencia })
})

const interromper = asyncHandler(async (req, res) => {
  const recorrencia = await recorrenciaService.interromper(req.params.id, req.user.id)
  return res.status(200).json({ recorrencia })
})

export { criar, alterar, interromper }
export default { criar, alterar, interromper }
