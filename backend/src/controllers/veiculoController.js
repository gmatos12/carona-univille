import { asyncHandler } from '../middlewares/errorHandler.js'
import { veiculoService } from '../services/veiculoService.js'

const criar = asyncHandler(async (req, res) => {
  const veiculo = await veiculoService.criar(req.user.id, req.body)
  return res.status(201).json({ veiculo })
})

const listar = asyncHandler(async (req, res) => {
  const veiculos = await veiculoService.listar(req.user.id, req.query)
  return res.status(200).json({ veiculos })
})

const buscar = asyncHandler(async (req, res) => {
  const veiculo = await veiculoService.buscarPorId(req.params.id, req.user.id)
  return res.status(200).json({ veiculo })
})

const atualizar = asyncHandler(async (req, res) => {
  const veiculo = await veiculoService.atualizar(req.params.id, req.user.id, req.body)
  return res.status(200).json({ veiculo })
})

const excluir = asyncHandler(async (req, res) => {
  await veiculoService.excluir(req.params.id, req.user.id)
  return res.status(200).json({ ok: true })
})

export { criar, listar, buscar, atualizar, excluir }

export default { criar, listar, buscar, atualizar, excluir }
