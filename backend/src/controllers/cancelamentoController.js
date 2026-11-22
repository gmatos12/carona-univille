import { asyncHandler } from '../middlewares/errorHandler.js'
import { cancelamentoService } from '../services/cancelamentoService.js'

const cancelarReserva = asyncHandler(async (req, res) => {
  const cancelamento = await cancelamentoService.cancelarReservaPassageiro(
    req.params.id,
    req.user.id,
  )

  return res.status(200).json({
    reserva: cancelamento.reserva,
    cancelamento,
  })
})

const cancelarOferta = asyncHandler(async (req, res) => {
  const cancelamento = await cancelamentoService.cancelarOfertaMotorista(
    req.params.id,
    req.user.id,
  )

  return res.status(200).json({
    oferta: cancelamento.oferta,
    reservas: cancelamento.reservas,
    cancelamento,
  })
})

export { cancelarReserva, cancelarOferta }

export default { cancelarReserva, cancelarOferta }
