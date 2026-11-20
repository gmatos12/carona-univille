# Contratos de API (REST) - Carona Univille

Base: `/api` (prefixo sugerido). Autenticação via `Authorization: Bearer <token>` nas rotas protegidas. Respostas em JSON; erros com código HTTP adequado e mensagem clara. Contrato de referência para planejamento (sem impor detalhes de implementação além do necessário).

## Autenticação e conta
- `POST /auth/cadastro` — cria conta (nome, matrícula, e-mail institucional, senha, telefone); valida matrícula na base local fictícia. 201 criado / 400 inválido.
- `POST /auth/login` — autentica e retorna token. 200 / 401.
- `GET /me` — perfil do usuário autenticado (dados próprios). 200.
- `PUT /me` — edita dados pessoais (matrícula não alterável). 200.
- `POST /me/foto` — adiciona/atualiza foto (upload, tipos/tamanho conforme proposta). 200.
- `DELETE /me/foto` — remove foto. 204.
- `DELETE /me` — solicita exclusão da conta (cancela futuras sem penalidades, anonimiza/remove dados, registra histórico de natureza distinta). 200/204.
- `GET /usuarios/:id/perfil-publico` — perfil público (nome, foto, média avaliações/“Sem avaliações”, qtd viagens concluídas); sem dados privados. 200.

## Veículos (motorista)
- `POST /veiculos` — cadastra veículo (marca, modelo, cor, placa, ano, capacidade de passageiros sem contar o motorista). 201.
- `GET /veiculos` — lista veículos do motorista autenticado. 200.
- `PUT /veiculos/:id` / `DELETE /veiculos/:id` — gerencia veículo próprio (respeitando vínculos). 200/204.

## Ofertas e recorrências
- `POST /ofertas` — cria oferta avulsa (origem, destino, data/horário, paradas, vagas, valor, veículo). Vagas devem respeitar a capacidade de passageiros do veículo (sem contar o motorista). 201.
- `GET /ofertas/busca?origem=&destino=&data=&horario=` — busca com ±30 min, percurso completo e ordem de pontos; retorna motorista, avaliações, veículo, percurso, horário, vagas, valor e situação; ordenação por horário mais próximo e empate por maior vagas. Exclui ofertas a partir do horário previsto e concluídas/canceladas; inclui "Lotada". 200.
- `GET /ofertas/:id` — detalhe da oferta (placa visível apenas para o dono do veículo e para passageiros com reserva confirmada na viagem). 200.
- `PUT /ofertas/:id` — edita oferta (regras RF-009: antes de reservas tudo; após reservas sem alterar origem/destino/horário, paradas ajustáveis, vagas >= reservadas e <= capacidade do veículo) com registro no histórico. 200.
- `POST /ofertas/:id/iniciar` — motorista inicia a partir do horário programado. 200.
- `POST /ofertas/:id/concluir` — motorista finaliza; marca concluída. 200.
- `POST /ofertas/:id/cancelar` — motorista cancela (se houver reservas: cancela oferta e reservas, aplica penalidade motorista, registra histórico). 200.
- `POST /recorrencias` — cria recorrência e gera ofertas na janela de 15 dias. 201.
- `PUT /recorrencias/:id` — altera configuração (aplica só a futuras não geradas). 200.
- `POST /recorrencias/:id/interromper` — desativa preservando ofertas criadas. 200.

## Reservas
- `POST /ofertas/:id/reservas` — solicita reserva (1 vaga, máx 1 reserva ativa por passageiro/viagem, confirmação automática se disponível; transação garante capacidade). Passageiro pode cancelar e reservar novamente a mesma viagem se houver vagas e não tiver outra reserva ativa. 201 / 409 conflito de capacidade/unicidade ativa.
- `POST /reservas/:id/cancelar` — passageiro cancela (regras de prazo/penalidade RF-015; não permitido após horário). 200.
- `POST /reservas/:id/no-show` — motorista registra no-show do passageiro após horário (reserva "No-show", 2 pontos, vaga não liberada). 200.

## No-show do motorista e avaliações
- `POST /ofertas/:id/ausencia-motorista` — passageiro informa ausência do motorista após horário (cancela viagem e reservas, 2 pontos ao motorista). 200.
- `POST /ofertas/:id/avaliacoes` — participante avalia (nota 1–5, uma vez, apenas concluída sem registro de no-show; viagens com no-show não permitem avaliações entre participantes). 201.

## Minhas viagens e histórico
- `GET /minhas-viagens?tipo=oferecidas|reservadas|concluidas|canceladas` — lista viagens do usuário conforme categoria e regras de visibilidade/estado. 200.
- `GET /ofertas/:id/historico` (ou acesso via detalhe autorizado) — eventos relevantes registrados. 200.

## Observações de contrato
- Todas as validações de regra de negócio, autorização e visibilidade são aplicadas no backend.
- Códigos de erro devem distinguir: não autorizado (401/403), não encontrado (404), regra de negócio violada (409/422), entrada inválida (400).
- Campos sensíveis (matrícula, e-mail, telefone, histórico de penalidades, placa quando não autorizado) nunca retornados indevidamente.