import { asyncHandler } from '../middlewares/errorHandler.js'
import { avaliacaoService } from '../services/avaliacaoService.js'

const avaliar = asyncHandler(async (req, res) => {
  const avaliacao = await avaliacaoService.avaliar(req.params.id, req.user.id, req.body)
  return res.status(201).json({ avaliacao })
})

export { avaliar }
export default { avaliar }
