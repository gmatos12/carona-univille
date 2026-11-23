import { asyncHandler } from '../middlewares/errorHandler.js'
import { minhasViagensService } from '../services/minhasViagensService.js'

const listar = asyncHandler(async (req, res) => {
  const resultado = await minhasViagensService.listar(req.user.id, {
    tipo: req.query.tipo ?? req.query.categoria,
  })
  return res.status(200).json(resultado)
})

export { listar }
export default { listar }
