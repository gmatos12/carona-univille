import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PerfilPage from '../src/pages/PerfilPage.jsx'

const mocks = vi.hoisted(() => ({
  atualizarPerfil: vi.fn(),
  enviarFoto: vi.fn(),
  excluirConta: vi.fn(),
  obterPerfil: vi.fn(),
  perfilPublico: vi.fn(),
  removerFoto: vi.fn(),
  urlFotoPerfil: vi.fn(() => null),
}))

vi.mock('../src/services/usuarioService.js', () => ({
  atualizarPerfil: mocks.atualizarPerfil,
  enviarFoto: mocks.enviarFoto,
  excluirConta: mocks.excluirConta,
  obterPerfil: mocks.obterPerfil,
  perfilPublico: mocks.perfilPublico,
  removerFoto: mocks.removerFoto,
  urlFotoPerfil: mocks.urlFotoPerfil,
}))

const PERFIL = {
  id: 1,
  nome_completo: 'Usuario Teste',
  email_institucional: 'usuario@univille.br',
  telefone: '47999999999',
  foto_perfil_path: null,
}

let container
let root

function selecionarArquivo(input, arquivo) {
  Object.defineProperty(input, 'files', { configurable: true, value: [arquivo] })
  return act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Seleção de foto de perfil', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.obterPerfil.mockResolvedValue(PERFIL)
    mocks.enviarFoto.mockResolvedValue({ ...PERFIL, foto_perfil_path: 'perfil.png' })
    mocks.perfilPublico.mockResolvedValue(PERFIL)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <PerfilPage />
        </MemoryRouter>,
      )
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('envia o arquivo selecionado pelo serviço de foto', async () => {
    const input = container.querySelector('#perfil-foto-input')
    const arquivo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'perfil.png', {
      type: 'image/png',
    })

    await selecionarArquivo(input, arquivo)

    expect(mocks.enviarFoto).toHaveBeenCalledTimes(1)
    expect(mocks.enviarFoto).toHaveBeenCalledWith(arquivo)
    expect(container.textContent).toContain('Foto de perfil atualizada.')
  })

  it('rejeita formato diferente de JPEG ou PNG', async () => {
    const input = container.querySelector('#perfil-foto-input')
    const arquivo = new File([new Uint8Array([1, 2, 3])], 'perfil.gif', { type: 'image/gif' })

    await selecionarArquivo(input, arquivo)

    expect(mocks.enviarFoto).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Use uma imagem JPEG ou PNG.')
  })

  it('rejeita arquivo acima de 2 MB', async () => {
    const input = container.querySelector('#perfil-foto-input')
    const arquivo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'grande.png', {
      type: 'image/png',
    })
    Object.defineProperty(arquivo, 'size', { value: 2 * 1024 * 1024 + 1 })

    await selecionarArquivo(input, arquivo)

    expect(mocks.enviarFoto).not.toHaveBeenCalled()
    expect(container.textContent).toContain('A foto de perfil deve ter no máximo 2 MB.')
  })
})
