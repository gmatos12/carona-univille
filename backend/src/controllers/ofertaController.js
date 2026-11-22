import { getConnection } from '../db/connection.js'
import { asyncHandler, NotFoundError } from '../middlewares/errorHandler.js'
import { ofertaRepository } from '../repositories/ofertaRepository.js'
import { usuarioRepository } from '../repositories/usuarioRepository.js'
import { buscaService } from '../services/buscaService.js'
import { ofertaService } from '../services/ofertaService.js'
import { veiculoService } from '../services/veiculoService.js'
import { parseDateTime } from '../utils/dateTime.js'

const criar = asyncHandler(async (req, res) => {
  const oferta = await ofertaService.criar(req.user.id, req.body)
  return res.status(201).json({ oferta })
})

const buscar = asyncHandler(async (req, res) => {
  const filtros = {
    origem: req.query.origem ?? req.query.origem_id,
    destino: req.query.destino ?? req.query.destino_id,
    data: req.query.data ?? req.query.data_saida,
    horario: req.query.horario ?? req.query.hora ?? req.query.horario_saida,
  }
  const resultados = await buscaService.buscar(filtros)
  return res.status(200).json({ resultados })
})

const detalhar = asyncHandler(async (req, res) => {
  const conn = await getConnection()
  const oferta = await ofertaRepository.buscarPorId(req.params.id, conn)
  if (!oferta) throw new NotFoundError('Oferta não encontrada')

  const partida = parseDateTime(oferta.data_hora_saida)
  const antesDaPartida = Boolean(partida && partida.getTime() > Date.now())
  const participante = await ofertaRepository.eParticipante(oferta.id, req.user.id, conn)
  if (!antesDaPartida && !participante) throw new NotFoundError('Oferta não encontrada')

  const motorista = await usuarioRepository.perfilPublico(oferta.motorista_id, conn)
  const veiculo = await conn.get(
    `SELECT v.id, v.marca, v.modelo, v.cor, v.ano, v.capacidade_passageiros, v.placa
     FROM veiculos v
     JOIN ofertas o ON o.veiculo_id = v.id
     WHERE o.id = ?`,
    [oferta.id],
  )
  if (veiculo && !(await veiculoService.podeVerPlaca(oferta.id, req.user.id))) {
    delete veiculo.placa
  }

  return res.status(200).json({ oferta: { ...oferta, motorista, veiculo } })
})

const atualizar = asyncHandler(async (req, res) => {
  const oferta = await ofertaService.atualizar(req.params.id, req.user.id, req.body)
  return res.status(200).json({ oferta })
})

export { criar, buscar, detalhar, atualizar }

export default { criar, buscar, detalhar, atualizar }
