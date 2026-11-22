import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PercursoForm from '../components/PercursoForm.jsx'
import {
  combinarDataHora,
  dividirDataHora,
  mensagemErroOferta,
  ofertaService,
} from '../services/ofertaService.js'
import { listar as listarVeiculos } from '../services/veiculoService.js'

export const VALORES_INICIAIS_OFERTA = Object.freeze({
  veiculo_id: '',
  origem: '',
  paradas: [],
  destino: '',
  data: '',
  horario: '',
  vagas_total: '',
  valor: '0',
})

function mesmaParada(left, right) {
  return String(left ?? '').trim().toLocaleLowerCase('pt-BR')
    === String(right ?? '').trim().toLocaleLowerCase('pt-BR')
}

function paradasIntermediarias(dados) {
  const origem = String(dados.origem ?? '')
  const destino = String(dados.destino ?? '')
  const valor = dados.paradas
  let pontos = []
  if (Array.isArray(valor)) pontos = valor
  else if (typeof valor === 'string') {
    try {
      const analisado = JSON.parse(valor)
      if (Array.isArray(analisado)) pontos = analisado
    } catch {
      pontos = []
    }
  }

  return pontos.filter((ponto) => (
    !mesmaParada(ponto, origem) && !mesmaParada(ponto, destino)
  ))
}

export function normalizarValoresOferta(dados = {}) {
  const datas = dividirDataHora(dados.data_hora_saida)
  const veiculoId = dados.veiculo_id ?? dados.veiculoId ?? ''
  const vagas = dados.vagas_total ?? dados.vagas ?? ''

  return {
    veiculo_id: veiculoId === null || veiculoId === undefined ? '' : String(veiculoId),
    origem: String(dados.origem ?? ''),
    destino: String(dados.destino ?? ''),
    paradas: paradasIntermediarias(dados),
    data: datas.data,
    horario: datas.horario,
    vagas_total: vagas === null || vagas === undefined ? '' : String(vagas),
    valor: dados.valor === null || dados.valor === undefined ? '' : String(dados.valor),
  }
}

export function validarOferta(valores = {}, veiculos = []) {
  const origem = String(valores.origem ?? '').trim()
  const destino = String(valores.destino ?? '').trim()
  const erros = {}

  if (!valores.veiculo_id) erros.veiculo_id = 'Selecione um veículo.'
  if (!origem) erros.origem = 'Informe a origem.'
  if (!destino) erros.destino = 'Informe o destino.'
  if (origem && destino && mesmaParada(origem, destino)) {
    erros.destino = 'O destino deve ser diferente da origem.'
  }

  const paradas = Array.isArray(valores.paradas) ? valores.paradas : []
  if (paradas.some((ponto) => !String(ponto ?? '').trim())) {
    erros.paradas = 'Todas as paradas devem ter um nome.'
  }

  if (!combinarDataHora(valores.data, valores.horario)) {
    erros.data = 'Informe a data.'
    erros.horario = 'Informe o horário.'
  }

  const vagas = Number(valores.vagas_total)
  if (!Number.isInteger(vagas) || vagas <= 0) {
    erros.vagas_total = 'Informe um número inteiro de vagas maior que zero.'
  } else {
    const veiculo = veiculos.find((item) => String(item.id) === String(valores.veiculo_id))
    const capacidade = Number(veiculo?.capacidade_passageiros)
    if (Number.isFinite(capacidade) && vagas > capacidade) {
      erros.vagas_total = `O veículo comporta até ${capacidade} passageiros.`
    }
  }

  const valor = Number(valores.valor)
  if (!Number.isFinite(valor) || valor < 0) {
    erros.valor = 'Informe um valor maior ou igual a zero.'
  }

  return erros
}

function campoErro(id, mensagem) {
  if (!mensagem) return null
  return (
    <p className="field-error" id={`${id}-erro`} role="alert">
      {mensagem}
    </p>
  )
}

export function OfertaFormPage() {
  const { id } = useParams()
  const editando = Boolean(id)
  const [veiculos, setVeiculos] = useState([])
  const [valores, setValores] = useState(() => normalizarValoresOferta())
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        const [veiculosDisponiveis, oferta] = await Promise.all([
          listarVeiculos(),
          editando ? ofertaService.buscarPorId(id) : Promise.resolve(null),
        ])
        if (!ativo) return

        setVeiculos(veiculosDisponiveis ?? [])
        if (oferta) setValores(normalizarValoresOferta(oferta))
      } catch (error) {
        if (ativo) setErroGeral(mensagemErroOferta(error, 'Não foi possível carregar a oferta.'))
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [editando, id])

  function alterarCampo(campo, valor) {
    setValores((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: '', paradas: '' }))
    setErroGeral('')
    setSucesso('')
  }

  function alterarPercurso(percurso) {
    setValores((atual) => ({ ...atual, ...percurso }))
    setErros((atual) => ({ ...atual, origem: '', destino: '', paradas: '' }))
  }

  async function enviar(evento) {
    evento.preventDefault()

    const errosFormulario = validarOferta(valores, veiculos)
    setErros(errosFormulario)
    setErroGeral('')
    setSucesso('')
    if (Object.keys(errosFormulario).length > 0) return

    const origem = String(valores.origem).trim()
    const destino = String(valores.destino).trim()
    const paradas = Array.isArray(valores.paradas)
      ? valores.paradas.map((ponto) => String(ponto).trim()).filter(Boolean)
      : []
    const dados = {
      veiculo_id: Number(valores.veiculo_id),
      origem,
      destino,
      paradas: [origem, ...paradas, destino],
      data_hora_saida: combinarDataHora(valores.data, valores.horario),
      vagas_total: Number(valores.vagas_total),
      valor: Number(valores.valor),
    }

    setSalvando(true)
    try {
      const salva = editando
        ? await ofertaService.atualizar(id, dados)
        : await ofertaService.criar(dados)
      if (salva) setValores(normalizarValoresOferta(salva))
      setSucesso(editando ? 'Oferta atualizada com sucesso.' : 'Oferta criada com sucesso.')
    } catch (error) {
      setErroGeral(mensagemErroOferta(error, 'Não foi possível salvar a oferta.'))
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <section className="oferta-form-page"><p>Carregando oferta...</p></section>

  return (
    <section className="oferta-form-page">
      <h1>{editando ? 'Editar oferta' : 'Nova oferta'}</h1>
      <p>Preencha o percurso em ordem, a data, o horário, as vagas e o valor da carona.</p>

      {erroGeral && (
        <p className="auth-message auth-message-error" role="alert" aria-live="assertive">
          {erroGeral}
        </p>
      )}
      {sucesso && (
        <p className="auth-message auth-message-success" role="status" aria-live="polite">
          {sucesso}
        </p>
      )}

      {veiculos.length === 0 && (
        <p>
          Cadastre um veículo antes de criar uma oferta.{' '}
          <Link to="/veiculos">Ir para veículos</Link>
        </p>
      )}

      <form className="oferta-form" onSubmit={enviar} noValidate>
        <div className="form-field">
          <label htmlFor="oferta-veiculo">
            Veículo <span aria-hidden="true">*</span>
          </label>
          <select
            id="oferta-veiculo"
            value={valores.veiculo_id}
            onChange={(evento) => alterarCampo('veiculo_id', evento.target.value)}
            disabled={salvando}
            required
            aria-invalid={Boolean(erros.veiculo_id)}
            aria-describedby={erros.veiculo_id ? 'oferta-veiculo-erro' : undefined}
          >
            <option value="">Selecione um veículo</option>
            {veiculos.map((veiculo) => (
              <option key={veiculo.id} value={veiculo.id}>
                {veiculo.marca} {veiculo.modelo} - {veiculo.placa} (
                {veiculo.capacidade_passageiros} vagas)
              </option>
            ))}
          </select>
          {campoErro('oferta-veiculo', erros.veiculo_id)}
        </div>

        <PercursoForm
          valores={valores}
          onChange={alterarPercurso}
          erros={erros}
          desabilitado={salvando}
        />

        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="oferta-data">
              Data <span aria-hidden="true">*</span>
            </label>
            <input
              id="oferta-data"
              type="date"
              value={valores.data}
              onChange={(evento) => alterarCampo('data', evento.target.value)}
              disabled={salvando}
              required
              aria-invalid={Boolean(erros.data)}
              aria-describedby={erros.data ? 'oferta-data-erro' : undefined}
            />
            {campoErro('oferta-data', erros.data)}
          </div>

          <div className="form-field">
            <label htmlFor="oferta-horario">
              Horário <span aria-hidden="true">*</span>
            </label>
            <input
              id="oferta-horario"
              type="time"
              value={valores.horario}
              onChange={(evento) => alterarCampo('horario', evento.target.value)}
              disabled={salvando}
              required
              aria-invalid={Boolean(erros.horario)}
              aria-describedby={erros.horario ? 'oferta-horario-erro' : undefined}
            />
            {campoErro('oferta-horario', erros.horario)}
          </div>

          <div className="form-field">
            <label htmlFor="oferta-vagas">
              Vagas oferecidas <span aria-hidden="true">*</span>
            </label>
            <input
              id="oferta-vagas"
              type="number"
              min="1"
              step="1"
              value={valores.vagas_total}
              onChange={(evento) => alterarCampo('vagas_total', evento.target.value)}
              disabled={salvando}
              required
              aria-invalid={Boolean(erros.vagas_total)}
              aria-describedby={erros.vagas_total ? 'oferta-vagas-erro' : undefined}
            />
            {campoErro('oferta-vagas', erros.vagas_total)}
          </div>

          <div className="form-field">
            <label htmlFor="oferta-valor">
              Valor por passageiro <span aria-hidden="true">*</span>
            </label>
            <input
              id="oferta-valor"
              type="number"
              min="0"
              step="0.01"
              value={valores.valor}
              onChange={(evento) => alterarCampo('valor', evento.target.value)}
              disabled={salvando}
              required
              aria-invalid={Boolean(erros.valor)}
              aria-describedby={erros.valor ? 'oferta-valor-erro' : undefined}
            />
            {campoErro('oferta-valor', erros.valor)}
          </div>
        </div>

        <p className="form-hint">
          As vagas não podem ultrapassar a capacidade do veículo; o motorista não é contado.
          Após uma reserva confirmada, origem, destino e horário ficam imutáveis.
        </p>

        <div className="form-actions">
          <button type="submit" disabled={salvando}>
            {editando ? 'Atualizar oferta' : 'Criar oferta'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default OfertaFormPage
