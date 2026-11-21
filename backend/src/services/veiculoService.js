import {
  ApiError,
  NotFoundError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import {
  VeiculoRepository,
  normalizarAtualizacao,
  normalizarVeiculo,
} from '../repositories/veiculoRepository.js'

const CAMPOS_ACEITOS = Object.freeze([
  'marca',
  'modelo',
  'cor',
  'placa',
  'ano',
  'capacidade_passageiros',
  'capacidadePassageiros',
])

function somenteCamposVeiculo(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new ValidationError('Dados de veículo inválidos')
  }

  const limpos = {}
  for (const campo of CAMPOS_ACEITOS) {
    if (dados[campo] !== undefined) limpos[campo] = dados[campo]
  }
  return limpos
}

function traduzirErro(error) {
  if (error instanceof ApiError) throw error
  if (error instanceof TypeError) throw new ValidationError(error.message)
  throw error
}

export class VeiculoService {
  constructor({ veiculos = new VeiculoRepository() } = {}) {
    this.veiculos = veiculos
  }

  async criar(motoristaId, dados, connection) {
    const limpos = somenteCamposVeiculo(dados)

    try {
      normalizarVeiculo(limpos)
      return await this.veiculos.criar(motoristaId, limpos, connection)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async listar(motoristaId, filtros = {}, connection) {
    try {
      return await this.veiculos.listarPorUsuario(motoristaId, filtros, connection)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async buscarPorId(id, motoristaId, connection) {
    try {
      const veiculo = await this.veiculos.buscarPorId(id, motoristaId, connection)
      if (!veiculo) throw new NotFoundError('Veículo não encontrado')
      return veiculo
    } catch (error) {
      traduzirErro(error)
    }
  }

  async atualizar(id, motoristaId, dados, connection) {
    const limpos = somenteCamposVeiculo(dados)

    try {
      normalizarAtualizacao(limpos)
      const veiculo = await this.veiculos.atualizar(id, motoristaId, limpos, connection)
      if (!veiculo) throw new NotFoundError('Veículo não encontrado')
      return veiculo
    } catch (error) {
      traduzirErro(error)
    }
  }

  async excluir(id, motoristaId, connection) {
    try {
      const removido = await this.veiculos.excluir(id, motoristaId, connection)
      if (!removido) throw new NotFoundError('Veículo não encontrado')
      return true
    } catch (error) {
      traduzirErro(error)
    }
  }

  async validarVagas(veiculoId, vagas, motoristaId, connection) {
    try {
      return await this.veiculos.validarVagas(veiculoId, vagas, motoristaId, connection)
    } catch (error) {
      traduzirErro(error)
    }
  }

  async capacidade(veiculoId, motoristaId, connection) {
    try {
      const valor = await this.veiculos.capacidade(veiculoId, motoristaId, connection)
      if (valor === null) throw new NotFoundError('Veículo não encontrado')
      return valor
    } catch (error) {
      traduzirErro(error)
    }
  }

  async podeVerPlaca(ofertaId, usuarioId, connection) {
    try {
      return await this.veiculos.podeVerPlaca(ofertaId, usuarioId, connection)
    } catch (error) {
      traduzirErro(error)
    }
  }
}

export const veiculoService = new VeiculoService()

export default VeiculoService
