import { asyncHandler } from '../middlewares/errorHandler.js'
import { reservaService } from '../services/reservaService.js'

const criar = asyncHandler(async (req, res) => {
  const reserva = await reservaService.reservar({
    oferta_id: req.params.id,
    passageiro_id: req.user.id,
  })
  return res.status(201).json({ reserva })
})

export { criar }

export default { criar }
