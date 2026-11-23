import { recorrenciaService } from './recorrenciaService.js'

const INTERVALO_PADRAO_MS = 60 * 60 * 1000
let intervalo = null

export async function garantirJanelaRecorrencias({ agora = new Date(), connection } = {}) {
  return recorrenciaService.garantirJanela({ agora, connection })
}

export function iniciarSchedulerRecorrencia({
  agora = () => new Date(),
  intervalMs = INTERVALO_PADRAO_MS,
  executarImediato = true,
} = {}) {
  if (intervalo) return () => pararSchedulerRecorrencia()
  const executar = async () => {
    try { await garantirJanelaRecorrencias({ agora: typeof agora === 'function' ? agora() : agora }) } catch { /* scheduler idempotente: falha será retomada na próxima execução */ }
  }
  if (executarImediato) void executar()
  intervalo = setInterval(executar, intervalMs)
  if (typeof intervalo.unref === 'function') intervalo.unref()
  return () => pararSchedulerRecorrencia()
}

export function pararSchedulerRecorrencia() {
  if (intervalo) clearInterval(intervalo)
  intervalo = null
}

export default { garantirJanelaRecorrencias, iniciarSchedulerRecorrencia, pararSchedulerRecorrencia }
