import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../src/services/api.js'
import {
  extrairReserva,
  mensagemErroReserva,
  reservaService,
} from '../src/services/reservaService.js'

vi.mock('../src/services/api.js', () => ({
  default: {
    post: vi.fn(),
  },
}))

describe('reservaService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('postula reserva na oferta e extrai a reserva confirmada', async () => {
    const reserva = { id: 12, status: 'CONFIRMADA' }
    api.post.mockResolvedValue({ reserva })

    const resultado = await reservaService.criar(7)

    expect(api.post).toHaveBeenCalledWith('/ofertas/7/reservas', {})
    expect(resultado).toEqual(reserva)
  })

  it('extrai reserva de resposta envelopada', () => {
    const reserva = { id: 9, status: 'CONFIRMADA' }
    expect(extrairReserva({ data: { reserva } })).toEqual(reserva)
  })

  it('traduz conflito e autenticação em mensagens de reserva', () => {
    expect(mensagemErroReserva({ status: 409, message: 'Oferta lotada' })).toBe('Oferta lotada')
    expect(mensagemErroReserva({ status: 401 })).toBe('Entre na sua conta para reservar.')
    expect(mensagemErroReserva({ details: [{ message: 'Já existe reserva ativa' }] })).toBe(
      'Já existe reserva ativa',
    )
  })
})
