# Implementation Plan: Carona Univille (versão inicial)

**Branch**: `001-carona-univille` | **Date**: 2026-11-15 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/001-carona-univille/spec.md`

## Summary

O Carona Univille é uma PoC web para compartilhamento de caronas na comunidade acadêmica, permitindo ofertar viagens, buscar por percurso/horário e reservar vagas, com uma mesma conta atuando como motorista e passageiro. O plano adota arquitetura simples em duas camadas (`frontend` React+Vite e `backend` Node.js+Express) com persistência em SQLite, concentrando regras de negócio e validações no backend. Pontos críticos tratados: autenticação por token, reservas com controle transacional de capacidade/concorrência, geração idempotente de viagens recorrentes (janela 15 dias), visibilidade por horário previsto e histórico de ações (incluindo natureza distinta para cancelamentos por exclusão de conta), com testes automatizados (Vitest/Supertest) visando cobertura ≥ 80% e cuidados de segurança/LGPD.

## Technical Context

**Language/Version**: JavaScript (Node.js LTS para backend; JavaScript no frontend)  
**Primary Dependencies**: Backend: Express, driver SQLite, bcrypt (hash de senha), JWT (autenticação); Frontend: React, Vite  
**Storage**: SQLite (arquivo local), com chaves estrangeiras ativas; arquivos locais para foto de perfil (caminho persistido no banco)  
**Testing**: Vitest (unidade/regras e frontend quando aplicável) e Supertest (integração da API com banco de teste isolado)  
**Target Platform**: Aplicação web (navegador) + API HTTP em ambiente local/servidor Node.js (PoC acadêmica)  
**Project Type**: Web application (`frontend/` + `backend/`)  
**Performance Goals**: Adequados a PoC acadêmica; respostas consistentes para operações típicas e integridade garantida em reservas concorrentes (sem meta de alta escala além do especificado)  
**Constraints**: Stack e escopo fixos pela Constitution/spec; sem pagamentos, mapas/geolocalização, notificações, lista de espera, chat ou integrações externas; dados fictícios; sem dependência de dados em memória; regras críticas no backend  
**Scale/Scope**: Prova de conceito para comunidade acadêmica (escala reduzida), cobrindo fluxos P1–P3 da especificação

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio / Regra | Status | Evidência no plano |
|-------------------|--------|--------------------|
| I. Simplicidade e organização | PASS | Arquitetura web simples (frontend/backend), evolução incremental, sem componentes desnecessários |
| II. Separação de responsabilidades | PASS | UI no frontend; rotas/controladores, serviços de domínio e acesso a dados separados no backend; DB isolado em camada de persistência |
| III. Regras de negócio e persistência no backend | PASS | Validações (reservas, capacidade, busca, cancelamentos, visibilidade, permissões) no backend; SQLite como fonte de verdade |
| IV. Testes e qualidade (≥80%, Vitest/Supertest) | PASS | Estratégia de testes unitários e integração focada em regras críticas; meta de cobertura ≥ 80% |
| V. Privacidade, segurança e escopo controlado | PASS | Hash de senhas, autorização por recurso, ocultação de dados privados/placa, base fictícia, anonimização na exclusão; sem funcionalidades fora de escopo |
| Stack e restrições | PASS | React+Vite, Node.js+Express, SQLite, JavaScript; matrícula por base local fictícia; sem itens fora da v1 |
| Rastreabilidade | PASS | Artefatos de spec/plano/contratos/modelo vinculados; implementação futura deve manter vínculo requisito-tarefa-teste e commits por tarefa |

**Gate (pré-Phase 0)**: PASS. **Re-check (pós-Phase 1)**: PASS — modelo, contratos e quickstart preservam separação, regras no backend, privacidade e testabilidade sem ampliar escopo.

## Project Structure

### Documentation (this feature)

```text
specs/001-carona-univille/
├── plan.md              # Este arquivo
├── research.md          # Decisões técnicas e resolução de pendências
├── data-model.md        # Entidades, relacionamentos e invariantes
├── quickstart.md        # Guia de validação ponta a ponta
├── contracts/
│   └── api.md           # Contrato REST da API
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec
└── tasks.md             # Gerado futuramente por /speckit.tasks (não criado aqui)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── app.js                 # configuração do Express (middlewares, rotas, erros)
│   ├── server.js              # bootstrap do servidor
│   ├── db/
│   │   ├── connection.js      # conexão SQLite, PRAGMA foreign_keys
│   │   ├── migrations/        # criação/evolução de tabelas
│   │   └── seeds/             # base local de matrículas fictícias e dados iniciais
│   ├── routes/                # definição de rotas da API (auth, usuarios, veiculos, ofertas, reservas, recorrencias, minhas-viagens)
│   ├── controllers/           # orquestração HTTP <-> serviços
│   ├── services/              # regras de negócio (reservas/capacidade, busca, cancelamentos/penalidades, recorrencias, avaliações, exclusão)
│   ├── repositories/          # acesso ao SQLite (queries persistentes)
│   ├── middlewares/           # autenticação JWT, autorização, validação, tratamento de erros
│   ├── utils/                 # datas/horários, formatação de percurso, helpers
│   └── uploads/               # armazenamento local de fotos de perfil (fora de controle sensível)
└── tests/
    ├── unit/                  # regras puras e serviços
    └── integration/           # API com Supertest + SQLite de teste isolado

frontend/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── pages/                 # telas (cadastro/login, perfil, veículos, ofertas/busca, detalhe, minhas viagens)
│   ├── components/            # componentes reutilizáveis de UI
│   ├── services/              # cliente HTTP para a API
│   ├── routes/                # rotas de navegação e proteção de acesso
│   └── state/                 # estado de sessão/usuário (mínimo necessário)
└── tests/                     # testes de componentes/regras de apresentação quando aplicável
```

**Structure Decision**: Web application com separação explícita `backend/` e `frontend/`, refletindo a stack da Constitution. O backend concentra domínio (services) e persistência (repositories/db); o frontend consome a API e não replica validações críticas.

## Architecture & Design Details

### Organização frontend, backend e banco de dados
- **Frontend (React + Vite)**: responsável por apresentação, formulários, navegação e consumo da API. Exibe estados derivados fornecidos/validados pelo backend (ex.: "Lotada", visibilidade, elegibilidade) e mensagens claras; não decide regras de negócio críticas.
- **Backend (Node.js + Express)**: expõe API REST, aplica autenticação/autorização, valida entradas e executa todas as regras de negócio em serviços; retorna erros de negócio consistentes.
- **Banco (SQLite)**: persistência durável de usuários, matrículas autorizadas, veículos, recorrências, ofertas, reservas, penalidades, avaliações e histórico. Acesso encapsulado em repositórios; transações para operações críticas.

### Principais entidades e relacionamentos
- **Usuario** (1) — (N) **Veiculo**, **OfertaViagem** (motorista), **Reserva** (passageiro), **Penalidade**, **Avaliacao**.
- **Recorrencia** (1) — (N) **OfertaViagem** (ocorrências independentes, `recorrencia_id` opcional na oferta).
- **OfertaViagem** (1) — (N) **Reserva**, (1) — (N) **Avaliacao**, (N) — (1) **Veiculo**.
- **HistoricoEvento** registra eventos vinculados a usuário/viagem/reserva com tipo e natureza (ex.: cancelamento comum vs exclusão de conta).
- Detalhes completos de atributos, estados e invariantes: [data-model.md](./data-model.md).

### Estrutura das rotas da API
- Organização por recurso/domínio sob prefixo `/api`: `/auth`, `/me`, `/usuarios`, `/veiculos`, `/ofertas` (inclui busca e ações iniciar/concluir/cancelar/no-show/ausência-motorista/avaliações), `/reservas`, `/recorrencias`, `/minhas-viagens`.
- Convenções: verbos HTTP semânticos, rotas protegidas por middleware de autenticação, respostas JSON e códigos de status padronizados (400/401/403/404/409/422).
- Contrato de referência: [contracts/api.md](./contracts/api.md).

### Autenticação e autorização
- Cadastro com validação de matrícula na base local fictícia; senha armazenada com hash (bcrypt), nunca em texto puro. Matrícula imutável após validação (RF-001/002, RN-001).
- Login por e-mail institucional e senha emitindo JWT (Bearer) com expiração definida; middleware valida token e injeta identidade nas rotas protegidas. Autorização por recurso/ação (ex.: apenas motorista dono edita/cancela/inicia/conclui sua oferta; apenas participante elegível avalia; edição de perfil própria).
- Privacidade aplicada nas respostas: perfil público sem dados privados; placa do veículo visível apenas para o dono do veículo e para passageiros com reserva confirmada na viagem; histórico de penalidades privado (RF-004, RF-007, RN-008).
- **Pendências tratadas (proposta)**: PEND-001 — sessão JWT stateless (ex.: 8h) sem recuperação de senha na v1, a confirmar; PEND-002 — foto em arquivo local (JPEG/PNG, limite proposto 2 MB) com caminho no banco, a confirmar.

### Controle de reservas simultâneas
- Reserva executada em transação SQLite (`BEGIN IMMEDIATE`) com verificação atômica, na mesma transação: oferta elegível (não cancelada/concluída, antes do horário programado), verificação de que o passageiro não possui outra reserva ativa na mesma viagem, contagem de vagas ocupadas < vagas totais e inserção/confirmação.
- Garante que a capacidade nunca é excedida e que há no máximo uma reserva ativa por passageiro por viagem, inclusive sob concorrência (RF-013, RF-014, CA-004). Um passageiro pode cancelar e reservar novamente a mesma viagem, desde que ainda existam vagas e não tenha outra reserva ativa.
- O número de vagas oferecidas na criação/edição da oferta deve sempre respeitar a capacidade de passageiros do veículo (sem contar o motorista); vagas ajustadas após reservas não podem ficar abaixo das já reservadas. `PRAGMA foreign_keys = ON` para integridade referencial.

### Geração de viagens recorrentes
- `Recorrencia` guarda configuração; ao criar/reativar são geradas ofertas individuais idempotentes para ocorrências na janela de até 15 dias (chave natural recorrência+data/hora evita duplicação).
- "Garantia de janela": o backend executa verificação/geração idempotente na inicialização e, enquanto em execução, por rotina periódica simples (intervalo interno), mantendo as ofertas dos próximos 15 dias mesmo sem acesso de usuários. Se o sistema ficar indisponível, ao voltar a funcionar a mesma rotina atualiza as ofertas pendentes, completando a janela de 15 dias sem duplicar ocorrências já geradas.
- Interrupção preserva ofertas já criadas; alterações afetam somente ofertas futuras ainda não geradas; cada oferta é independente (RF-020, RF-021, RN-007).

### Histórico de ações e regras de visibilidade/tempo
- `HistoricoEvento` registra alterações e acontecimentos relevantes (criação/edição de oferta, cancelamentos, no-show, início/fim, exclusão) com tipo, entidade, ator e natureza.
- Cancelamentos automáticos por exclusão de conta usam natureza distinta (`CANCELAMENTO_EXCLUSAO_CONTA`/equivalente), não geram penalidades para solicitante nem afetados e não são tratados como cancelamentos comuns (RF-024, RN-005, RN-009, CA-009).
- Viagens com qualquer registro de no-show não permitem avaliações entre os participantes (RF-019, RN-006).
- Visibilidade/aceite de reservas derivados no backend pelo horário atual: antes do horário previsto aparece na busca (ou "Lotada"); ao atingir o horário previsto sai da busca e fica visível só a participantes mesmo sem início registrado, sem novas reservas; concluídas/canceladas fora da busca (RF-017, RF-022, RN-009, PEND-003 tratado por estados persistidos + situações derivadas).

## Testing Strategy

- **Ferramentas**: Vitest (unitários/serviços e, quando aplicável, frontend) e Supertest (integração HTTP da API).
- **Ambiente**: banco SQLite de teste isolado (arquivo temporário ou em memória) com migrações/seed controlado por suíte; reset entre testes para independência.
- **Foco em regras críticas (prioridade)**: reservas e capacidade sob concorrência simulada, unicidade de reserva ativa por passageiro/viagem (incluindo cancelamento e nova reserva), vagas respeitando capacidade do veículo, busca por percurso e janela ±30 min com ordenação, cancelamentos e prazos (≥24h, <24h, após horário), penalidades e naturezas (incluindo exclusão sem penalidade), no-show, avaliações e reputação (bloqueio em viagens com no-show), recorrência (janela 15 dias, idempotência, garantia mesmo sem acessos e atualização de pendentes ao retomar), visibilidade ao atingir horário e exclusão/anonimização.
- **Cobertura e relatório**: meta global mínima de 80% do projeto, medida no backend (e complementada no frontend quando houver lógica relevante), com atenção especial aos serviços de domínio. A cobertura será gerada com Vitest usando provider de cobertura (ex.: `v8`/`@vitest/coverage-v8`) via comando de teste com cobertura (ex.: `npm run test:coverage` no backend), produzindo relatório em terminal (resumo de linhas/funções/branches/statements) e relatório em HTML (ex.: pasta `coverage/`) para consulta detalhada.
- **Apresentação no README**: no início do `README.md` deverá constar uma seção de resultados de testes/cobertura com o resumo mais recente (percentuais e total de testes, conforme saída do Vitest) e indicação de como gerar/atualizar o relatório; a atualização desses resultados acompanha a evolução dos testes do projeto.
- **Rastreabilidade**: casos de teste vinculados aos RF/RN/CA da especificação.

## Security & LGPD

- Senhas com hash seguro (bcrypt); tokens com expiração; validação e sanitização de entradas no backend; tratamento de erros sem vazar dados sensíveis.
- Minimização e controle de acesso: dados pessoais privados e placa expostos apenas conforme regras; não registrar segredos/dados sensíveis em logs.
- Base de matrículas exclusivamente fictícia/local; nenhum dado real de estudantes.
- Exclusão de conta: bloqueio de novas ações, cancelamento automático de futuras sem penalidades indevidas, remoção/anonimização de dados pessoais preservando histórico e integridade referencial.
- Escopo restrito à v1 aprovada, sem integrações externas de pagamento/mapas/geolocalização/notificações.

## Complexity Tracking

> Nenhuma violação de Constitution identificada; tabela sem itens.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |