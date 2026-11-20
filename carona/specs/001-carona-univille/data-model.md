# Data Model: Carona Univille

**Feature**: `specs/001-carona-univille/spec.md`  
**Date**: 2026-11-15

## Visão geral

Modelo relacional persistido em SQLite. Regras de negócio e validações críticas são aplicadas no backend; chaves estrangeiras ativas (`PRAGMA foreign_keys = ON`). Timestamps em formato ISO 8601.

## Entidades e atributos

### Usuario
- **id** (PK)
- **nome_completo**, **email_institucional** (único), **senha_hash**, **telefone**
- **matricula** (única, validada contra base local fictícia; imutável após validação)
- **foto_perfil_path** (opcional, ref. a arquivo local)
- **conta_ativa** (bool; false após exclusão/anonimização lógica conforme necessidade)
- **criado_em**, **atualizado_em**
- **Dados anonimizados na exclusão**: campos pessoais removidos/substituídos preservando referências necessárias ao histórico/integridade.

### MatriculaAutorizada (base local fictícia)
- **matricula** (PK/única), **utilizada**/vínculo de controle conforme implementação
- Usada apenas para validação no cadastro; sem integração externa.

### Veiculo
- **id** (PK), **usuario_id** (FK Usuario, motorista dono)
- **marca**, **modelo**, **cor**, **placa**, **ano**
- **capacidade_passageiros** (inteiro > 0, não inclui motorista). O número de vagas oferecidas na oferta deve respeitar essa capacidade.
- **criado_em**

### Recorrencia
- **id** (PK), **motorista_id** (FK Usuario), **veiculo_id** (FK Veiculo)
- **dias_semana** (representação dos dias), **horario**
- **origem**, **destino**, **paradas** (estrutura ordenada), **vagas**, **valor** (vagas devem respeitar a capacidade do veículo)
- **ativa** (bool), **janela_dias** (= 15), **criado_em**, **atualizado_em**
- Alterações afetam apenas ofertas futuras ainda não geradas; interrupção preserva ofertas já criadas. O sistema deve manter as ofertas dos próximos 15 dias mesmo sem acessos de usuários e atualizar pendentes ao voltar a funcionar (geração idempotente).

### OfertaViagem (oferta/ocorrência)
- **id** (PK), **motorista_id** (FK Usuario), **veiculo_id** (FK Veiculo)
- **recorrencia_id** (FK Recorrencia, opcional; nulo para avulsa)
- **origem**, **destino**, **paradas** (sequência ordenada: origem, paradas..., destino para fins de percurso)
- **data_hora_saida** (horário programado)
- **vagas_total** (ajustável sem ficar abaixo das já reservadas quando houver reservas), **valor**
- **estado**: `ABERTA` | `EM_ANDAMENTO` | `CONCLUIDA` | `CANCELADA`
- **natureza_cancelamento** (opcional; ex.: comum_motorista, exclusao_conta, ausencia_motorista) para distinguir histórico
- **iniciada_em** (opcional), **concluida_em** (opcional), **criado_em**, **atualizado_em**
- **Situações derivadas**: `LOTADA` (vagas disponíveis == 0, antes do horário, não cancelada/concluída); `AGUARDANDO_INICIO` (horário previsto atingido, não iniciada, não concluída/cancelada). Visibilidade e aceite de reservas avaliados por regra no backend (RN-009).

### Reserva
- **id** (PK), **oferta_id** (FK OfertaViagem), **passageiro_id** (FK Usuario)
- **status**: `CONFIRMADA` | `CANCELADA` | `NO_SHOW`
- **natureza_cancelamento** (opcional; ex.: passageiro, motorista, exclusao_conta, ausencia_motorista)
- **criado_em**, **atualizado_em**
- **Restrições**: no máximo uma reserva ativa por passageiro por viagem (controle transacional); cada reserva = 1 vaga. O passageiro pode cancelar e reservar novamente a mesma viagem, desde que ainda existam vagas e não tenha outra reserva ativa.

### Penalidade
- **id** (PK), **usuario_id** (FK Usuario)
- **pontos** (1 ou 2 conforme evento), **motivo/tipo_evento**, **referencia** (viagem/reserva)
- **criado_em**
- Sem bloqueio automático; cancelamentos por exclusão de conta não geram penalidade.

### Avaliacao
- **id** (PK), **oferta_id** (FK OfertaViagem), **avaliador_id** (FK Usuario), **avaliado_id** (FK Usuario)
- **nota** (1–5, sem comentário), **criado_em**
- **Restrições**: permitida apenas para viagem concluída sem registro de no-show; uma avaliação por participante por viagem.

### HistoricoEvento
- **id** (PK), **tipo_evento**, **entidade_tipo/id**, **ator_usuario_id** (opcional)
- **natureza** (ex.: cancelamento comum vs `CANCELAMENTO_EXCLUSAO_CONTA`), **detalhes** (metadados)
- **criado_em**
- Registra alterações relevantes (edições de oferta, cancelamentos, no-show, exclusão, início/fim etc.).

## Relacionamentos (resumo)

- Usuario 1—N Veiculo, 1—N OfertaViagem (como motorista), 1—N Reserva (como passageiro), 1—N Penalidade, 1—N Avaliacao (avaliador/avaliado).
- Recorrencia 1—N OfertaViagem (ocorrências geradas, independentes).
- OfertaViagem 1—N Reserva, 1—N Avaliacao, N—1 Veiculo.
- HistoricoEvento referencia entidades/usuários conforme evento.

## Validações e invariantes (backend)

- Matrícula válida na base local e imutável após validação; e-mail/matrícula únicos conforme regras.
- Capacidade: `reservas_confirmadas_ativas <= vagas_total <= capacidade_passageiros do veículo`; nunca exceder, inclusive sob concorrência. Vagas oferecidas não podem ultrapassar a capacidade do veículo (sem contar o motorista).
- Reserva: no máximo uma reserva ativa por passageiro por viagem; permitido cancelar e reservar novamente a mesma viagem se houver vagas e sem outra reserva ativa.
- Edição pós-reserva: origem/destino/horário imutáveis; vagas >= reservas já confirmadas.
- Busca: janela ±30 min, ordem de pontos no percurso (origem antes do destino), sem raio.
- Visibilidade: antes do horário na busca (ou "Lotada"); ao atingir horário fora da busca e só participantes; concluídas/canceladas fora da busca.
- Placa visível apenas para o dono do veículo e passageiros com reserva confirmada na viagem.
- Avaliação apenas concluída sem no-show, única por participante/viagem; reputação = média com 1 casa decimal ou "Sem avaliações". Viagens com registro de no-show não permitem avaliações entre participantes.
- Exclusão: cancela futuras sem penalidades, histórico com natureza distinta, dados pessoais removidos/anonimizados preservando integridade.
- Recorrência: manter ofertas dos próximos 15 dias mesmo sem acessos de usuários (rotina periódica/inicialização) e atualizar ofertas pendentes ao retomar após indisponibilidade, de forma idempotente.