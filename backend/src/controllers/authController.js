import { asyncHandler } from '../middlewares/errorHandler.js'
import { authService } from '../services/authService.js'

const cadastrar = asyncHandler(async (req, res) => {
  const usuario = await authService.cadastrar(req.body)
  return res.status(201).json({ usuario })
})

const login = asyncHandler(async (req, res) => {
  const sessao = await authService.login(req.body)
  return res.status(200).json(sessao)
})

export const cadastro = cadastrar
export const autenticar = login

export { cadastrar, login }

export default { cadastrar, login }
