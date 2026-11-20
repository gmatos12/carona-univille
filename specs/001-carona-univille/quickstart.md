# Quickstart & Validação: Carona Univille

Guia de preparação e cenários de validação do plano técnico (PoC acadêmica). Não inclui implementação/código; serve para orientar execução e verificação quando a implementação ocorrer.

## Pré-requisitos (planejados)
- Node.js (LTS) e npm
- Estrutura em dois módulos: `backend/` (API Express + SQLite) e `frontend/` (React + Vite)
- Dependências principais: Express, driver SQLite, bcrypt, JWT; testes com Vitest e Supertest
- Base local de matrículas fictícias autorizadas disponível no backend (ex.: seed/arquivo/dados iniciais)

## Configuração esperada
- Variáveis de ambiente do backend: porta, segredo JWT, caminho do arquivo SQLite e diretório de uploads (foto de perfil)
- Banco SQLite criado/migrado na inicialização ou por script dedicado; `PRAGMA foreign_keys = ON`
- Frontend configurado para apontar para a URL da API

## Comandos de execução (referência de validação)
- Backend: instalar dependências, iniciar servidor de desenvolvimento, executar migrações/seed de matrículas quando aplicável
- Frontend: instalar dependências, iniciar Vite em modo desenvolvimento
- Testes: executar suíte Vitest/Supertest no backend (e frontend se houver) com relatório de cobertura; meta global ≥ 80%

## Cenários de validação ponta a ponta

1. **Cadastro e perfil**: cadastrar com matrícula autorizada; rejeitar matrícula não autorizada; editar perfil/foto; confirmar imutabilidade da matrícula e privacidade de dados/placa.
2. **Oferta e busca**: criar oferta com paradas; buscar por percurso e horário (±30 min, origem antes do destino); verificar ordenação, exibição "Lotada" e exclusão da busca ao atingir horário previsto (visível só a participantes).
3. **Reserva e concorrência**: confirmar automaticamente com vaga; impedir 2ª reserva do mesmo passageiro e exceder capacidade em tentativas simultâneas; bloquear após horário/início.
4. **Cancelamentos e penalidades**: passageiro ≥24h sem penalidade, <24h com 1 ponto, após horário não permitido; motorista cancela viagem com reservas gera 1 ponto e cancela reservas; histórico registrado sem bloqueio automático.
5. **Execução, no-show e avaliação**: iniciar a partir do horário, concluir; registrar no-show (2 pontos, vaga não liberada para passageiro; ausência do motorista cancela e penaliza motorista); avaliar 1–5 uma vez em concluída sem no-show; reputação com 1 casa decimal ou "Sem avaliações".
6. **Recorrência**: gerar ofertas individuais em janela de 15 dias; independência entre ofertas; interromper preserva criadas; alterações só afetam futuras não geradas.
7. **Minhas viagens e visibilidade**: consultar oferecidas/reservadas/concluídas/canceladas; estados e visibilidade conforme RN-009/RF-022.
8. **Exclusão de conta**: bloquear novas ações, cancelar automaticamente futuras sem penalidades ao solicitante/afetados com natureza distinta no histórico, anonimizar/remover dados pessoais preservando integridade.

## Critérios de sucesso da validação
- Regras de negócio críticas passam nos testes automatizados (reservas, capacidade, busca rota/horário, cancelamentos, penalidades, avaliações, recorrência, exclusão).
- Cobertura ≥ 80% e nenhuma exposição indevida de dados privados/placa.

## Referências
- Especificação: `spec.md`
- Modelo de dados: `data-model.md`
- Contratos de API: `contracts/`
- Decisões técnicas: `research.md`