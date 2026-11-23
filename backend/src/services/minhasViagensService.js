import { getConnection } from '../db/connection.js'
import { ApiError, ValidationError } from '../middlewares/errorHandler.js'
import {
  ESTADOS,
  OfertaRepository,
  mapearOferta,
} from '../repositories/ofertaRepository.js'
import {
  STATUS as STATUS_RESERVA,
  ReservaRepository,
} from '../repositories/reservaRepository.js'
import { UsuarioRepository } from '../repositories/usuarioRepository.js'
import { parseDateTime } from '../utils/dateTime.js'
import { veiculoService } from './veiculoService.js'

export const TIPOS_MINHAS_VIAGENS = Object.freeze([
  'oferecidas',
  'reservadas',
  'concluidas',
  'canceladas',
])

export const TIPOS = Object.freeze({
  OFERECIDAS: 'oferecidas',
  RESERVADAS: 'reservadas',
  CONCLUIDAS: 'concluidas',
  CANCELADAS: 'canceladas',
})

const STATUS_PARTICIPACAO = Object.freeze([
  STATUS_RESERVA.CONFIRMADA,
  STATUS_RESERVA.NO_SHOW,
])

function inteiroObrigatorio(valor, nome) {
  const numero = Number(valor)
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ValidationError(`${nome} inválido`)
  }
  return numero
}

export function normalizarTipo(filtros = {}) {
  const valor = filtros?.tipo ?? filtros?.categoria
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new ValidationError('tipo é obrigatório')
  }

  const tipo = String(valor).trim().toLowerCase()
  if (!TIPOS_MINHAS_VIAGENS.includes(tipo)) {
    throw new ValidationError(`tipo inválido; use ${TIPOS_MINHAS_VIAGENS.join('|')}`)
  }
  return tipo
}

function resolverAgora(valor) {
  const data = parseDateTime(valor)
  if (!data) throw new ValidationError('agora inválido')
  return data
}

function reservaRelevante(reservas, ofertaId, tipo) {
  const candidatas = reservas.filter((reserva) => Number(reserva.oferta_id) === Number(ofertaId))
  if (candidatas.length === 0) return null

  if (tipo === TIPOS.RESERVADAS) {
    return candidatas.find((reserva) => STATUS_PARTICIPACAO.includes(reserva.status)) ?? null
  }

  return candidatas.reduce((maisRecente, reserva) => (
    Number(reserva.id) > Number(maisRecente.id) ? reserva : maisRecente
  ))
}

function papelDoUsuario(oferta, reserva, usuarioId) {
  const motorista = Number(oferta.motorista_id) === usuarioId
  const passageiro = Boolean(reserva)

  if (motorista && passageiro) return 'motorista_e_passageiro'
  if (motorista) return 'motorista'
  return 'passageiro'
}

function deduplicar(ofertas) {
  const vistas = new Set()
  return ofertas.filter((oferta) => {
    if (vistas.has(Number(oferta.id))) return false
    vistas.add(Number(oferta.id))
    return true
  })
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

export class MinhasViagensService {
  constructor({
    ofertas = new OfertaRepository(),
    reservas = new ReservaRepository(),
    usuarios = new UsuarioRepository(),
    veiculos = veiculoService,
    agora = () => new Date(),
  } = {}) {
    this.ofertas = ofertas
    this.reservas = reservas
    this.usuarios = usuarios
    this.veiculos = veiculos
    this.agora = typeof agora === 'function' ? agora : () => agora
  }

  async listar(usuarioId, filtros = {}, connection) {
    try {
      const tipo = normalizarTipo(filtros)
      const usuario = inteiroObrigatorio(usuarioId, 'usuario_id')
      const agora = resolverAgora(this.agora())
      const conn = connection || await getConnection()
      const reservas = await this.reservas.listarPorPassageiro(usuario, conn)
      const ofertas = await this.buscarOfertas(tipo, usuario, reservas, agora, conn)

      const resultados = await Promise.all(ofertas.map((oferta) => this.formatar({
        oferta,
        usuarioId: usuario,
        reservas,
        tipo,
        conn,
      })))

      return {
        tipo,
        categorias: [...TIPOS_MINHAS_VIAGENS],
        total: resultados.length,
        ofertas: resultados,
        resultados,
      }
    } catch (error) {
      traduzirErro(error)
    }
  }

  async buscarOfertas(tipo, usuarioId, reservas, agora, conn) {
    const filtrosBase = { agora, limit: 500 }

    if (tipo === TIPOS.OFERECIDAS) {
      return this.ofertas.listar({ ...filtrosBase, motorista_id: usuarioId }, conn)
    }

    if (tipo === TIPOS.RESERVADAS) {
      const ids = [
        ...new Set(reservas
          .filter((reserva) => STATUS_PARTICIPACAO.includes(reserva.status))
          .map((reserva) => Number(reserva.oferta_id))),
      ]
      const ofertas = await this.buscarPorIds(ids, agora, conn)
      return deduplicar(ofertas)
    }

    if (tipo === TIPOS.CONCLUIDAS) {
      return this.ofertas.listar({
        ...filtrosBase,
        estados: [ESTADOS.CONCLUIDA],
        participante_id: usuarioId,
      }, conn)
    }

    if (tipo === TIPOS.CANCELADAS) {
      const comoMotorista = await this.ofertas.listar({
        ...filtrosBase,
        motorista_id: usuarioId,
        estados: [ESTADOS.CANCELADA],
      }, conn)
      const ids = [...new Set(reservas.map((reserva) => Number(reserva.oferta_id)))]
      const comoPassageiro = await this.buscarPorIds(ids, agora, conn)

      return deduplicar([
        ...comoMotorista,
        ...comoPassageiro.filter((oferta) => oferta.estado === ESTADOS.CANCELADA),
      ])
    }

    return []
  }

  async buscarPorIds(ids, agora, conn) {
    const ofertas = await Promise.all(ids.map((id) => this.ofertas.buscarPorId(id, conn)))
    return ofertas
      .filter(Boolean)
      .map((oferta) => mapearOferta(oferta, { agora }))
  }

  async formatar({ oferta, usuarioId, reservas, tipo, conn }) {
    const reserva = reservaRelevante(reservas, oferta.id, tipo)
    const [motorista, veiculo] = await Promise.all([
      this.usuarios.perfilPublico(oferta.motorista_id, conn),
      conn.get(
        `SELECT id, marca, modelo, cor, ano, capacidade_passageiros, placa
         FROM veiculos WHERE id = ?`,
        [oferta.veiculo_id],
      ),
    ])

    if (veiculo && !(await this.veiculos.podeVerPlaca(oferta.id, usuarioId, conn))) {
      delete veiculo.placa
    }

    return {
      ...oferta,
      id: Number(oferta.id),
      oferta_id: Number(oferta.id),
      reserva_id: reserva ? Number(reserva.id) : null,
      reserva_status: reserva?.status ?? null,
      categoria: tipo,
      papel: papelDoUsuario(oferta, reserva, usuarioId),
      motorista,
      veiculo,
      visivel_na_busca: Boolean(oferta.visivel_na_busca),
      aceita_reservas: Boolean(oferta.aceita_reservas),
      visivel_para_usuario: true,
    }
  }
}

export const minhasViagensService = new MinhasViagensService()

export default MinhasViagensService
