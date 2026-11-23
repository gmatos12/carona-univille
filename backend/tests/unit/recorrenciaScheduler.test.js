import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recorrenciaService } from '../../src/services/recorrenciaService.js'
import {
  garantirJanelaRecorrencias,
  iniciarSchedulerRecorrencia,
  pararSchedulerRecorrencia,
} from '../../src/services/recorrenciaScheduler.js'

const AGORA = new Date('2026-01-10T12:00:00.000Z')
const RESULTADO = { recorrencias: 2, geradas: 5, existentes: 7 }

function capturarIntervalo() {
  const executados = []
  const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, ms) => {
    const timer = { unref: vi.fn() }
    executados.push({ callback, ms, timer })
    return timer
  })
  const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
  return { executados, setIntervalSpy, clearIntervalSpy }
}

describe('Agendador de recorrências (RF-024)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    vi.spyOn(recorrenciaService, 'garantirJanela').mockResolvedValue(RESULTADO)
  })

  afterEach(() => {
    pararSchedulerRecorrencia()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('usa a data atual e repassa a conexão informada ao serviço de recorrências', async () => {
    expect(await garantirJanelaRecorrencias()).toEqual(RESULTADO)
    expect(recorrenciaService.garantirJanela).toHaveBeenCalledWith({
      agora: AGORA,
      connection: undefined,
    })

    const conexao = { nome: 'conexao-fake' }
    await garantirJanelaRecorrencias({ agora: new Date('2026-02-01T00:00:00.000Z'), connection: conexao })
    expect(recorrenciaService.garantirJanela).toHaveBeenLastCalledWith({
      agora: new Date('2026-02-01T00:00:00.000Z'),
      connection: conexao,
    })
  })

  it('executa imediatamente com os parâmetros padrão e agenda no intervalo de uma hora', async () => {
    const { executados, setIntervalSpy } = capturarIntervalo()

    const parar = iniciarSchedulerRecorrencia()

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000)
    expect(executados[0].timer.unref).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    await Promise.resolve()
    expect(recorrenciaService.garantirJanela).toHaveBeenCalledWith({
      agora: AGORA,
      connection: undefined,
    })

    parar()
  })

  it('aceita data fixa e permite desativar a execução imediata', async () => {
    const { executados } = capturarIntervalo()
    const agoraFixo = new Date('2025-12-31T23:59:00.000Z')

    const parar = iniciarSchedulerRecorrencia({
      agora: agoraFixo,
      intervalMs: 1000,
      executarImediato: false,
    })

    expect(recorrenciaService.garantirJanela).not.toHaveBeenCalled()
    await executados[0].callback()
    expect(recorrenciaService.garantirJanela).toHaveBeenCalledWith({
      agora: agoraFixo,
      connection: undefined,
    })

    parar()
  })

  it('usa o relógio retornado por uma função e absorve falhas da execução agendada', async () => {
    const { executados } = capturarIntervalo()
    vi.mocked(recorrenciaService.garantirJanela).mockRejectedValueOnce(new Error('indisponível'))
    const agora = () => new Date('2026-04-05T08:30:00.000Z')

    const parar = iniciarSchedulerRecorrencia({ agora, executarImediato: false })

    await expect(executados[0].callback()).resolves.toBeUndefined()
    expect(recorrenciaService.garantirJanela).toHaveBeenCalledWith({
      agora: new Date('2026-04-05T08:30:00.000Z'),
      connection: undefined,
    })

    parar()
  })

  it('não cria um segundo intervalo e permite parar quando não há agendamento ativo', () => {
    const { setIntervalSpy, clearIntervalSpy } = capturarIntervalo()

    const primeiraParada = iniciarSchedulerRecorrencia({ executarImediato: false })
    const segundaParada = iniciarSchedulerRecorrencia({ executarImediato: false })

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(segundaParada).toBeTypeOf('function')

    primeiraParada()
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    expect(() => segundaParada()).not.toThrow()
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('funciona com timers que não expõem unref', () => {
    const { setIntervalSpy } = capturarIntervalo()
    setIntervalSpy.mockReturnValue(42)

    const parar = iniciarSchedulerRecorrencia({ executarImediato: false, intervalMs: 500 })

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 500)
    parar()
  })
})
