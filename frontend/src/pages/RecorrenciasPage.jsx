import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PercursoForm from '../components/PercursoForm.jsx'
import { listar as listarVeiculos } from '../services/veiculoService.js'
import {
  mensagemErroRecorrencia,
  normalizarDiasSemana,
  normalizarHorario,
  recorrenciaService,
} from '../services/recorrenciaService.js'

export const DIAS_SEMANA = Object.freeze([
  { valor: 1, rotulo: 'Segunda-feira', curto: 'SEG' },
  { valor: 2, rotulo: 'Terça-feira', curto: 'TER' },
  { valor: 3, rotulo: 'Quarta-feira', curto: 'QUA' },
  { valor: 4, rotulo: 'Quinta-feira', curto: 'QUI' },
  { valor: 5, rotulo: 'Sexta-feira', curto: 'SEX' },
  { valor: 6, rotulo: 'Sábado', curto: 'SÁB' },
  { valor: 0, rotulo: 'Domingo', curto: 'DOM' },
])

export const VALORES_INICIAIS_RECORRENCIA = Object.freeze({
  veiculo_id: '',
  dias_semana: [],
  horario: '08:00',
  origem: '',
  paradas: [],
  destino: '',
  vagas: '',
  valor: '0',
})

export function mesmaParada(left, right) {
  return String(left ?? '').trim().toLocaleLowerCase('pt-BR')
    === String(right ?? '').trim().toLocaleLowerCase('pt-BR')
}

function paradasIntermediarias(valor, origem, destino) {
  let paradas = valor
  if (typeof paradas === 'string') {
    try {
      paradas = JSON.parse(paradas)
    } catch {
      paradas = []
    }
  }

  return (Array.isArray(paradas) ? paradas : [])
    .map((ponto) => String(ponto ?? '').trim())
    .filter((ponto) => (
      ponto && !mesmaParada(ponto, origem) && !mesmaParada(ponto, destino)
    ))
}

export function normalizarValoresRecorrencia(dados = {}) {
  const origem = String(dados.origem ?? '').trim()
  const destino = String(dados.destino ?? '').trim()
  const veiculoId = dados.veiculo_id ?? dados.veiculoId ?? dados.veiculo?.id
  const vagas = dados.vagas ?? dados.vagas_total ?? dados.vagasTotal

  return {
    veiculo_id: veiculoId === null || veiculoId === undefined ? '' : String(veiculoId),
    dias_semana: normalizarDiasSemana(dados.dias_semana ?? dados.diasSemana),
    horario: normalizarHorario(dados.horario ?? ''),
    origem,
    destino,
    paradas: paradasIntermediarias(dados.paradas, origem, destino),
    vagas: vagas === null || vagas === undefined ? '' : String(vagas),
    valor: dados.valor === null || dados.valor === undefined ? '' : String(dados.valor),
  }
}

export function validarRecorrencia(valores = {}, veiculos = []) {
  const origem = String(valores.origem ?? '').trim()
  const destino = String(valores.destino ?? '').trim()
  const dias = normalizarDiasSemana(valores.dias_semana)
  const erros = {}

  if (!valores.veiculo_id) erros.veiculo_id = 'Selecione um veículo.'
  if (dias.length === 0) erros.dias_semana = 'Selecione ao menos um dia da semana.'
  if (!normalizarHorario(valores.horario)) erros.horario = 'Informe o horário.'
  if (!origem) erros.origem = 'Informe a origem.'
  if (!destino) erros.destino = 'Informe o destino.'
  if (origem && destino && mesmaParada(origem, destino)) {
    erros.destino = 'O destino deve ser diferente da origem.'
  }

  const paradas = Array.isArray(valores.paradas) ? valores.paradas : []
  if (paradas.some((ponto) => !String(ponto ?? '').trim())) {
    erros.paradas = 'Todas as paradas devem ter um nome.'
  }

  const vagas = Number(valores.vagas)
  if (!Number.isInteger(vagas) || vagas <= 0) {
    erros.vagas = 'Informe um número inteiro de vagas maior que zero.'
  } else {
    const veiculo = veiculos.find((item) => String(item.id) === String(valores.veiculo_id))
    const capacidade = Number(veiculo?.capacidade_passageiros)
    if (Number.isFinite(capacidade) && vagas > capacidade) {
      erros.vagas = `O veículo comporta até ${capacidade} passageiros.`
    }
  }

  const valor = Number(valores.valor)
  if (!Number.isFinite(valor) || valor < 0) {
    erros.valor = 'Informe um valor maior ou igual a zero.'
  }

  return erros
}

export function rotuloDias(dias = []) {
  const selecionados = normalizarDiasSemana(dias)
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  const rotulos = ordem
    .filter((dia) => selecionados.includes(dia))
    .map((dia) => DIAS_SEMANA.find((item) => item.valor === dia)?.curto)
    .filter(Boolean)

  if (rotulos.length === ordem.length) return 'Todos os dias'
  return rotulos.join(', ') || 'Nenhum dia'
}

export function rotuloPercurso(recorrencia = {}) {
  const origem = String(recorrencia.origem ?? '').trim()
  const destino = String(recorrencia.destino ?? '').trim()
  const paradas = paradasIntermediarias(recorrencia.paradas, origem, destino)
  return [origem, ...paradas, destino].filter(Boolean).join(' → ') || 'Viagem recorrente'
}

export function rotuloVeiculo(veiculo) {
  if (!veiculo || typeof veiculo !== 'object') return 'Veículo não informado'
  const nome = [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ')
  return [nome, veiculo.placa].filter(Boolean).join(' - ') || 'Veículo não informado'
}

export function formatarValor(valor) {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return 'R$ 0,00'
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function campoErro(id, mensagem) {
  if (!mensagem) return null
  return (
    <p className="field-error" id={`${id}-erro`} role="alert">
      {mensagem}
    </p>
  )
}

export function RecorrenciasPage() {
  const [veiculos, setVeiculos] = useState([])
  const [valores, setValores] = useState(() => normalizarValoresRecorrencia())
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [recorrencias, setRecorrencias] = useState([])
  const [editandoId, setEditandoId] = useState(null)
  const [processandoId, setProcessandoId] = useState(null)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        const disponiveis = await listarVeiculos()
        if (ativo) setVeiculos(Array.isArray(disponiveis) ? disponiveis : [])
      } catch (error) {
        if (ativo) {
          setErroGeral(mensagemErroRecorrencia(error, 'Não foi possível carregar seus veículos.'))
        }
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  function alterarCampo(campo, valor) {
    setValores((anterior) => ({ ...anterior, [campo]: valor }))
    setErros((anterior) => ({ ...anterior, [campo]: '' }))
    setErroGeral('')
    setSucesso('')
  }

  function alternarDia(dia) {
    setValores((anterior) => ({
      ...anterior,
      dias_semana: anterior.dias_semana.includes(dia)
        ? anterior.dias_semana.filter((item) => item !== dia)
        : normalizarDiasSemana([...anterior.dias_semana, dia]),
    }))
    setErros((anterior) => ({ ...anterior, dias_semana: '' }))
    setErroGeral('')
    setSucesso('')
  }

  function alterarPercurso(percurso) {
    setValores((anterior) => ({ ...anterior, ...percurso }))
    setErros((anterior) => ({ ...anterior, origem: '', destino: '', paradas: '' }))
    setErroGeral('')
    setSucesso('')
  }

  function reiniciarFormulario(veiculoId = '') {
    setValores(normalizarValoresRecorrencia({
      ...VALORES_INICIAIS_RECORRENCIA,
      veiculo_id: veiculoId,
    }))
    setErros({})
    setEditandoId(null)
  }

  function comecarEdicao(recorrencia) {
    setValores(normalizarValoresRecorrencia(recorrencia))
    setErros({})
    setErroGeral('')
    setSucesso('')
    setEditandoId(recorrencia.id)
  }

  async function enviar(evento) {
    evento.preventDefault()

    const errosFormulario = validarRecorrencia(valores, veiculos)
    setErros(errosFormulario)
    setErroGeral('')
    setSucesso('')
    if (Object.keys(errosFormulario).length > 0) return

    const origem = String(valores.origem).trim()
    const destino = String(valores.destino).trim()
    const dados = {
      veiculo_id: Number(valores.veiculo_id),
      dias_semana: normalizarDiasSemana(valores.dias_semana),
      horario: normalizarHorario(valores.horario),
      origem,
      destino,
      paradas: [origem, ...paradasIntermediarias(valores.paradas, origem, destino), destino],
      vagas: Number(valores.vagas),
      valor: Number(valores.valor),
      ativa: true,
    }

    setSalvando(true)
    try {
      const salva = editandoId
        ? await recorrenciaService.alterar(editandoId, dados)
        : await recorrenciaService.criar(dados)
      if (salva?.id) {
        setRecorrencias((anterior) => [
          salva,
          ...anterior.filter((item) => String(item.id) !== String(salva.id)),
        ])
      }
      setSucesso(editandoId
        ? 'Recorrência atualizada. As mudanças valem apenas para ofertas futuras ainda não geradas.'
        : 'Recorrência criada. As ofertas dos próximos 15 dias foram geradas.')
      reiniciarFormulario(valores.veiculo_id)
    } catch (error) {
      setErroGeral(mensagemErroRecorrencia(error, 'Não foi possível salvar a recorrência.'))
    } finally {
      setSalvando(false)
    }
  }

  async function interromper(recorrencia) {
    const recorrenciaId = recorrencia?.id
    if (!recorrenciaId) return

    setProcessandoId(recorrenciaId)
    setErroGeral('')
    setSucesso('')
    try {
      const interrompida = await recorrenciaService.interromper(recorrenciaId)
      setRecorrencias((anterior) => anterior.map((item) => (
        String(item.id) === String(recorrenciaId)
          ? { ...item, ...(interrompida ?? {}), ativa: false }
          : item
      )))
      if (String(editandoId ?? '') === String(recorrenciaId)) {
        reiniciarFormulario(valores.veiculo_id)
      }
      setSucesso('Recorrência interrompida. As ofertas já criadas foram preservadas.')
    } catch (error) {
      setErroGeral(mensagemErroRecorrencia(error, 'Não foi possível interromper a recorrência.'))
    } finally {
      setProcessandoId(null)
    }
  }

  return (
    <section className="recorrencias-page">
      <h1>Recorrências</h1>
      <p>
        Cadastre viagens que se repetem em dias da semana. Cada ocorrência gera uma oferta
        independente na janela de até 15 dias, com reservas e cancelamentos próprios.
      </p>

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

      {carregando ? (
        <p>Carregando veículos...</p>
      ) : (
        <>
          {veiculos.length === 0 && (
            <p>
              Cadastre um veículo antes de criar uma recorrência.{' '}
              <Link to="/veiculos">Ir para veículos</Link>
            </p>
          )}

          <form className="oferta-form" onSubmit={enviar} noValidate>
            <div className="form-field">
              <label htmlFor="recorrencia-veiculo">
                Veículo <span aria-hidden="true">*</span>
              </label>
              <select
                id="recorrencia-veiculo"
                value={valores.veiculo_id}
                onChange={(evento) => alterarCampo('veiculo_id', evento.target.value)}
                disabled={salvando}
                required
                aria-invalid={Boolean(erros.veiculo_id)}
                aria-describedby={erros.veiculo_id ? 'recorrencia-veiculo-erro' : undefined}
              >
                <option value="">Selecione um veículo</option>
                {veiculos.map((veiculo) => (
                  <option key={veiculo.id} value={veiculo.id}>
                    {rotuloVeiculo(veiculo)} ({veiculo.capacidade_passageiros} vagas)
                  </option>
                ))}
              </select>
              {campoErro('recorrencia-veiculo', erros.veiculo_id)}
            </div>

            <fieldset
              className="recorrencia-dias"
              aria-describedby={erros.dias_semana ? 'recorrencia-dias-erro' : undefined}
              disabled={salvando}
            >
              <legend>Dias da semana *</legend>
              <div className="recorrencia-dias-grid">
                {DIAS_SEMANA.map((dia) => (
                  <label key={dia.valor}>
                    <input
                      type="checkbox"
                      checked={valores.dias_semana.includes(dia.valor)}
                      onChange={() => alternarDia(dia.valor)}
                    />
                    {dia.rotulo}
                  </label>
                ))}
              </div>
              {campoErro('recorrencia-dias', erros.dias_semana)}
            </fieldset>

            <PercursoForm
              valores={valores}
              onChange={alterarPercurso}
              erros={erros}
              desabilitado={salvando}
            />

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="recorrencia-horario">
                  Horário <span aria-hidden="true">*</span>
                </label>
                <input
                  id="recorrencia-horario"
                  type="time"
                  value={valores.horario}
                  onChange={(evento) => alterarCampo('horario', evento.target.value)}
                  disabled={salvando}
                  required
                  aria-invalid={Boolean(erros.horario)}
                  aria-describedby={erros.horario ? 'recorrencia-horario-erro' : undefined}
                />
                {campoErro('recorrencia-horario', erros.horario)}
              </div>

              <div className="form-field">
                <label htmlFor="recorrencia-vagas">
                  Vagas oferecidas <span aria-hidden="true">*</span>
                </label>
                <input
                  id="recorrencia-vagas"
                  type="number"
                  min="1"
                  step="1"
                  value={valores.vagas}
                  onChange={(evento) => alterarCampo('vagas', evento.target.value)}
                  disabled={salvando}
                  required
                  aria-invalid={Boolean(erros.vagas)}
                  aria-describedby={erros.vagas ? 'recorrencia-vagas-erro' : undefined}
                />
                {campoErro('recorrencia-vagas', erros.vagas)}
              </div>

              <div className="form-field">
                <label htmlFor="recorrencia-valor">
                  Valor por passageiro <span aria-hidden="true">*</span>
                </label>
                <input
                  id="recorrencia-valor"
                  type="number"
                  min="0"
                  step="0.01"
                  value={valores.valor}
                  onChange={(evento) => alterarCampo('valor', evento.target.value)}
                  disabled={salvando}
                  required
                  aria-invalid={Boolean(erros.valor)}
                  aria-describedby={erros.valor ? 'recorrencia-valor-erro' : undefined}
                />
                {campoErro('recorrencia-valor', erros.valor)}
              </div>
            </div>

            <p className="form-hint">
              Interromper uma recorrência preserva as ofertas já criadas. Alterações na
              configuração afetam somente ofertas futuras ainda não geradas.
            </p>

            <div className="form-actions">
              <button type="submit" disabled={salvando || veiculos.length === 0}>
                {salvando
                  ? 'Salvando...'
                  : editandoId
                    ? 'Atualizar recorrência'
                    : 'Criar recorrência'}
              </button>
              {editandoId && (
                <button
                  type="button"
                  onClick={() => reiniciarFormulario(valores.veiculo_id)}
                  disabled={salvando}
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>

          <section className="recorrencias-resultados" aria-labelledby="recorrencias-titulo">
            <h2 id="recorrencias-titulo">Recorrências cadastradas</h2>
            {recorrencias.length === 0 ? (
              <p>Nenhuma recorrência criada nesta sessão.</p>
            ) : (
              <ul className="ofertas-lista">
                {recorrencias.map((recorrencia) => {
                  const ativa = Boolean(recorrencia.ativa)
                  const veiculo = veiculos.find(
                    (item) => String(item.id) === String(recorrencia.veiculo_id),
                  )
                  const ocupada = processandoId === recorrencia.id

                  return (
                    <li className="oferta-card" key={recorrencia.id}>
                      <div className="oferta-card-cabecalho">
                        <h3>{rotuloPercurso(recorrencia)}</h3>
                        <span className="oferta-situacao">
                          {ativa ? 'Ativa' : 'Interrompida'}
                        </span>
                      </div>
                      <p>
                        {rotuloDias(recorrencia.dias_semana)} às{' '}
                        {normalizarHorario(recorrencia.horario)}
                      </p>
                      <p>
                        {Number(recorrencia.vagas)} vagas · {formatarValor(recorrencia.valor)}
                      </p>
                      <p className="oferta-veiculo">{rotuloVeiculo(veiculo)}</p>
                      <div className="form-actions">
                        <button
                          type="button"
                          onClick={() => comecarEdicao(recorrencia)}
                          disabled={!ativa || salvando || ocupada}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => interromper(recorrencia)}
                          disabled={!ativa || salvando || ocupada}
                        >
                          {ocupada ? 'Interrompendo...' : 'Interromper'}
                        </button>
                        <Link to="/minhas-viagens">Ver viagens geradas</Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}

export default RecorrenciasPage
