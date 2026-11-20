# Research: Carona Univille (Plano técnico)

**Feature**: `specs/001-carona-univille/spec.md`  
**Date**: 2026-11-15

## Decisões e justificativas

### 1. Autenticação e sessão (PEND-001)
- **Decision**: Autenticação por e-mail institucional + senha, com emissão de token JWT (Bearer) de curta/média duração (ex.: 8h) após login; senha armazenada com hash seguro (bcrypt). Rotas protegidas exigem token válido; identidade do usuário vem do token no backend.
- **Rationale**: Simples para PoC, stateless, adequado a API REST e fácil de testar com Supertest; mantém validação de acesso no backend (Constitution III). Senha nunca em texto puro (LGPD/segurança).
- **Alternatives considered**: Sessão server-side em tabela (mais estado/complexidade); cookies HttpOnly (válido, mas exige cuidado com CORS em dev). Recuperação de senha fica fora do escopo da v1 (não especificada) e deve ser tratada em etapa futura sem alterar regras aprovadas.

### 2. Foto de perfil (PEND-002)
- **Decision**: Armazenar foto como arquivo local no backend (diretório de uploads versionado fora do código-fonte sensível, ex.: `backend/uploads/perfis/`) e guardar apenas o caminho/identificador no banco; aceitar formatos JPEG e PNG com limite de 2 MB.
- **Rationale**: Evita inflar o SQLite com blobs, facilita exibição via URL servida pelo backend e atende privacidade (dado pessoal controlado). Limites simples previnem abuso em PoC.
- **Alternatives considered**: Base64 no SQLite (simples, mas ineficiente); armazenamento externo (fora de escopo). Detalhes finais de validação de tipo/tamanho ficam registrados como proposta técnica.

### 2.1. Vagas, placa e re-reserva (ajustes)
- **Decision**: Validar no backend que o número de vagas da oferta (criação/edição) não ultrapassa a capacidade de passageiros do veículo (sem contar o motorista) e que ajustes não fiquem abaixo das reservas já confirmadas. Expor a placa do veículo apenas ao dono do veículo e a passageiros com reserva confirmada na viagem. Considerar unicidade como "reserva ativa" por passageiro/viagem, permitindo cancelar e reservar novamente a mesma viagem desde que haja vagas e não exista outra reserva ativa.
- **Rationale**: Garante consistência com o veículo, reforça privacidade da placa e explicita o fluxo de cancelamento seguido de nova reserva sem violar capacidade/unicidade ativa.

### 3. Estado/visibilidade "em andamento" e horário de saída (PEND-003, RN-009, RF-017/RF-022)
- **Decision**: Modelar situação da oferta com estados persistidos principais (`ABERTA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`) e tratar `LOTADA` e `AGUARDANDO_INICIO` como situações derivadas por regra: `LOTADA` quando vagas disponíveis = 0 e antes do horário; `AGUARDANDO_INICIO` quando horário previsto atingido, não iniciada, não concluída e não cancelada. A visibilidade na busca e a aceitação de reservas são sempre avaliadas no backend pelo horário atual vs horário previsto e pelo estado.
- **Rationale**: Reflete fielmente a regra "ao atingir o horário previsto sai da busca e fica visível só aos participantes, mesmo sem início registrado" sem depender de ação do motorista; mantém regras centralizadas no backend.
- **Alternatives considered**: Job que muda estado no horário exato (complexidade desnecessária para PoC). A representação exata do rótulo exibido em "Minhas viagens" segue derivação acima.

### 4. Controle de reservas simultâneas e capacidade (RF-013, RF-014, RNF-003)
- **Decision**: Executar reserva em transação SQLite com modo que serialize escritas (ex.: `BEGIN IMMEDIATE`) e, dentro da mesma transação: validar elegibilidade/horário, verificar que o passageiro não possui outra reserva ativa na mesma viagem, contar reservas confirmadas/ocupantes válidos vs capacidade e inserir reserva; confirmar apenas se consistente. A oferta deve respeitar a capacidade de passageiros do veículo (sem contar o motorista). Habilitar `PRAGMA foreign_keys = ON`.
- **Rationale**: SQLite é single-writer; transação imediata evita corrida entre leitores/escritores na checagem de capacidade, garantindo que nunca exceda e unicidade de reserva ativa por passageiro/viagem, permitindo novo registro após cancelamento quando houver vaga.
- **Alternatives considered**: Controle só em memória (proibido pela Constitution); locks otimistas complexos (desnecessários aqui).

### 5. Geração de viagens recorrentes (RF-020, RF-021, RN-007)
- **Decision**: Entidade `Recorrencia` armazena configuração (dias da semana, horário, origem, destino, paradas, vagas, valor, veículo, ativa). Ao criar/reativar, gerar ofertas individuais idempotentes para as ocorrências dentro da janela de até 15 dias. A "garantia de janela" é executada na inicialização do backend e, enquanto em execução, por rotina periódica interna simples, mantendo as ofertas dos próximos 15 dias mesmo sem acesso de usuários; se o sistema ficar indisponível, ao voltar a funcionar a mesma rotina idempotente atualiza as ofertas pendentes e completa a janela sem duplicar ocorrências já geradas. Interromper marca recorrência inativa sem alterar ofertas existentes; alterações afetam apenas gerações futuras.
- **Rationale**: Mantém ofertas independentes e a janela de 15 dias de forma contínua e resiliente a indisponibilidade, com simplicidade compatível à PoC.
- **Alternatives considered**: Cron/job externo do sistema operacional (infra adicional). A idempotência usa chave natural (recorrência + data/hora da ocorrência).

### 6. Histórico de ações e cancelamentos por exclusão (RF-024, RN-005, RN-009)
- **Decision**: Tabela/eventos de `Historico` registrando tipo de evento, ator/contexto, entidade afetada (viagem/reserva/usuário), motivo/natureza (ex.: `CANCELAMENTO_EXCLUSAO_CONTA` distinto de cancelamento comum), data/hora e metadados necessários. Cancelamentos por exclusão marcam reservas/viagens como canceladas com natureza específica e não geram registros de penalidade.
- **Rationale**: Atende rastreabilidade e diferenciação exigida sem confundir com penalidades ou cancelamentos comuns.
- **Alternatives considered**: Apenas campos de status sem trilha (insuficiente para auditoria/histórico exigido).

### 7. Busca por rota e horário (RF-010, RF-011, RN-004)
- **Decision**: Persistir percurso como sequência ordenada de pontos (origem, paradas ordenadas, destino). A busca filtra no backend por data, janela de ±30 minutos em relação ao horário desejado e por compatibilidade de percurso: localizar índice do ponto de origem do passageiro e do destino na sequência da oferta e aceitar apenas se origem encontrada, destino encontrado e índice(origem) < índice(destino). Ordenar por proximidade do horário e, em empate, por maior vagas disponíveis.
- **Rationale**: Implementa regra de pontos intermediários e ordem sem geolocalização; lógica testável e centralizada no backend.
- **Alternatives considered**: Busca geoespacial/raio (fora de escopo).

### 8. Estratégia de testes e cobertura (RNF-004, Constitution IV)
- **Decision**: Usar Vitest para testes unitários e de serviços/regras no backend e, quando aplicável, no frontend; Supertest para testes de integração da API Express contra banco SQLite de teste isolado (arquivo temporário ou em memória) com setup/teardown por suíte. Cobrir prioritariamente: reservas/capacidade/concorrência simulada (incluindo cancelamento e nova reserva), vagas limitadas à capacidade do veículo, busca rota/horário, cancelamentos, penalidades, no-show e bloqueio de avaliações em viagens com no-show, recorrência (janela 15 dias, garantia contínua e atualização de pendentes ao retomar) e exclusão de conta. Meta de cobertura global ≥ 80%.
- **Rationale**: Ferramentas definidas na Constitution; integração via Supertest valida regras no backend fim a fim.
- **Relatório de cobertura (Vitest)**: gerar com provider de cobertura do Vitest (ex.: `@vitest/coverage-v8`), por script de execução com cobertura (ex.: `npm run test:coverage` no backend), produzindo saída resumida no terminal (linhas/funções/branches/statements e total de testes) e relatório HTML detalhado (ex.: diretório `coverage/`). O `README.md` deve apresentar, no início, uma seção com o resumo mais recente da cobertura e dos testes e a instrução para gerar/atualizar o relatório.
- **Alternatives considered**: E2E de UI completo (útil, mas não obrigatório; foco nas regras críticas).

### 9. Segurança e LGPD (RNF-002, Constitution V)
- **Decision**: Hash de senha (bcrypt), validação/sanitização de entradas no backend, autorização por recurso (ex.: editar própria oferta/perfil), ocultação de campos privados e placa conforme regras, não logar senhas/dados sensíveis, base de matrículas fictícia local, anonimização/remoção de dados pessoais na exclusão preservando integridade referencial/histórica.
- **Rationale**: Conformidade com princípios definidos e minimização de dados.
- **Alternatives considered**: N/A dentro do escopo.

## Itens sem NEEDS CLARIFICATION bloqueante
As pendências PEND-001/002/003 possuem propostas técnicas registradas acima e não impedem o planejamento; devem ser validadas/confirmadas nas etapas seguintes sem alterar regras de negócio aprovadas.