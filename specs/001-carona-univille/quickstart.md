# Quickstart & Validação: Carona Univille

Guia de preparação e cenários de validação do plano técnico (PoC acadêmica).

## Pré-requisitos
- Node.js (LTS) e npm
- Estrutura em dois módulos: `backend/` (API Express + SQLite) e `frontend/` (React + Vite)
- Dependências principais: Express, driver SQLite, bcrypt, JWT; testes com Vitest e Supertest
- Base local de matrículas fictícias autorizadas disponível no backend via seed

## Configuração
- Backend: copiar `backend/.env.example` para `backend/.env` (`PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DB_PATH`, `UPLOAD_DIR`)
- Frontend: copiar `frontend/.env.example` para `frontend/.env` (`VITE_API_URL`)
- Banco SQLite criado/migrado por `npm run db:setup`; `PRAGMA foreign_keys = ON` é aplicado pela conexão

## Comandos de execução
- Backend: `npm install`, `npm run db:setup`, `npm run dev`
- Frontend: `npm install`, `npm run dev`
- Testes: `npm test` no backend e no frontend; `npm run test:coverage` no backend gera `backend/coverage/index.html` e valida meta ≥ 80%

## Cenários de validação ponta a ponta

1. **Cadastro e perfil**: cadastrar com matrícula autorizada; rejeitar matrícula não autorizada; editar perfil/foto; confirmar imutabilidade da matrícula e privacidade de dados/placa.
2. **Oferta e busca**: criar oferta com paradas; buscar por percurso e horário (±30 min, origem antes do destino); verificar ordenação, exibição "Lotada" e exclusão da busca ao atingir horário previsto (visível só a participantes).
3. **Reserva e concorrência**: confirmar automaticamente com vaga; impedir 2ª reserva do mesmo passageiro e exceder capacidade em tentativas simultâneas; bloquear após horário/início.
4. **Cancelamentos e penalidades**: passageiro ≥24h sem penalidade, <24h com 1 ponto, após horário não permitido; motorista cancela viagem com reservas gera 1 ponto e cancela reservas; histórico registrado sem bloqueio automático.
5. **Execução, no-show e avaliação**: iniciar a partir do horário, concluir; registrar no-show (2 pontos, vaga não liberada para passageiro; ausência do motorista cancela e penaliza motorista); avaliar 1–5 uma vez em concluída sem no-show; reputação com 1 casa decimal ou "Sem avaliações".
6. **Recorrência**: gerar ofertas individuais em janela de 15 dias; independência entre ofertas; interromper preserva criadas; alterações só afetam futuras não geradas.
7. **Minhas viagens e visibilidade**: consultar oferecidas/reservadas/concluídas/canceladas; estados e visibilidade conforme RN-009/RF-022.
8. **Exclusão de conta**: bloquear novas ações, cancelar automaticamente futuras sem penalidades ao solicitante/afetados com natureza distinta no histórico, anonimizar/remover dados pessoais preservando integridade.

## Validação executada (23/11/2026)

Todos os oito cenários passaram com `npx vitest run <suítes>` no diretório `backend`:

| # | Cenário | Suítes | Testes |
| --- | --- | --- | --- |
| 1 | Cadastro e perfil | `auth`, `usuario`, `veiculos`, `minhasViagens` | 31 |
| 2 | Oferta e busca | `ofertas`, `busca`, `buscaPercurso` | 25 |
| 3 | Reserva e concorrência | `reservas`, `reservaService`, `reservasConcorrencia` | 14 |
| 4 | Cancelamentos e penalidades | `cancelamentos`, `cancelamentoRegras` | 10 |
| 5 | Execução, no-show e avaliação | `execucaoViagem`, `noShow`, `avaliacoes` | 10 |
| 6 | Recorrência | `recorrencias`, `recorrenciaJanela`, `recorrenciaScheduler` | 9 |
| 7 | Minhas viagens e visibilidade | `minhasViagens`, `execucaoViagem`, `busca` | 15 |
| 8 | Exclusão de conta | `exclusaoConta`, `cancelamentoRegras` | 7 |

Suíte backend completa: 41 arquivos, 333 testes aprovados. Cobertura: 88,07% statements, 80,88% branches, 92,01% functions e 91,17% lines.

## Rastreabilidade (T089)

| Requisitos | Implementação principal | Testes de verificação |
| --- | --- | --- |
| RF-001 a RF-007, RN-001, RN-008, CA-001, CA-002 | `authService.js`, `usuarioService.js`, `veiculoService.js`, `usuarioRepository.js`, `veiculoRepository.js` | `auth.test.js`, `usuario.test.js`, `veiculos.test.js`, `minhasViagens.test.js` |
| RF-008 a RF-012, RN-002 a RN-004, CA-003 | `ofertaService.js`, `buscaService.js`, `percurso.js`, `dateTime.js` | `ofertas.test.js`, `busca.test.js`, `buscaPercurso.test.js` |
| RF-013 a RF-016, RN-002, RN-005, CA-004, CA-005 | `reservaService.js`, `cancelamentoService.js`, `penalidadeService.js` | `reservas.test.js`, `reservaService.test.js`, `reservasConcorrencia.test.js`, `cancelamentos.test.js`, `cancelamentoRegras.test.js` |
| RF-017 a RF-019, RN-005, RN-006, RN-009, CA-006, CA-008 | `execucaoViagemService.js`, `noShowService.js`, `avaliacaoService.js`, `historicoService.js` | `execucaoViagem.test.js`, `noShow.test.js`, `avaliacoes.test.js` |
| RF-020, RF-021, RN-007, CA-007 | `recorrenciaService.js`, `recorrenciaScheduler.js` | `recorrencias.test.js`, `recorrenciaJanela.test.js`, `recorrenciaScheduler.test.js` |
| RF-022, RF-023, RN-009, CA-008 | `minhasViagensService.js`, `buscaService.js` | `minhasViagens.test.js`, `busca.test.js` |
| RF-024, RF-025, RN-005, CA-009 | `exclusaoContaService.js`, `penalidadeService.js` | `exclusaoConta.test.js`, `cancelamentoRegras.test.js` |
| RNF-001, RNF-002, RNF-005, CA-002 | `validate.js`, `errorHandler.js`, `authorize.js`, repositories com sanitização | `validation.test.js`, `errors.test.js`, `authorize.test.js`, testes de integração de privacidade |
| RNF-004, RNF-006 | `package.json`, `vitest.config.js`, `README.md`, este quickstart | `npm run test:coverage`, matriz desta seção, checklist `checklists/requirements.md` |

Checklist de qualidade: 16/16 itens marcados e sem alterações nesta etapa.

## Critérios de sucesso da validação
- Regras de negócio críticas passam nos testes automatizados (reservas, capacidade, busca rota/horário, cancelamentos, penalidades, avaliações, recorrência, exclusão).
- Cobertura ≥ 80% e nenhuma exposição indevida de dados privados/placa.

## Referências
- Especificação: `spec.md`
- Modelo de dados: `data-model.md`
- Contratos de API: `contracts/`
- Decisões técnicas: `research.md`