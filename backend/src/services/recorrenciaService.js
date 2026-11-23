import { getConnection, withImmediateTransaction } from '../db/connection.js'
import { ApiError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { OfertaRepository } from '../repositories/ofertaRepository.js'
import { RecorrenciaRepository } from '../repositories/recorrenciaRepository.js'
import { VeiculoRepository } from '../repositories/veiculoRepository.js'

const DIA_MS = 24 * 60 * 60 * 1000
const JANELA_DIAS = 15

function idPositivo(value, nome) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${nome} inválido`)
  return n
}
function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}
function parseHorario(horario) {
  const m = String(horario ?? '').match(/^(\d{2}):(\d{2})/)
  if (!m) throw new ValidationError('horario inválido')
  return { hora: Number(m[1]), minuto: Number(m[2]) }
}
function inicioDoDiaUtc(date) {
  const d = new Date(date)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function calcularOcorrenciasJanela(recorrencia, agora = new Date(), janelaDias = JANELA_DIAS) {
  const base = new Date(agora)
  if (Number.isNaN(base.getTime())) throw new ValidationError('agora inválido')
  const dias = Array.isArray(recorrencia?.dias_semana) ? recorrencia.dias_semana.map(Number) : []
  const { hora, minuto } = parseHorario(recorrencia?.horario)
  const inicio = inicioDoDiaUtc(base)
  const limite = new Date(inicio.getTime() + janelaDias * DIA_MS)
  const ocorrencias = []
  for (let i = 0; i <= janelaDias; i += 1) {
    const dia = new Date(inicio.getTime() + i * DIA_MS)
    if (!dias.includes(dia.getUTCDay())) continue
    const dataHora = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), hora, minuto, 0, 0))
    if (dataHora.getTime() < base.getTime()) continue
    if (dataHora.getTime() > limite.getTime() + DIA_MS - 1) continue
    ocorrencias.push(dataHora.toISOString())
  }
  return ocorrencias
}

export class RecorrenciaService {
  constructor({
    recorrencias = new RecorrenciaRepository(),
    ofertas = new OfertaRepository(),
    veiculos = new VeiculoRepository(),
  } = {}) {
    this.recorrencias = recorrencias
    this.ofertas = ofertas
    this.veiculos = veiculos
  }

  async _validarVeiculo(motoristaId, veiculoId, vagas, connection) {
    const veiculo = await this.veiculos.buscarPorId(veiculoId, connection)
    if (!veiculo) throw new NotFoundError('Veículo não encontrado')
    if (Number(veiculo.usuario_id) !== Number(motoristaId)) throw new ForbiddenError('Veículo não pertence ao motorista')
    if (Number(vagas) > Number(veiculo.capacidade_passageiros)) {
      throw new ConflictError('vagas excedem a capacidade do veículo')
    }
    return veiculo
  }

  async criar(motoristaId, dados = {}, connection) {
    const motorista = idPositivo(motoristaId, 'motorista_id')
    const executar = async (tx) => {
      try {
        const payload = { ...dados, motorista_id: motorista, ativa: true, janela_dias: JANELA_DIAS }
        await this._validarVeiculo(motorista, payload.veiculo_id ?? payload.veiculoId, payload.vagas ?? payload.vagas_total, tx)
        const recorrencia = await this.recorrencias.criar(payload, tx)
        const geracao = await this.gerarJanela(recorrencia.id, { agora: new Date(), connection: tx })
        return { recorrencia, ...geracao }
      } catch (error) { traduzirErro(error) }
    }
    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }

  async alterar(id, motoristaId, dados = {}, connection) {
    const recId = idPositivo(id, 'recorrencia_id')
    const motorista = idPositivo(motoristaId, 'motorista_id')
    const executar = async (tx) => {
      try {
        const atual = await this.recorrencias.buscarPorId(recId, tx)
        if (!atual) throw new NotFoundError('Recorrência não encontrada')
        if (Number(atual.motorista_id) !== motorista) throw new ForbiddenError('Sem permissão para alterar recorrência')
        await this._validarVeiculo(motorista, dados.veiculo_id ?? dados.veiculoId ?? atual.veiculo_id, dados.vagas ?? dados.vagas_total ?? atual.vagas, tx)
        const atualizada = await this.recorrencias.atualizar(recId, { ...dados, motorista_id: motorista }, tx)
        // Alterações afetam apenas ofertas futuras ainda não geradas; interrupção preserva ofertas já criadas.
        await this.gerarJanela(recId, { agora: new Date(), connection: tx })
        return atualizada
      } catch (error) { traduzirErro(error) }
    }
    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }

  async interromper(id, motoristaId, connection) {
    const recId = idPositivo(id, 'recorrencia_id')
    const motorista = idPositivo(motoristaId, 'motorista_id')
    const executar = async (tx) => {
      try {
        const atual = await this.recorrencias.buscarPorId(recId, tx)
        if (!atual) throw new NotFoundError('Recorrência não encontrada')
        if (Number(atual.motorista_id) !== motorista) throw new ForbiddenError('Sem permissão para interromper recorrência')
        return await this.recorrencias.interromper(recId, tx)
      } catch (error) { traduzirErro(error) }
    }
    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }

  async gerarJanela(recorrenciaId, { agora = new Date(), connection } = {}) {
    const recId = idPositivo(recorrenciaId, 'recorrencia_id')
    const executar = async (tx) => {
      try {
        const recorrencia = await this.recorrencias.buscarPorId(recId, tx)
        if (!recorrencia) throw new NotFoundError('Recorrência não encontrada')
        if (!recorrencia.ativa) return { recorrencia, geradas: 0, existentes: 0, ofertas: [] }
        const ocorrencias = calcularOcorrenciasJanela(recorrencia, agora, recorrencia.janela_dias ?? JANELA_DIAS)
        let geradas = 0
        let existentes = 0
        const ofertas = []
        for (const dataHoraSaida of ocorrencias) {
          const existente = await this.ofertas.buscarOcorrencia(recId, dataHoraSaida, tx)
          if (existente) { existentes += 1; ofertas.push(existente); continue }
          const criada = await this.ofertas.criarOcorrenciaRecorrente({
            motorista_id: recorrencia.motorista_id,
            veiculo_id: recorrencia.veiculo_id,
            recorrencia_id: recId,
            origem: recorrencia.origem,
            destino: recorrencia.destino,
            paradas: recorrencia.paradas,
            data_hora_saida: dataHoraSaida,
            vagas_total: recorrencia.vagas,
            valor: recorrencia.valor,
            estado: 'ABERTA',
          }, tx)
          geradas += 1
          ofertas.push(criada)
        }
        return { recorrencia, geradas, existentes, ofertas }
      } catch (error) { traduzirErro(error) }
    }
    if (connection) return withImmediateTransaction(connection, executar)
    return withImmediateTransaction(executar)
  }

  async garantirJanela({ agora = new Date(), connection } = {}) {
    const conn = connection || await getConnection()
    const ativas = await this.recorrencias.listarAtivas(conn)
    let geradas = 0
    let existentes = 0
    for (const rec of ativas) {
      const r = await this.gerarJanela(rec.id, { agora, connection: conn })
      geradas += Number(r.geradas || 0)
      existentes += Number(r.existentes || 0)
    }
    return { recorrencias: ativas.length, geradas, existentes }
  }
}

export const recorrenciaService = new RecorrenciaService()
export default RecorrenciaService
