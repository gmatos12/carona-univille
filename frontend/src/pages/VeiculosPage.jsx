import { useEffect, useState } from 'react'
import VeiculoForm from '../components/VeiculoForm.jsx'
import api from '../services/api.js'

function extrairVeiculos(resposta) {
  if (Array.isArray(resposta)) return resposta
  return resposta?.veiculos ?? resposta?.data ?? []
}

function extrairVeiculo(resposta) {
  return resposta?.veiculo ?? resposta?.data?.veiculo ?? null
}

function mensagemErro(error, fallback) {
  return typeof error?.message === 'string' && error.message.trim() ? error.message : fallback
}

function mesmoId(a, b) {
  return a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b)
}

export function VeiculosPage() {
  const [veiculos, setVeiculos] = useState([])
  const [veiculoEmEdicao, setVeiculoEmEdicao] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erroGeral, setErroGeral] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        const resposta = await api.get('/veiculos')
        if (ativo) setVeiculos(extrairVeiculos(resposta))
      } catch (error) {
        if (ativo) setErroGeral(mensagemErro(error, 'Não foi possível carregar os veículos.'))
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  function iniciarEdicao(veiculo) {
    setVeiculoEmEdicao(veiculo)
    setErroGeral('')
    setSucesso('')
  }

  function cancelarEdicao() {
    setVeiculoEmEdicao(null)
    setErroGeral('')
  }

  async function salvarVeiculo(dados) {
    setSalvando(true)
    setErroGeral('')
    setSucesso('')

    try {
      if (veiculoEmEdicao) {
        const resposta = await api.put(`/veiculos/${veiculoEmEdicao.id}`, dados)
        const atualizado = extrairVeiculo(resposta) ?? { ...veiculoEmEdicao, ...dados }
        setVeiculos((atual) =>
          atual.map((veiculo) => (mesmoId(veiculo.id, atualizado.id) ? atualizado : veiculo)),
        )
        setVeiculoEmEdicao(null)
        setSucesso('Veículo atualizado com sucesso.')
      } else {
        const resposta = await api.post('/veiculos', dados)
        const criado = extrairVeiculo(resposta)

        if (criado) {
          setVeiculos((atual) => [...atual, criado])
        } else {
          const atualizados = await api.get('/veiculos')
          setVeiculos(extrairVeiculos(atualizados))
        }

        setFormKey((atual) => atual + 1)
        setSucesso('Veículo cadastrado com sucesso.')
      }
      return true
    } catch (error) {
      setErroGeral(mensagemErro(error, 'Não foi possível salvar o veículo.'))
      return false
    } finally {
      setSalvando(false)
    }
  }

  async function removerVeiculo(veiculo) {
    setErroGeral('')
    setSucesso('')

    try {
      await api.delete(`/veiculos/${veiculo.id}`)
      setVeiculos((atual) => atual.filter((item) => !mesmoId(item.id, veiculo.id)))
      if (mesmoId(veiculoEmEdicao?.id, veiculo.id)) setVeiculoEmEdicao(null)
      setSucesso('Veículo removido com sucesso.')
    } catch (error) {
      setErroGeral(mensagemErro(error, 'Não foi possível remover o veículo.'))
    }
  }

  return (
    <section className="veiculos-page">
      <h1>Meus veículos</h1>
      <p>Cadastre os veículos que você usa para oferecer caronas.</p>

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

      <div className="veiculos-layout">
        <section className="veiculos-formulario" aria-labelledby="veiculo-form-titulo">
          <h2 id="veiculo-form-titulo">
            {veiculoEmEdicao ? 'Editar veículo' : 'Cadastrar veículo'}
          </h2>
          <VeiculoForm
            key={veiculoEmEdicao?.id ?? `novo-${formKey}`}
            initialValues={veiculoEmEdicao}
            onSubmit={salvarVeiculo}
            onCancel={veiculoEmEdicao ? cancelarEdicao : undefined}
            submitLabel={veiculoEmEdicao ? 'Atualizar veículo' : 'Cadastrar veículo'}
            erro={erroGeral}
            desabilitado={salvando}
          />
        </section>

        <section className="veiculos-lista" aria-labelledby="veiculos-lista-titulo">
          <h2 id="veiculos-lista-titulo">Veículos cadastrados</h2>

          {carregando && <p>Carregando veículos...</p>}

          {!carregando && veiculos.length === 0 && <p>Nenhum veículo cadastrado.</p>}

          {veiculos.length > 0 && (
            <ul className="veiculos-grid">
              {veiculos.map((veiculo) => (
                <li className="veiculo-card" key={veiculo.id}>
                  <h3>
                    {veiculo.marca} {veiculo.modelo}
                  </h3>
                  <dl>
                    <div>
                      <dt>Cor</dt>
                      <dd>{veiculo.cor}</dd>
                    </div>
                    <div>
                      <dt>Placa</dt>
                      <dd>{veiculo.placa}</dd>
                    </div>
                    <div>
                      <dt>Ano</dt>
                      <dd>{veiculo.ano}</dd>
                    </div>
                    <div>
                      <dt>Capacidade</dt>
                      <dd>{veiculo.capacidade_passageiros} passageiros</dd>
                    </div>
                  </dl>
                  <p className="veiculo-capacidade-nota">O motorista não é contado nessa capacidade.</p>
                  <div className="form-actions">
                    <button type="button" onClick={() => iniciarEdicao(veiculo)}>
                      Editar
                    </button>
                    <button type="button" onClick={() => removerVeiculo(veiculo)}>
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}

export default VeiculosPage
