---
description: "Task list for feature implementation"
---

# Tasks: Carona Univille (versão inicial)

**Input**: Design documents from `/specs/001-carona-univille/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md, `.specify/memory/constitution.md`

**Tests**: Incluídos. A especificação exige verificação automatizada das regras críticas e cobertura mínima de 80% (RNF-004, SC-006, Constitution IV), usando Vitest e Supertest.

**Organization**: Tarefas agrupadas por história de usuário para implementação, teste e entrega independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: obrigatório somente nas fases de User Story (US1–US7)
- Toda tarefa segue rigorosamente `- [ ] T### [P?] [US?] Descrição com caminho de arquivo`
- Descrições incluem caminhos de arquivo exatos e, quando aplicável, restrições do modelo copiadas literalmente de `data-model.md`
- **SQLite driver**: `sqlite3` é o único driver SQLite do projeto; nenhuma alternativa é usada
- **Rastreabilidade**: toda tarefa indica Requisitos com códigos RF/RNF/RN/CA existentes em `spec.md`; infraestrutura sem requisito funcional direto usa o RNF relacionado ou a identificação `infraestrutura compartilhada`

## Path Conventions

- **Web app**: `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`
- **Raiz**: `README.md`, `.gitignore`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicializar a estrutura do projeto, dependências e ferramentas de qualidade.

- [X] T001 Criar estrutura de pastas conforme o plano em `backend/src/db/migrations/`, `backend/src/db/seeds/`, `backend/src/routes/`, `backend/src/controllers/`, `backend/src/services/`, `backend/src/repositories/`, `backend/src/middlewares/`, `backend/src/utils/`, `backend/src/uploads/perfis/`, `backend/tests/unit/`, `backend/tests/integration/`, `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/services/`, `frontend/src/routes/`, `frontend/src/state/` e `frontend/tests/`. Requisitos: RNF-005; infraestrutura compartilhada
- [X] T002 Inicializar projeto backend Node.js/Express com dependências express, sqlite3 como único driver SQLite, bcrypt, jsonwebtoken, dotenv e cors, scripts dev/start e type module em `backend/package.json`. Requisitos: RNF-003, RNF-005; infraestrutura compartilhada
- [X] T003 [P] Inicializar projeto frontend React com Vite, dependências react, react-dom e react-router-dom, scripts dev/build/preview em `frontend/package.json` e entrada HTML em `frontend/index.html`. Requisitos: RNF-001, RNF-005; infraestrutura compartilhada
- [X] T004 [P] Configurar Vitest, Supertest e `@vitest/coverage-v8` com ambiente node, script test e script test:coverage produzindo resumo no terminal e HTML em `backend/coverage/` em `backend/vitest.config.js` e `backend/package.json`. Requisitos: RNF-004, RNF-006
- [X] T005 [P] Configurar Vitest no frontend com script test em `frontend/vitest.config.js` e `frontend/package.json`. Requisitos: RNF-004
- [X] T006 [P] Criar arquivos de ambiente de exemplo com PORT, JWT_SECRET, JWT_EXPIRES_IN=8h, DB_PATH e UPLOAD_DIR no backend e VITE_API_URL no frontend em `backend/.env.example` e `frontend/.env.example`. Requisitos: RNF-002, RNF-003; infraestrutura compartilhada
- [X] T007 [P] Adicionar arquivos de ignore para node_modules, .env, bancos locais, backend/uploads/ e coverage/ em `.gitignore`, `backend/.gitignore` e `frontend/.gitignore`. Requisitos: RNF-002, RNF-005; infraestrutura compartilhada

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura comum que deve estar concluída antes de qualquer User Story.

**CRITICAL**: nenhuma User Story pode começar antes desta fase.

- [X] T008 Implementar conexão sqlite3 com `PRAGMA foreign_keys = ON`, modo de teste isolado por arquivo temporário e helper de transação BEGIN IMMEDIATE em `backend/src/db/connection.js`. Requisitos: RNF-003; infraestrutura compartilhada
- [X] T009 Criar migration base e runner com todas as tabelas e restrições, aplicando literalmente "**matricula** (única, validada contra base local fictícia; imutável após validação)", "**email_institucional** (único)", "**capacidade_passageiros** (inteiro > 0, não inclui motorista). O número de vagas oferecidas na oferta deve respeitar essa capacidade.", "**recorrencia_id** (FK Recorrencia, opcional; nulo para avulsa)", "**paradas** (sequência ordenada: origem, paradas..., destino para fins de percurso)", "**vagas_total** (ajustável sem ficar abaixo das já reservadas), **valor**", "**estado**: `ABERTA` | `EM_ANDAMENTO` | `CONCLUIDA` | `CANCELADA`", "**status**: `CONFIRMADA` | `CANCELADA` | `NO_SHOW`", "**pontos** (1 ou 2 conforme evento), **motivo/tipo_evento**, **referencia** (viagem/reserva)", "**nota** (1–5, sem comentário), **criado_em**" e "Sem bloqueio automático; cancelamentos por exclusão de conta não geram penalidade." em `backend/src/db/migrations/001_init.sql` e `backend/src/db/migrations/run.js`. Requisitos: RF-001, RF-002, RF-006, RF-008, RF-013, RF-019, RF-024, RF-025, RNF-003, RN-001, RN-002, RN-005, RN-008, CA-001, CA-002, CA-004, CA-006, CA-009
- [X] T010 [P] Criar seed da base local de matrículas fictícias aplicando "**matricula** (PK/única)" e "Usada apenas para validação no cadastro; sem integração externa." em `backend/src/db/seeds/matriculasAutorizadas.js` e `backend/src/db/seeds/run.js`. Requisitos: RF-001, RNF-002, RN-001, CA-001
- [X] T011 [P] Implementar middleware de autenticação JWT Bearer com expiração de 8h, validação de assinatura e injeção de req.user em `backend/src/middlewares/auth.js`. Requisitos: RF-001, RF-005, RNF-002
- [X] T012 [P] Implementar validação de entrada, autorização por recurso e tratamento de erros com 400/401/403/404/409/422, sem logar senhas ou dados sensíveis, em `backend/src/middlewares/validate.js`, `backend/src/middlewares/authorize.js` e `backend/src/middlewares/errorHandler.js`. Requisitos: RNF-001, RNF-002, RNF-005, CA-002
- [X] T013 [P] Implementar utilitários de data/horário e percurso ordenado aplicando "**paradas** (sequência ordenada: origem, paradas..., destino para fins de percurso)" e "Busca: janela ±30 min, ordem de pontos no percurso (origem antes do destino), sem raio." em `backend/src/utils/dateTime.js` e `backend/src/utils/percurso.js`. Requisitos: RF-010, RN-004, CA-003
- [X] T014 [P] Implementar serviço e repositório de histórico aplicando "**tipo_evento**, **entidade_tipo/id**, **ator_usuario_id** (opcional)", "**natureza** (ex.: cancelamento comum vs `CANCELAMENTO_EXCLUSAO_CONTA`), **detalhes** (metadados)" e "Registra alterações relevantes (edições de oferta, cancelamentos, no-show, exclusão, início/fim etc.)." em `backend/src/services/historicoService.js` e `backend/src/repositories/historicoRepository.js`. Requisitos: RF-009, RF-016, RF-018, RF-025, RNF-006, RN-005, RN-009, CA-005, CA-009
- [X] T015 Configurar Express com JSON, CORS, arquivos estáticos controlados de uploads, rota de healthcheck, tratamento de erros e mecanismo de montagem de roteadores sem imports de arquivos ainda inexistentes em `backend/src/app.js` e bootstrap em `backend/src/server.js`. Requisitos: RNF-001, RNF-002, RNF-005; infraestrutura compartilhada
- [X] T016 [P] Implementar cliente HTTP base com baseURL por ambiente, interceptação de Bearer token e propagação de erros da API em `frontend/src/services/api.js`. Requisitos: RNF-002, RNF-005; infraestrutura compartilhada
- [X] T017 [P] Implementar estado mínimo de sessão/usuário e guarda de rotas protegidas em `frontend/src/state/auth.js` e `frontend/src/routes/ProtectedRoute.jsx`. Requisitos: RF-005, RNF-002, RNF-005
- [X] T018 Configurar shell da aplicação, navegação principal e registro de rotas iniciais em `frontend/src/main.jsx`, `frontend/src/App.jsx` e `frontend/src/routes/index.jsx`. Requisitos: RNF-001, RNF-005; infraestrutura compartilhada
- [X] T019 [P] Criar helpers de testes de integração com app Express, banco SQLite temporário, migrations, seed e reset entre testes em `backend/tests/integration/helpers/testDb.js` e `backend/tests/integration/helpers/app.js`. Requisitos: RNF-004, RNF-006

**Checkpoint**: foundation pronta; as User Stories podem começar em paralelo, respeitando as dependências naturais.

---

## Phase 3: User Story 1 - Cadastro, perfil e veículo (Priority: P1) MVP

**Goal**: Permitir cadastro com matrícula autorizada, gestão de perfil com foto de perfil do usuário opcional e cadastro de veículos com privacidade de dados pessoais e da placa.

**Independent Test**: Criar conta com matrícula autorizada, rejeitar matrícula não autorizada, editar perfil, adicionar/remover a foto de perfil do usuário, cadastrar veículo e confirmar que a matrícula é imutável, que o perfil público mostra apenas nome, foto de perfil, média das avaliações/"Sem avaliações" e viagens concluídas, e que a placa aparece somente para dono e passageiros com reserva confirmada.

**Escopo de foto (US1)**: a foto tratada nas tarefas abaixo é exclusivamente a foto de perfil do usuário, opcional e que pode ser adicionada ou removida; fotos de veículos estão fora do escopo.

### Tests for User Story 1

> Escrever os testes primeiro e confirmar que falham antes da implementação.

- [X] T020 [P] [US1] Teste de integração de cadastro e login cobrindo matrícula autorizada, matrícula não autorizada, e-mail/matrícula únicos e imutabilidade após validação com "**matricula** (única, validada contra base local fictícia; imutável após validação)" e "**email_institucional** (único)" em `backend/tests/integration/auth.test.js`. Requisitos: RF-001, RF-002, RNF-002, RNF-004, RN-001, CA-001
- [X] T021 [P] [US1] Teste de integração de perfil próprio e público verificando "Perfil público exibe nome, foto, média das avaliações e quantidade de viagens concluídas; matrícula, e-mail, telefone e histórico de penalidades permanecem privados." e "**foto_perfil_path** (opcional, ref. a arquivo local)", onde foto significa exclusivamente foto de perfil do usuário, opcional e adicionável/removível, em `backend/tests/integration/usuario.test.js`. Requisitos: RF-003, RF-004, RNF-002, RNF-004, RN-008, CA-002
- [X] T022 [P] [US1] Teste de integração de veículos verificando "**capacidade_passageiros** (inteiro > 0, não inclui motorista). O número de vagas oferecidas na oferta deve respeitar essa capacidade." e "Placa visível apenas para o dono do veículo e passageiros com reserva confirmada na viagem.", sem qualquer foto de veículo, em `backend/tests/integration/veiculos.test.js`. Requisitos: RF-006, RF-007, RNF-004, RN-002, RN-008, CA-002
- [X] T023 [P] [US1] Teste unitário de validação de upload da foto de perfil do usuário, opcional e adicionável/removível, rejeitando tipos diferentes de JPEG/PNG e arquivos acima de 2 MB conforme a decisão de PEND-002 em `backend/tests/unit/upload.test.js`. Requisitos: RF-003, RNF-002, RNF-004

### Implementation for User Story 1

- [X] T024 [P] [US1] Implementar repositórios de usuário e matrícula autorizada com consultas de perfil público, média de avaliações e contagem de viagens concluídas, aplicando "**nome_completo**, **email_institucional** (único), **senha_hash**, **telefone**" e "**matricula** (única, validada contra base local fictícia; imutável após validação)" em `backend/src/repositories/usuarioRepository.js` e `backend/src/repositories/matriculaRepository.js`. Requisitos: RF-001, RF-002, RF-004, RN-001, RN-008, CA-001, CA-002
- [X] T025 [P] [US1] Implementar repositório de veículos do motorista autenticado aplicando "**marca**, **modelo**, **cor**, **placa**, **ano**" e "**capacidade_passageiros** (inteiro > 0, não inclui motorista). O número de vagas oferecidas na oferta deve respeitar essa capacidade.", sem foto de veículo, em `backend/src/repositories/veiculoRepository.js`. Requisitos: RF-006, RNF-003, RN-002
- [X] T026 [US1] Implementar serviço de auth com hash bcrypt de "**senha_hash**", validação na base fictícia, imutabilidade de "**matricula** (única, validada contra base local fictícia; imutável após validação)" e emissão de JWT de 8h em `backend/src/services/authService.js`. Requisitos: RF-001, RF-002, RNF-002, RN-001, CA-001
- [X] T027 [US1] Implementar serviço de usuário para edição de dados próprios, perfil público somente com nome/foto de perfil/média ou "Sem avaliações"/quantidade de viagens concluídas e ocultação de matrícula, e-mail, telefone e penalidades em `backend/src/services/usuarioService.js`. Requisitos: RF-003, RF-004, RN-008, CA-002
- [X] T028 [US1] Implementar serviço de veículos com CRUD restrito ao dono e validação literal de "**capacidade_passageiros** (inteiro > 0, não inclui motorista). O número de vagas oferecidas na oferta deve respeitar essa capacidade.", sem aceitar foto de veículo, em `backend/src/services/veiculoService.js`. Requisitos: RF-006, RN-002
- [X] T029 [US1] Implementar upload/remoção exclusivamente da foto de perfil do usuário, opcional e adicionável/removível, aceitando somente JPEG/PNG com limite de 2 MB e gravando caminho local em "**foto_perfil_path** (opcional, ref. a arquivo local)" em `backend/src/services/uploadService.js` e `backend/src/middlewares/upload.js`. Requisitos: RF-003, RNF-002, RN-008, CA-002
- [X] T030 [P] [US1] Implementar controllers e rotas de auth (`POST /api/auth/cadastro`, `POST /api/auth/login`) e montá-las no Express em `backend/src/controllers/authController.js`, `backend/src/routes/authRoutes.js` e `backend/src/app.js`. Requisitos: RF-001, RF-002, RN-001, CA-001 
- [ ] T031 [P] [US1] Implementar controllers e rotas de perfil (`GET /api/me`, `PUT /api/me`, `POST /api/me/foto`, `DELETE /api/me/foto`, `GET /api/usuarios/:id/perfil-publico`) exclusivamente para foto de perfil do usuário, opcional e adicionável/removível, e montá-las em `backend/src/controllers/usuarioController.js`, `backend/src/routes/usuarioRoutes.js` e `backend/src/app.js`. Requisitos: RF-003, RF-004, RN-008, CA-002
- [ ] T032 [P] [US1] Implementar controllers e rotas de veículos (`POST/GET/PUT/DELETE /api/veiculos`), sem upload de foto de veículo, e montá-las em `backend/src/controllers/veiculoController.js`, `backend/src/routes/veiculoRoutes.js` e `backend/src/app.js`. Requisitos: RF-006, RN-002
- [ ] T033 [P] [US1] Criar páginas de cadastro e login com mensagens claras de matrícula inválida e campos obrigatórios em `frontend/src/pages/CadastroPage.jsx` e `frontend/src/pages/LoginPage.jsx`. Requisitos: RF-001, RNF-001, RN-001, CA-001
- [ ] T034 [P] [US1] Criar página de perfil com edição, adição/remoção da foto de perfil do usuário e visualização pública somente dos campos permitidos, sem foto de veículo, em `frontend/src/pages/PerfilPage.jsx` e `frontend/src/components/PerfilPublico.jsx`. Requisitos: RF-003, RF-004, RNF-001, RN-008, CA-002
- [ ] T035 [P] [US1] Criar página e formulário de veículos com capacidade de passageiros sem contar o motorista e sem campo de foto em `frontend/src/pages/VeiculosPage.jsx` e `frontend/src/components/VeiculoForm.jsx`. Requisitos: RF-006, RNF-001, RN-002
- [ ] T036 [US1] Integrar auth, perfil (inclusive foto de perfil opcional) e veículos ao cliente API e à navegação protegida em `frontend/src/services/authService.js`, `frontend/src/services/usuarioService.js`, `frontend/src/services/veiculoService.js` e `frontend/src/routes/index.jsx`. Requisitos: RF-001, RF-003, RF-004, RF-005, RF-006, RNF-005

**Checkpoint**: US1 funcional e testável independentemente (MVP).

---

## Phase 4: User Story 2 - Ofertar e buscar caronas (Priority: P1)

**Goal**: Permitir que motoristas criem/editem ofertas e que passageiros encontrem ofertas compatíveis por percurso e horário.

**Independent Test**: Criar oferta com paradas, vagas dentro da capacidade do veículo e valor podendo ser zero; editar antes/depois de reservas conforme regras; buscar com janela de ±30 min e pontos intermediários ordenados; verificar ordenação, situação "Lotada", exclusão da busca ao atingir o horário previsto e registro de alterações no histórico.

### Tests for User Story 2

> Escrever os testes primeiro e confirmar que falham antes da implementação.

- [ ] T037 [P] [US2] Teste unitário de compatibilidade de percurso e janela temporal cobrindo exatamente ±30 min, pontos intermediários e rejeição quando origem vem depois do destino, aplicando "Busca: janela ±30 min, ordem de pontos no percurso (origem antes do destino), sem raio." em `backend/tests/unit/buscaPercurso.test.js`. Requisitos: RF-010, RNF-004, RN-004, CA-003
- [ ] T038 [P] [US2] Teste de integração de criação e edição de oferta cobrindo valor zero, vagas ≤ capacidade, imutabilidade de origem/destino/horário com reservas, ajuste de paradas/vagas e histórico, aplicando "**vagas_total** (ajustável sem ficar abaixo das já reservadas), **valor**" e "Edição pós-reserva: origem/destino/horário imutáveis; vagas >= reservas já confirmadas." em `backend/tests/integration/ofertas.test.js`. Requisitos: RF-008, RF-009, RNF-004, RN-002, RN-003
- [ ] T039 [P] [US2] Teste de integração de busca cobrindo ordenação por proximidade, empate por maior vagas, "Lotada", visibilidade somente a participantes após o horário previsto e exclusão de concluídas/canceladas, aplicando 'Visibilidade: antes do horário na busca (ou "Lotada"); ao atingir horário fora da busca e só participantes; concluídas/canceladas fora da busca.' em `backend/tests/integration/busca.test.js`. Requisitos: RF-011, RF-012, RF-022, RNF-004, RN-009, CA-003, CA-008

### Implementation for User Story 2

- [ ] T040 [P] [US2] Implementar repositório de ofertas com persistência de percurso ordenado, ocorrências avulsas e recorrentes, estados e situações derivadas, aplicando "**recorrencia_id** (FK Recorrencia, opcional; nulo para avulsa)", "**paradas** (sequência ordenada: origem, paradas..., destino para fins de percurso)" e "**estado**: `ABERTA` | `EM_ANDAMENTO` | `CONCLUIDA` | `CANCELADA`" em `backend/src/repositories/ofertaRepository.js`. Requisitos: RF-008, RF-020, RNF-003, RN-002, RN-007
- [ ] T041 [US2] Implementar serviço de ofertas com criação/edição, validação de que "OfertaViagem" respeita "**vagas_total** (ajustável sem ficar abaixo das já reservadas), **valor**", bloqueio de origem/destino/horário após reservas e registro de cada alteração no histórico em `backend/src/services/ofertaService.js`. Requisitos: RF-008, RF-009, RNF-003, RN-002, RN-003
- [ ] T042 [US2] Implementar serviço de busca com filtro por data, janela de ±30 min, ordem dos pontos, situações `LOTADA`/`AGUARDANDO_INICIO`, ordenação por proximidade do horário e desempate por maior quantidade de vagas em `backend/src/services/buscaService.js`. Requisitos: RF-010, RF-011, RF-012, RF-022, RN-004, RN-009, CA-003, CA-008
- [ ] T043 [P] [US2] Implementar controllers e rotas de ofertas (`POST /api/ofertas`, `GET /api/ofertas/busca`, `GET /api/ofertas/:id`, `PUT /api/ofertas/:id`) com a regra "Placa visível apenas para o dono do veículo e passageiros com reserva confirmada na viagem." e montá-las em `backend/src/controllers/ofertaController.js`, `backend/src/routes/ofertaRoutes.js` e `backend/src/app.js`. Requisitos: RF-007, RF-008, RF-009, RN-008, CA-002
- [ ] T044 [P] [US2] Criar página e componente de criação/edição de oferta com origem, paradas ordenadas, destino, data, horário, vagas e valor em `frontend/src/pages/OfertaFormPage.jsx` e `frontend/src/components/PercursoForm.jsx`. Requisitos: RF-008, RNF-001, RN-002, RN-003
- [ ] T045 [P] [US2] Criar página de busca e card de resultado exibindo motorista, avaliações, veículo, percurso, horário, vagas, valor e situação, inclusive "Lotada", em `frontend/src/pages/BuscaPage.jsx` e `frontend/src/components/OfertaCard.jsx`. Requisitos: RF-011, RF-012, RNF-001, CA-003
- [ ] T046 [P] [US2] Criar página de detalhe da oferta e cliente API exibindo placa somente quando autorizado em `frontend/src/pages/OfertaDetalhePage.jsx` e `frontend/src/services/ofertaService.js`. Requisitos: RF-007, RF-011, RNF-001, RN-008, CA-002
- [ ] T047 [US2] Integrar rotas de oferta/busca, estados de carregamento e mensagens de regra de negócio no shell em `frontend/src/routes/index.jsx` e `frontend/src/services/ofertaService.js`. Requisitos: RF-008, RF-010, RF-011, RNF-001, RNF-005

**Checkpoint**: US1 e US2 funcionam independentemente.

---

## Phase 5: User Story 3 - Reservas e capacidade (Priority: P1)

**Goal**: Garantir reserva automática de uma vaga, unicidade de reserva ativa e capacidade nunca excedida, inclusive sob concorrência.

**Independent Test**: Reservar com vaga disponível antes do horário; bloquear segunda reserva ativa do mesmo passageiro na mesma viagem; bloquear reserva após o horário ou com viagem iniciada; simular tentativas simultâneas pela última vaga; cancelar e reservar novamente quando houver vaga e não houver reserva ativa.

### Tests for User Story 3

> Escrever os testes primeiro e confirmar que falham antes da implementação.

- [ ] T048 [P] [US3] Teste de integração de reserva cobrindo confirmação automática, uma vaga por reserva, bloqueio após horário/início, reserva em lotada e re-reserva após cancelamento, aplicando "**Restrições**: no máximo uma reserva ativa por passageiro por viagem (controle transacional); cada reserva = 1 vaga. O passageiro pode cancelar e reservar novamente a mesma viagem, desde que ainda existam vagas e não tenha outra reserva ativa." em `backend/tests/integration/reservas.test.js`. Requisitos: RF-013, RF-014, RF-022, RNF-004, RN-002, RN-009, CA-004
- [ ] T049 [P] [US3] Teste de concorrência com tentativas simultâneas pela última vaga, verificando "Capacidade: `reservas_confirmadas_ativas <= vagas_total <= capacidade_passageiros do veículo`; nunca exceder, inclusive sob concorrência. Vagas oferecidas não podem ultrapassar a capacidade do veículo (sem contar o motorista)." em `backend/tests/integration/reservasConcorrencia.test.js`. Requisitos: RF-014, RNF-003, RNF-004, RN-002, CA-004

### Implementation for User Story 3

- [ ] T050 [P] [US3] Implementar repositório de reservas com consultas de reserva ativa por passageiro/viagem, contagem de ocupantes e persistência de "**status**: `CONFIRMADA` | `CANCELADA` | `NO_SHOW`" e "**natureza_cancelamento** (opcional; ex.: passageiro, motorista, exclusao_conta, ausencia_motorista)" em `backend/src/repositories/reservaRepository.js`. Requisitos: RF-013, RF-014, RNF-003, RN-002, RN-005
- [ ] T051 [US3] Implementar serviço de reservas em transação BEGIN IMMEDIATE que valida elegibilidade/horário, ausência de outra reserva ativa, "reservas confirmadas < vagas_total" e insere `CONFIRMADA`, aplicando literalmente "**Restrições**: no máximo uma reserva ativa por passageiro por viagem (controle transacional); cada reserva = 1 vaga. O passageiro pode cancelar e reservar novamente a mesma viagem, desde que ainda existam vagas e não tenha outra reserva ativa." em `backend/src/services/reservaService.js`. Requisitos: RF-013, RF-014, RNF-003, RN-002, CA-004
- [ ] T052 [US3] Implementar controller e rota `POST /api/ofertas/:id/reservas` com 201 para confirmação e 409 para conflito de capacidade/unicidade ativa, montando-a em `backend/src/controllers/reservaController.js`, `backend/src/routes/reservaRoutes.js` e `backend/src/app.js`. Requisitos: RF-013, RF-014, RNF-001, CA-004
- [ ] T053 [US3] Integrar ação de reservar e feedback de disponibilidade, lotação e conflito em `frontend/src/pages/OfertaDetalhePage.jsx` e `frontend/src/services/reservaService.js`. Requisitos: RF-012, RF-013, RF-014, RNF-001, CA-004

**Checkpoint**: US1–US3 funcionam independentemente.

---

## Phase 6: User Story 4 - Cancelamentos e penalidades (Priority: P1)

**Goal**: Aplicar regras de cancelamento de passageiro e motorista com liberação de vaga, pontuação justa, histórico e sem bloqueio automático.

**Independent Test**: Passageiro cancela com ≥24h sem penalidade, com <24h recebe 1 ponto e libera vaga, após horário não pode cancelar; motorista cancela viagem com reservas, cancelando oferta/reservas e recebendo 1 ponto; todos os eventos aparecem no histórico sem bloquear a conta.

### Tests for User Story 4

> Escrever os testes primeiro e confirmar que falham antes da implementação.

- [ ] T054 [P] [US4] Teste unitário das regras de prazo e pontuação: passageiro ≥24h = 0, <24h = 1, após horário = bloqueado; motorista com reservas = 1, aplicando "Sem bloqueio automático; cancelamentos por exclusão de conta não geram penalidade." em `backend/tests/unit/cancelamentoRegras.test.js`. Requisitos: RF-015, RF-016, RF-025, RNF-004, RN-005, CA-005
- [ ] T055 [P] [US4] Teste de integração de cancelamentos cobrando vaga liberada antes do início, oferta/reservas canceladas pelo motorista, pontos, natureza do cancelamento, histórico e conta ainda ativa em `backend/tests/integration/cancelamentos.test.js`. Requisitos: RF-015, RF-016, RF-025, RNF-004, RN-005, CA-005

### Implementation for User Story 4

- [ ] T056 [P] [US4] Implementar repositório de penalidades aplicando "**id** (PK), **usuario_id** (FK Usuario)", "**pontos** (1 ou 2 conforme evento), **motivo/tipo_evento**, **referencia** (viagem/reserva)" e "Sem bloqueio automático; cancelamentos por exclusão de conta não geram penalidade." em `backend/src/repositories/penalidadeRepository.js`. Requisitos: RF-015, RF-016, RF-024, RF-025, RNF-003, RN-005, CA-005
- [ ] T057 [US4] Implementar serviços de cancelamento e penalidade com limites de 24h, bloqueio após horário, liberação de vaga, pontuação do motorista, naturezas de cancelamento e registro no histórico em `backend/src/services/cancelamentoService.js` e `backend/src/services/penalidadeService.js`. Requisitos: RF-015, RF-016, RF-025, RN-005, CA-005
- [ ] T058 [US4] Implementar controllers e rotas `POST /api/reservas/:id/cancelar` e `POST /api/ofertas/:id/cancelar`, montando-as em `backend/src/controllers/cancelamentoController.js`, `backend/src/routes/reservaRoutes.js`, `backend/src/routes/ofertaRoutes.js` e `backend/src/app.js`. Requisitos: RF-015, RF-016, CA-005
- [ ] T059 [US4] Integrar botões e mensagens de cancelamento com as regras de prazo/penalidade no frontend em `frontend/src/services/cancelamentoService.js`, `frontend/src/pages/OfertaDetalhePage.jsx` e `frontend/src/pages/MinhasViagensPage.jsx`. Requisitos: RF-015, RF-016, RNF-001, CA-005

**Checkpoint**: US1–US4 funcionam independentemente.

---

## Phase 7: User Story 5 - Execução da viagem, no-show e avaliações (Priority: P2)

**Goal**: Controlar início e conclusão, tratar ausências e permitir avaliações apenas em viagens concluídas sem no-show.

**Independent Test**: Ao atingir o horário previsto, a oferta sai da busca e fica visível só aos participantes mesmo sem início registrado; o motorista inicia a partir do horário e conclui; no-show de passageiro gera 2 pontos sem liberar vaga; ausência do motorista cancela viagem/reservas e gera 2 pontos; avaliação 1–5 sem comentários é única por participante e bloqueada quando há no-show.

### Tests for User Story 5

> Escrever os testes primeiro e confirmar que falham antes da implementação.

- [ ] T060 [P] [US5] Teste unitário das transições `ABERTA` → `EM_ANDAMENTO` → `CONCLUIDA`, bloqueio de início antes do horário e derivação de `AGUARDANDO_INICIO` ao atingir o horário sem início em `backend/tests/unit/execucaoViagem.test.js`. Requisitos: RF-017, RF-022, RNF-004, RN-009, CA-008
- [ ] T061 [P] [US5] Teste de integração de início/conclusão e visibilidade após o horário previsto, verificando que a oferta sai da busca, fica visível somente a participantes e não aceita novas reservas em `backend/tests/integration/execucaoViagem.test.js`. Requisitos: RF-017, RF-022, RNF-004, RN-009, CA-008
- [ ] T062 [P] [US5] Teste de integração de no-show de passageiro e ausência de motorista cobrindo status `NO_SHOW`, 2 pontos, vaga não liberada, cancelamento da viagem e histórico, aplicando "No-show de passageiro não libera vaga; viagens com registro de no-show não permitem avaliações." em `backend/tests/integration/noShow.test.js`. Requisitos: RF-018, RF-019, RNF-004, RN-005, RN-006, CA-005, CA-006
- [ ] T063 [P] [US5] Teste de integração de avaliações e reputação cobrindo nota 1–5 sem comentários, uma avaliação por participante por viagem, bloqueio em viagem com no-show, média com uma casa decimal e "Sem avaliações", aplicando "**Restrições**: permitida apenas para viagem concluída sem registro de no-show; uma avaliação por participante por viagem." em `backend/tests/integration/avaliacoes.test.js`. Requisitos: RF-019, RNF-004, RN-006, CA-006

### Implementation for User Story 5

- [ ] T064 [P] [US5] Implementar repositório de avaliações com unicidade por oferta/avaliador e persistência de "**nota** (1–5, sem comentário), **criado_em**" e "**Restrições**: permitida apenas para viagem concluída sem registro de no-show; uma avaliação por participante por viagem." em `backend/src/repositories/avaliacaoRepository.js`. Requisitos: RF-019, RNF-003, RN-006, CA-006
- [ ] T065 [US5] Implementar serviço de execução com transições entre "**estado**: `ABERTA` | `EM_ANDAMENTO` | `CONCLUIDA` | `CANCELADA`", preenchimento de "**iniciada_em** (opcional), **concluida_em** (opcional), **criado_em**, **atualizado_em**" e situação "**AGUARDANDO_INICIO** (horário previsto atingido, não iniciada, não concluída/cancelada)" em `backend/src/services/execucaoViagemService.js`. Requisitos: RF-017, RF-022, RN-009, CA-008
- [ ] T066 [US5] Implementar serviço de no-show aplicando "No-show de passageiro não libera vaga; viagens com registro de no-show não permitem avaliações.", 2 pontos ao passageiro, cancelamento da viagem/reservas por ausência do motorista, 2 pontos ao motorista e histórico em `backend/src/services/noShowService.js`. Requisitos: RF-018, RF-025, RN-005, RN-006, CA-005
- [ ] T067 [US5] Implementar serviço de avaliações validando viagem `CONCLUIDA`, ausência de no-show, nota 1–5 sem comentários, unicidade por participante e cálculo da média com uma casa decimal ou "Sem avaliações" em `backend/src/services/avaliacaoService.js`. Requisitos: RF-019, RN-006, CA-006
- [ ] T068 [US5] Implementar controllers e rotas `POST /api/ofertas/:id/iniciar`, `POST /api/ofertas/:id/concluir`, `POST /api/reservas/:id/no-show`, `POST /api/ofertas/:id/ausencia-motorista` e `POST /api/ofertas/:id/avaliacoes`, montando-as em `backend/src/controllers/execucaoController.js`, `backend/src/controllers/avaliacaoController.js`, `backend/src/routes/ofertaRoutes.js`, `backend/src/routes/reservaRoutes.js` e `backend/src/app.js`. Requisitos: RF-017, RF-018, RF-019, RF-022, CA-008
- [ ] T069 [US5] Integrar ações de iniciar/concluir/no-show/ausência/avaliar e exibição de reputação em `frontend/src/pages/OfertaDetalhePage.jsx`, `frontend/src/pages/MinhasViagensPage.jsx` e `frontend/src/services/avaliacaoService.js`. Requisitos: RF-017, RF-018, RF-019, RNF-001, CA-006, CA-008

**Checkpoint**: US5 funcional e independente sobre ofertas/reservas já testadas.

---

## Phase 8: User Story 6 - Viagens recorrentes e Minhas viagens (Priority: P2)

**Goal**: Gerar e manter ofertas recorrentes idempotentes na janela de 15 dias e permitir consulta das próprias viagens por categoria.

**Independent Test**: Criar recorrência e verificar ofertas individuais independentes em até 15 dias; confirmar que a janela é mantida por rotina na inicialização/periódica e completada ao retomar após indisponibilidade; interromper preservando ofertas criadas; alterar configuração afetando apenas ofertas futuras não geradas; consultar oferecidas, reservadas, concluídas e canceladas em "Minhas viagens" com a visibilidade correta.

### Tests for User Story 6

> Escrever os testes primeiro e confirmar que falham antes da implementação.

- [ ] T070 [P] [US6] Teste de integração de recorrências cobrindo geração idempotente por chave natural recorrência+data/hora, janela de 15 dias, independência de reservas, interrupção e alteração só de futuras, aplicando "Recorrência gera ofertas individuais independentes em janela de até 15 dias; interrupção preserva ofertas criadas; alterações afetam apenas ofertas futuras ainda não geradas." em `backend/tests/integration/recorrencias.test.js`. Requisitos: RF-020, RF-021, RNF-004, RN-007, CA-007
- [ ] T071 [P] [US6] Teste da rotina de garantia de janela simulando inicialização, execução periódica, indisponibilidade e retomada, verificando que pendentes são gerados sem duplicar ocorrências em `backend/tests/integration/recorrenciaJanela.test.js`. Requisitos: RF-020, RNF-003, RNF-004, RN-007, CA-007
- [ ] T072 [P] [US6] Teste de integração de "Minhas viagens" cobrindo tipos oferecidas/reservadas/concluidas/canceladas e visibilidade conforme "'Visibilidade: antes do horário na busca (ou "Lotada"); ao atingir horário fora da busca e só participantes; concluídas/canceladas fora da busca.'" em `backend/tests/integration/minhasViagens.test.js`. Requisitos: RF-022, RF-023, RNF-004, RN-009, CA-008

### Implementation for User Story 6

- [ ] T073 [P] [US6] Implementar repositório de recorrências aplicando "**dias_semana** (representação dos dias), **horario**", "**origem**, **destino**, **paradas** (estrutura ordenada), **vagas**, **valor** (vagas devem respeitar a capacidade do veículo)" e "**ativa** (bool), **janela_dias** (= 15), **criado_em**, **atualizado_em**" em `backend/src/repositories/recorrenciaRepository.js`. Requisitos: RF-020, RF-021, RNF-003, RN-002, RN-007
- [ ] T074 [US6] Implementar serviço de recorrências com criação/alteração/interrupção e geração idempotente aplicando literalmente "Alterações afetam apenas ofertas futuras ainda não geradas; interrupção preserva ofertas já criadas. O sistema deve manter as ofertas dos próximos 15 dias mesmo sem acessos de usuários e atualizar pendentes ao voltar a funcionar (geração idempotente)." em `backend/src/services/recorrenciaService.js`. Requisitos: RF-020, RF-021, RN-007, CA-007
- [ ] T075 [US6] Implementar rotina de garantia da janela de 15 dias na inicialização e por intervalo interno, com idempotência por recorrência+data/hora, em `backend/src/services/recorrenciaScheduler.js` e `backend/src/server.js`. Requisitos: RF-020, RNF-003, RN-007, CA-007
- [ ] T076 [US6] Implementar controllers e rotas `POST /api/recorrencias`, `PUT /api/recorrencias/:id` e `POST /api/recorrencias/:id/interromper`, montando-as em `backend/src/controllers/recorrenciaController.js`, `backend/src/routes/recorrenciaRoutes.js` e `backend/src/app.js`. Requisitos: RF-020, RF-021, CA-007
- [ ] T077 [US6] Implementar serviço, controller e rota `GET /api/minhas-viagens?tipo=oferecidas|reservadas|concluidas|canceladas` com categorias, situações derivadas e visibilidade em `backend/src/services/minhasViagensService.js`, `backend/src/controllers/minhasViagensController.js`, `backend/src/routes/minhasViagensRoutes.js` e `backend/src/app.js`. Requisitos: RF-022, RF-023, RN-009, CA-008
- [ ] T078 [US6] Criar páginas de recorrências e "Minhas viagens" com filtros por categoria e cliente API em `frontend/src/pages/RecorrenciasPage.jsx`, `frontend/src/pages/MinhasViagensPage.jsx` e `frontend/src/services/recorrenciaService.js`. Requisitos: RF-020, RF-021, RF-023, RNF-001, CA-007, CA-008

**Checkpoint**: US6 funcional e independente.

---

## Phase 9: User Story 7 - Exclusão de conta (Priority: P3)

**Goal**: Encerrar a conta com segurança, cancelando futuras sem penalidades, preservando histórico com natureza distinta e anonimizando dados pessoais.

**Independent Test**: Solicitar exclusão; verificar bloqueio de novas ofertas/reservas; confirmar cancelamento automático de viagens/reservas futuras sem penalidades para o solicitante nem afetados; conferir natureza `CANCELAMENTO_EXCLUSAO_CONTA` no histórico; validar remoção/anonimização de dados preservando integridade referencial.

### Tests for User Story 7

> Escrever os testes primeiro e confirmar que falham antes da implementação.

- [ ] T079 [P] [US7] Teste de integração de exclusão de conta cobrando bloqueio de novas ações, cancelamentos futuros sem penalidades, natureza distinta no histórico e "Dados anonimizados na exclusão: campos pessoais removidos/substituídos preservando referências necessárias ao histórico/integridade." em `backend/tests/integration/exclusaoConta.test.js`. Requisitos: RF-024, RF-025, RNF-004, RN-005, RN-009, CA-009

### Implementation for User Story 7

- [ ] T080 [P] [US7] Implementar atualizações no repositório de usuário para anonimizar dados e persistir "**conta_ativa** (bool; false após exclusão/anonimização lógica conforme necessidade)" mantendo FK e histórico íntegros em `backend/src/repositories/usuarioRepository.js`. Requisitos: RF-024, RNF-002, RNF-003, CA-009
- [ ] T081 [US7] Implementar serviço de exclusão que cancela ofertas/reservas futuras com natureza `CANCELAMENTO_EXCLUSAO_CONTA`, aplica "Sem bloqueio automático; cancelamentos por exclusão de conta não geram penalidade.", anonimiza dados e registra histórico em `backend/src/services/exclusaoContaService.js`. Requisitos: RF-024, RF-025, RN-005, RN-009, CA-009
- [ ] T082 [US7] Completar `DELETE /api/me` e reforçar middleware de autenticação para bloquear criação de ofertas/reservas por conta inativa em `backend/src/controllers/usuarioController.js`, `backend/src/routes/usuarioRoutes.js` e `backend/src/middlewares/auth.js`. Requisitos: RF-024, RNF-002, CA-009
- [ ] T083 [US7] Integrar fluxo de exclusão com confirmação e estados pós-exclusão no frontend em `frontend/src/pages/PerfilPage.jsx` e `frontend/src/services/usuarioService.js`. Requisitos: RF-024, RNF-001, CA-009

**Checkpoint**: US7 funcional e independente, com histórico e integridade preservados.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Segurança, cobertura, documentação, rastreabilidade e validação final ponta a ponta.

- [ ] T084 [P] Revisar autorização e visibilidade em todos os endpoints, garantindo "Placa visível apenas para o dono do veículo e passageiros com reserva confirmada na viagem." e nenhuma exposição de matrícula/e-mail/telefone/penalidades em `backend/src/middlewares/authorize.js`, `backend/src/services/usuarioService.js`, `backend/src/services/veiculoService.js` e `backend/src/services/ofertaService.js`. Requisitos: RF-004, RF-007, RNF-002, RN-008, CA-002
- [ ] T085 [P] Revisar validação, sanitização e mensagens de erro em `backend/src/middlewares/validate.js`, `backend/src/middlewares/errorHandler.js`, `backend/src/controllers/authController.js`, `backend/src/controllers/usuarioController.js`, `backend/src/controllers/ofertaController.js` e `backend/src/controllers/reservaController.js`. Requisitos: RNF-001, RNF-002, RNF-005, CA-002
- [ ] T086 Executar suíte completa e gerar relatório de cobertura Vitest com resumo no terminal e HTML em `backend/coverage/`, confirmando meta ≥ 80% em `backend/package.json`. Requisitos: RNF-004, RNF-006
- [ ] T087 Atualizar `README.md` com seção inicial de resultados de testes/cobertura contendo percentuais de linhas/funções/branches/statements, total de testes e comando para gerar/atualizar o relatório em `README.md`. Requisitos: RNF-004, RNF-005, RNF-006
- [ ] T088 [P] Validar os oito cenários ponta a ponta e registrar ajustes em `specs/001-carona-univille/quickstart.md`. Requisitos: RNF-004, RNF-006
- [ ] T089 Revisar rastreabilidade RF/RN/CA ↔ código ↔ testes e fechar o checklist de qualidade em `specs/001-carona-univille/checklists/requirements.md`. Requisitos: RNF-006

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: sem dependências; pode começar imediatamente
- **Phase 2 (Foundational)**: depende da Phase 1 e bloqueia todas as User Stories
- **Phases 3–9 (User Stories)**: dependem da Phase 2; seguem a ordem US1 → US2 → US3 → US4 → US5 → US6 → US7 na entrega sequencial
- **Phase 10 (Polish)**: depende de todas as User Stories desejadas

### User Story Dependencies

- **US1 (P1)**: base de autenticação, perfil e veículos; sem dependência de outras histórias
- **US2 (P1)**: usa usuário/veículo de US1 nos fluxos reais; oferta é pré-requisito funcional de reservas
- **US3 (P1)**: depende de ofertas criadas em US2; testável com fixture de oferta disponível
- **US4 (P1)**: depende de reservas/ofertas de US2/US3
- **US5 (P2)**: depende de ofertas/reservas e regras de horário de US2/US3
- **US6 (P2)**: reutiliza o modelo de ofertas de US2; "Minhas viagens" agrega estados de US2–US5
- **US7 (P3)**: depende de entidades, histórico e regras de cancelamento de US2–US4

### Within Each User Story

- Testes primeiro, confirmando falha antes da implementação
- Repositórios → serviços → controllers/rotas → integração frontend
- Validar o checkpoint da história antes de avançar para a próxima prioridade

### Parallel Opportunities

- Setup: T003, T004, T005, T006, T007
- Foundational: T010, T011, T012, T013, T014, T016, T017, T019 após T008/T009; T015 e T018 são pontos de integração
- US1: T020–T023, T024/T025, T030–T035
- US2: T037–T039, T040, T043–T046
- US3: T048/T049 e T050
- US4: T054/T055 e T056
- US5: T060–T064
- US6: T070–T073
- US7: T079/T080
- Histórias diferentes podem ser executadas em paralelo por devs distintos quando as dependências acima estiverem satisfeitas

---

## Parallel Examples

### Parallel Example: User Story 1

```text
T020 backend/tests/integration/auth.test.js
T021 backend/tests/integration/usuario.test.js
T022 backend/tests/integration/veiculos.test.js
T023 backend/tests/unit/upload.test.js
T024 backend/src/repositories/usuarioRepository.js + backend/src/repositories/matriculaRepository.js
T025 backend/src/repositories/veiculoRepository.js
T033 frontend/src/pages/CadastroPage.jsx + frontend/src/pages/LoginPage.jsx
T034 frontend/src/pages/PerfilPage.jsx + frontend/src/components/PerfilPublico.jsx
T035 frontend/src/pages/VeiculosPage.jsx + frontend/src/components/VeiculoForm.jsx
```

### Parallel Example: User Story 2

```text
T037 backend/tests/unit/buscaPercurso.test.js
T038 backend/tests/integration/ofertas.test.js
T039 backend/tests/integration/busca.test.js
T040 backend/src/repositories/ofertaRepository.js
T043 backend/src/controllers/ofertaController.js + backend/src/routes/ofertaRoutes.js
T044 frontend/src/pages/OfertaFormPage.jsx + frontend/src/components/PercursoForm.jsx
T045 frontend/src/pages/BuscaPage.jsx + frontend/src/components/OfertaCard.jsx
```

### Parallel Example: User Story 3

```text
T048 backend/tests/integration/reservas.test.js
T049 backend/tests/integration/reservasConcorrencia.test.js
T050 backend/src/repositories/reservaRepository.js
```

### Parallel Example: User Story 4

```text
T054 backend/tests/unit/cancelamentoRegras.test.js
T055 backend/tests/integration/cancelamentos.test.js
T056 backend/src/repositories/penalidadeRepository.js
```

### Parallel Example: User Story 5

```text
T060 backend/tests/unit/execucaoViagem.test.js
T061 backend/tests/integration/execucaoViagem.test.js
T062 backend/tests/integration/noShow.test.js
T063 backend/tests/integration/avaliacoes.test.js
T064 backend/src/repositories/avaliacaoRepository.js
```

### Parallel Example: User Story 6

```text
T070 backend/tests/integration/recorrencias.test.js
T071 backend/tests/integration/recorrenciaJanela.test.js
T072 backend/tests/integration/minhasViagens.test.js
T073 backend/src/repositories/recorrenciaRepository.js
```

### Parallel Example: User Story 7

```text
T079 backend/tests/integration/exclusaoConta.test.js
T080 backend/src/repositories/usuarioRepository.js
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Concluir Phase 1 (Setup)
2. Concluir Phase 2 (Foundational)
3. Concluir Phase 3 (US1)
4. Validar US1 independentemente: cadastro, login, perfil com foto de perfil do usuário, veículos e privacidade
5. Entregar/demonstrar o MVP

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → validar → MVP
3. US2 → ofertar/buscar → validar
4. US3 → reservas/capacidade → validar
5. US4 → cancelamentos/penalidades → validar
6. US5 → execução/no-show/avaliações → validar
7. US6 → recorrências/Minhas viagens → validar
8. US7 → exclusão de conta → validar
9. Polish → cobertura ≥ 80%, README e quickstart

### Parallel Team Strategy

1. Equipe conclui Setup + Foundational em conjunto
2. Após a fundação, dividir histórias respeitando as dependências
3. Integrar em cada checkpoint mantendo todas as histórias testáveis de forma independente

---

## Notes

- [P] indica arquivos diferentes e nenhuma dependência de tarefa incompleta
- [USn] rastreia a tarefa até a história correspondente em `spec.md`
- Regras de negócio críticas permanecem no backend em `backend/src/services/`, com persistência SQLite
- Commits devem identificar a tarefa e o requisito RF/RN/CA relacionado
- Nenhuma dependência fora do escopo da v1 deve ser introduzida: pagamentos, mapas, geolocalização, notificações, lista de espera, chat ou sistemas reais da Univille
- A foto tratada na US1 é somente a foto de perfil do usuário; fotos de veículos não fazem parte do escopo

## Tabela de Rastreabilidade

| Tarefa | Requisitos |
|---|---|
| T001 | RNF-005; infraestrutura compartilhada |
| T002 | RNF-003, RNF-005; infraestrutura compartilhada |
| T003 | RNF-001, RNF-005; infraestrutura compartilhada |
| T004 | RNF-004, RNF-006 |
| T005 | RNF-004 |
| T006 | RNF-002, RNF-003; infraestrutura compartilhada |
| T007 | RNF-002, RNF-005; infraestrutura compartilhada |
| T008 | RNF-003; infraestrutura compartilhada |
| T009 | RF-001, RF-002, RF-006, RF-008, RF-013, RF-019, RF-024, RF-025, RNF-003, RN-001, RN-002, RN-005, RN-008, CA-001, CA-002, CA-004, CA-006, CA-009 |
| T010 | RF-001, RNF-002, RN-001, CA-001 |
| T011 | RF-001, RF-005, RNF-002 |
| T012 | RNF-001, RNF-002, RNF-005, CA-002 |
| T013 | RF-010, RN-004, CA-003 |
| T014 | RF-009, RF-016, RF-018, RF-025, RNF-006, RN-005, RN-009, CA-005, CA-009 |
| T015 | RNF-001, RNF-002, RNF-005; infraestrutura compartilhada |
| T016 | RNF-002, RNF-005; infraestrutura compartilhada |
| T017 | RF-005, RNF-002, RNF-005 |
| T018 | RNF-001, RNF-005; infraestrutura compartilhada |
| T019 | RNF-004, RNF-006 |
| T020 | RF-001, RF-002, RNF-002, RNF-004, RN-001, CA-001 |
| T021 | RF-003, RF-004, RNF-002, RNF-004, RN-008, CA-002 |
| T022 | RF-006, RF-007, RNF-004, RN-002, RN-008, CA-002 |
| T023 | RF-003, RNF-002, RNF-004 |
| T024 | RF-001, RF-002, RF-004, RN-001, RN-008, CA-001, CA-002 |
| T025 | RF-006, RNF-003, RN-002 |
| T026 | RF-001, RF-002, RNF-002, RN-001, CA-001 |
| T027 | RF-003, RF-004, RN-008, CA-002 |
| T028 | RF-006, RN-002 |
| T029 | RF-003, RNF-002, RN-008, CA-002 |
| T030 | RF-001, RF-002, RN-001, CA-001 |
| T031 | RF-003, RF-004, RN-008, CA-002 |
| T032 | RF-006, RN-002 |
| T033 | RF-001, RNF-001, RN-001, CA-001 |
| T034 | RF-003, RF-004, RNF-001, RN-008, CA-002 |
| T035 | RF-006, RNF-001, RN-002 |
| T036 | RF-001, RF-003, RF-004, RF-005, RF-006, RNF-005 |
| T037 | RF-010, RNF-004, RN-004, CA-003 |
| T038 | RF-008, RF-009, RNF-004, RN-002, RN-003 |
| T039 | RF-011, RF-012, RF-022, RNF-004, RN-009, CA-003, CA-008 |
| T040 | RF-008, RF-020, RNF-003, RN-002, RN-007 |
| T041 | RF-008, RF-009, RNF-003, RN-002, RN-003 |
| T042 | RF-010, RF-011, RF-012, RF-022, RN-004, RN-009, CA-003, CA-008 |
| T043 | RF-007, RF-008, RF-009, RN-008, CA-002 |
| T044 | RF-008, RNF-001, RN-002, RN-003 |
| T045 | RF-011, RF-012, RNF-001, CA-003 |
| T046 | RF-007, RF-011, RNF-001, RN-008, CA-002 |
| T047 | RF-008, RF-010, RF-011, RNF-001, RNF-005 |
| T048 | RF-013, RF-014, RF-022, RNF-004, RN-002, RN-009, CA-004 |
| T049 | RF-014, RNF-003, RNF-004, RN-002, CA-004 |
| T050 | RF-013, RF-014, RNF-003, RN-002, RN-005 |
| T051 | RF-013, RF-014, RNF-003, RN-002, CA-004 |
| T052 | RF-013, RF-014, RNF-001, CA-004 |
| T053 | RF-012, RF-013, RF-014, RNF-001, CA-004 |
| T054 | RF-015, RF-016, RF-025, RNF-004, RN-005, CA-005 |
| T055 | RF-015, RF-016, RF-025, RNF-004, RN-005, CA-005 |
| T056 | RF-015, RF-016, RF-024, RF-025, RNF-003, RN-005, CA-005 |
| T057 | RF-015, RF-016, RF-025, RN-005, CA-005 |
| T058 | RF-015, RF-016, CA-005 |
| T059 | RF-015, RF-016, RNF-001, CA-005 |
| T060 | RF-017, RF-022, RNF-004, RN-009, CA-008 |
| T061 | RF-017, RF-022, RNF-004, RN-009, CA-008 |
| T062 | RF-018, RF-019, RNF-004, RN-005, RN-006, CA-005, CA-006 |
| T063 | RF-019, RNF-004, RN-006, CA-006 |
| T064 | RF-019, RNF-003, RN-006, CA-006 |
| T065 | RF-017, RF-022, RN-009, CA-008 |
| T066 | RF-018, RF-025, RN-005, RN-006, CA-005 |
| T067 | RF-019, RN-006, CA-006 |
| T068 | RF-017, RF-018, RF-019, RF-022, CA-008 |
| T069 | RF-017, RF-018, RF-019, RNF-001, CA-006, CA-008 |
| T070 | RF-020, RF-021, RNF-004, RN-007, CA-007 |
| T071 | RF-020, RNF-003, RNF-004, RN-007, CA-007 |
| T072 | RF-022, RF-023, RNF-004, RN-009, CA-008 |
| T073 | RF-020, RF-021, RNF-003, RN-002, RN-007 |
| T074 | RF-020, RF-021, RN-007, CA-007 |
| T075 | RF-020, RNF-003, RN-007, CA-007 |
| T076 | RF-020, RF-021, CA-007 |
| T077 | RF-022, RF-023, RN-009, CA-008 |
| T078 | RF-020, RF-021, RF-023, RNF-001, CA-007, CA-008 |
| T079 | RF-024, RF-025, RNF-004, RN-005, RN-009, CA-009 |
| T080 | RF-024, RNF-002, RNF-003, CA-009 |
| T081 | RF-024, RF-025, RN-005, RN-009, CA-009 |
| T082 | RF-024, RNF-002, CA-009 |
| T083 | RF-024, RNF-001, CA-009 |
| T084 | RF-004, RF-007, RNF-002, RN-008, CA-002 |
| T085 | RNF-001, RNF-002, RNF-005, CA-002 |
| T086 | RNF-004, RNF-006 |
| T087 | RNF-004, RNF-005, RNF-006 |
| T088 | RNF-004, RNF-006 |
| T089 | RNF-006 |
