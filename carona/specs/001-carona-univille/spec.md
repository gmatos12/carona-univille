# Especificação: Carona Univille (versão inicial)

**Feature Branch**: `001-carona-univille`  
**Created**: 2026-11-15  
**Status**: Draft  
**Input**: Especificação inicial do sistema acadêmico de compartilhamento de caronas entre integrantes da comunidade da Univille, baseada na Constitution e no levantamento de requisitos.

## Visão geral

O Carona Univille permite que integrantes da comunidade acadêmica ofereçam viagens, encontrem caronas compatíveis com seus trajetos e reservem vagas. Uma mesma conta pode atuar como motorista e passageiro. A solução deve priorizar simplicidade, clareza das regras e respeito à privacidade.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cadastro, perfil e veículo (Priority: P1)

Como integrante da comunidade, quero criar e manter minha conta e, se for motorista, cadastrar meus veículos, para participar do sistema com segurança e identificação adequada.

**Why this priority**: Sem conta válida e perfil básico não há uso do sistema.

**Independent Test**: Criar conta com matrícula autorizada, editar perfil, adicionar foto opcional e cadastrar veículo; verificar visibilidade de dados públicos/privados e da placa conforme regra.

**Acceptance Scenarios**:

1. **Given** matrícula presente na base local fictícia autorizada, **When** o usuário conclui o cadastro com nome completo, matrícula, e-mail institucional, senha e telefone, **Then** a conta é criada e a matrícula validada não pode ser alterada.
2. **Given** usuário autenticado, **When** edita dados pessoais e adiciona/remove foto opcional, **Then** as alterações são salvas; o perfil público exibe nome, foto, média das avaliações e quantidade de viagens concluídas.
3. **Given** perfil público consultado, **When** outro usuário visualiza o perfil, **Then** matrícula, e-mail, telefone e histórico de penalidades permanecem privados.
4. **Given** motorista cadastrando veículo, **When** informa marca, modelo, cor, placa, ano e capacidade de passageiros (sem incluir motorista), **Then** o veículo fica disponível; a placa só é visível para passageiros com reserva confirmada nessa viagem.

---

### User Story 2 - Ofertar e buscar caronas (Priority: P1)

Como motorista, quero oferecer caronas, e como passageiro, quero buscar ofertas compatíveis com meu trajeto e horário, para combinar deslocamentos.

**Why this priority**: Oferta e descoberta de caronas são o núcleo do produto.

**Independent Test**: Criar oferta com percurso e paradas; buscar por origem/destino/data/horário com tolerância de ±30 minutos e pontos intermediários; verificar ordenação, exibição de lotadas e restrições de edição.

**Acceptance Scenarios**:

1. **Given** motorista com veículo, **When** informa origem, destino, data, horário, paradas intermediárias, vagas e valor (podendo ser zero), **Then** a oferta é criada sem qualquer cobrança pelo sistema.
2. **Given** oferta sem reservas confirmadas, **When** o motorista edita dados, **Then** todos os campos podem ser alterados; **Given** oferta com reservas, **Then** origem, destino e horário não mudam, paradas podem mudar e vagas podem ser ajustadas sem ficar abaixo das já reservadas, com alterações registradas no histórico.
3. **Given** busca por origem, destino, data e horário, **When** existem ofertas, **Then** o sistema considera todo o percurso (origem, paradas, destino) com tolerância de ±30 minutos, permitindo pontos intermediários apenas se a origem do passageiro vier antes do destino na rota; não há busca por raio/proximidade.
4. **Given** resultados de busca, **When** exibidos, **Then** mostram motorista, avaliações, veículo, percurso, horário, vagas, valor e situação; ordenados pelo horário mais próximo do desejado e, em empate, pela maior quantidade de vagas; ofertas lotadas aparecem como "Lotada" e não aceitam reservas.

---

### User Story 3 - Reservas e capacidade (Priority: P1)

Como passageiro, quero reservar uma vaga em uma oferta disponível, para garantir meu lugar.

**Why this priority**: Reserva correta e controle de capacidade são críticos para confiança e integridade.

**Independent Test**: Reservar vaga com confirmação automática; impedir segunda vaga na mesma viagem e impedir exceder capacidade mesmo em tentativas simultâneas.

**Acceptance Scenarios**:

1. **Given** oferta com vaga disponível antes do horário programado, **When** passageiro solicita reserva, **Then** a reserva é confirmada automaticamente (uma vaga por reserva e apenas uma reserva do passageiro por viagem).
2. **Given** oferta sem vagas ou já iniciada/após horário programado, **When** passageiro tenta reservar, **Then** a reserva não é aceita.
3. **Given** múltiplas tentativas simultâneas pela última vaga, **When** processadas, **Then** a capacidade nunca é excedida.

---

### User Story 4 - Cancelamentos e penalidades (Priority: P1)

Como usuário, quero cancelar reservas ou viagens conforme as regras, com registro justo de penalidades quando aplicável.

**Why this priority**: Regras de cancelamento impactam diretamente a operação e a reputação.

**Independent Test**: Cancelar passageiro com ≥24h, <24h e após horário; motorista cancelar viagem com reservas; verificar liberação de vaga, pontos e histórico sem bloqueio automático.

**Acceptance Scenarios**:

1. **Given** reserva confirmada e faltam ≥24h para a saída, **When** passageiro cancela, **Then** cancela sem penalidade e a vaga é liberada (se antes do início).
2. **Given** faltam <24h para a saída, **When** passageiro cancela, **Then** cancela com 1 ponto de penalidade e vaga liberada (se antes do início); **Given** após o horário previsto, **Then** cancelamento não é permitido.
3. **Given** viagem com reservas confirmadas, **When** motorista cancela a oferta, **Then** todas as reservas e a oferta são canceladas, motorista recebe 1 ponto de penalidade e tudo é registrado no histórico, sem bloqueio automático da conta.

---

### User Story 5 - Execução da viagem, no-show e avaliações (Priority: P2)

Como motorista ou passageiro, quero registrar início/fim, ausências e avaliar viagens concluídas, para manter o histórico e a reputação.

**Why this priority**: Conclui o ciclo da carona e alimenta a confiança entre usuários.

**Independent Test**: Iniciar apenas a partir do horário, concluir, registrar no-show (passageiro/motorista) e avaliar uma vez com nota 1–5 sem comentários; impedir avaliações em viagens com no-show.

**Acceptance Scenarios**:

1. **Given** horário programado atingido, **When** esse horário é alcançado (mesmo que o motorista ainda não tenha iniciado a viagem), **Then** a oferta deixa de aparecer na busca e fica visível somente para os participantes, sem aceitar novas reservas; o motorista pode iniciar a viagem a partir desse horário e, ao finalizar, a viagem fica concluída e participantes podem avaliar.
2. **Given** viagem concluída sem registro de no-show, **When** participante avalia, **Then** registra nota de 1 a 5 estrelas (sem comentários) apenas uma vez por viagem; reputação é a média das notas recebidas com uma casa decimal; sem avaliações exibe "Sem avaliações".
3. **Given** após o horário previsto de saída, **When** motorista informa que passageiro não compareceu, **Then** reserva fica "No-show", passageiro recebe 2 pontos e a vaga não é liberada.
4. **Given** após o horário previsto, **When** passageiro informa ausência do motorista, **Then** viagem e reservas são canceladas e motorista recebe 2 pontos; acontecimentos registrados; não há contestação de penalidades e não há avaliações em viagens com registro de no-show.

---

### User Story 6 - Viagens recorrentes e Minhas viagens (Priority: P2)

Como motorista, quero cadastrar recorrências, e como usuário, quero consultar minhas viagens em uma área dedicada.

**Why this priority**: Facilita uso frequente e acompanhamento do histórico.

**Independent Test**: Criar recorrência, verificar geração de ofertas individuais em janela de até 15 dias, interrupção/alterações futuras, independência de reservas; consultar "Minhas viagens".

**Acceptance Scenarios**:

1. **Given** motorista informa dias da semana, horário, origem, destino, paradas, vagas e valor, **When** salva recorrência, **Then** o sistema gera ofertas individuais por ocorrência com janela de até 15 dias de antecedência; cada oferta tem reservas e cancelamentos independentes.
2. **Given** recorrência ativa, **When** interrompida, **Then** ofertas já criadas são preservadas; alterações na configuração afetam somente viagens futuras ainda não geradas.
3. **Given** usuário acessa "Minhas viagens", **When** consulta, **Then** visualiza viagens oferecidas, reservadas, concluídas e canceladas; visibilidade na busca segue: antes do horário previsto visível (ou "Lotada"); ao atingir o horário previsto deixa de aparecer na busca e fica visível somente aos participantes (mesmo sem início registrado), sem aceitar novas reservas; concluídas/canceladas fora da busca.

---

### User Story 7 - Exclusão de conta (Priority: P3)

Como usuário, quero excluir minha conta respeitando histórico e integridade dos dados.

**Why this priority**: Direito do titular e encerramento seguro da conta.

**Independent Test**: Solicitar exclusão; verificar bloqueio de novas ações, cancelamento de viagens/reservas futuras, remoção/anonimização de dados pessoais e preservação de registros necessários sem penalidade adicional.

**Acceptance Scenarios**:

1. **Given** usuário solicita exclusão, **When** confirmada, **Then** não pode criar novas ofertas ou reservas e suas viagens futuras e reservas futuras relacionadas à conta são canceladas automaticamente, sem gerar penalidades para o usuário que solicitou a exclusão nem para os demais participantes afetados.
2. **Given** exclusão processada, **When** concluída, **Then** esses cancelamentos são registrados no histórico, mas não são tratados como cancelamentos comuns feitos pelo motorista ou passageiro; dados pessoais são removidos ou anonimizados preservando registros necessários para histórico e integridade.

### Edge Cases

- Tentativas simultâneas de reserva na última vaga não devem exceder capacidade.
- Busca com horário limite (exatamente ±30 minutos) e com origem/destino em paradas intermediárias, respeitando ordem origem antes do destino na rota.
- Ajuste de vagas em oferta com reservas: não pode ficar abaixo da quantidade já reservada.
- Ao atingir o horário programado de saída: a oferta sai dos resultados de busca e fica visível somente aos participantes (mesmo sem o motorista ter iniciado), novas reservas bloqueadas; cancelamento de passageiro não permitido; início de viagem permitido; no-show pode ser registrado conforme regra.
- Ofertas geradas por recorrência são independentes; mudanças na recorrência não afetam ofertas já criadas.
- Viagens com qualquer registro de no-show não permitem avaliações.
- Exclusão de conta com viagens/reservas futuras em aberto: cancelamento automático dessas ocorrências, sem penalidades para o solicitante nem para os demais participantes afetados; registrados no histórico, mas não tratados como cancelamentos comuns de motorista ou passageiro.

## Requirements *(mandatory)*

### Requisitos funcionais

- **RF-001**: O sistema deve permitir cadastro com nome completo, matrícula, e-mail institucional, senha e telefone, validando a matrícula em base local de números fictícios autorizados.
- **RF-002**: A matrícula, após validada, não pode ser alterada.
- **RF-003**: O usuário deve poder editar dados pessoais e adicionar/remover foto de perfil opcional.
- **RF-004**: O perfil público deve exibir nome, foto, média das avaliações e quantidade de viagens concluídas; matrícula, e-mail, telefone e histórico de penalidades devem permanecer privados.
- **RF-005**: Uma mesma conta deve poder atuar como motorista e passageiro.
- **RF-006**: O motorista deve poder cadastrar veículos com marca, modelo, cor, placa, ano e capacidade de passageiros (sem incluir o motorista).
- **RF-007**: A placa do veículo deve ser visível somente para passageiros com reserva confirmada na viagem.
- **RF-008**: O motorista deve poder criar oferta de carona com origem, destino, data, horário, paradas intermediárias, quantidade de vagas e valor por passageiro (podendo ser zero, sem pagamento pelo sistema).
- **RF-009**: Antes de reservas confirmadas, todos os dados da oferta podem ser editados; após reservas, origem, destino e horário não podem ser alterados, paradas podem ser modificadas e vagas ajustadas sem ficar abaixo das já reservadas, com registro das alterações no histórico.
- **RF-010**: A busca deve considerar origem, destino, data e horário com tolerância de ±30 minutos, analisando todo o percurso (origem, paradas, destino final) e permitindo pontos intermediários apenas se a origem do passageiro estiver antes do destino na rota; sem busca por raio/proximidade geográfica.
- **RF-011**: Resultados da busca devem exibir motorista, avaliações, veículo, percurso, horário, vagas, valor e situação da oferta; ordenar por horário mais próximo do desejado e, em empate, por maior quantidade de vagas.
- **RF-012**: Ofertas lotadas devem continuar visíveis na busca como "Lotada" e não aceitar novas reservas.
- **RF-013**: Cada reserva corresponde a uma vaga; o passageiro pode reservar somente uma vaga por viagem; confirmação automática quando houver disponibilidade.
- **RF-014**: O sistema deve impedir reservas acima da capacidade, inclusive em tentativas simultâneas, e não aceitar reservas a partir do horário programado (inclusive quando a viagem ainda não foi iniciada) ou quando a viagem já estiver iniciada.
- **RF-015**: Cancelamento do passageiro: sem penalidade com ≥24h de antecedência; com <24h gera 1 ponto de penalidade; após horário previsto não é permitido. Cancelamentos antes do início liberam a vaga.
- **RF-016**: Cancelamento pelo motorista em viagem com reservas confirmadas cancela todas as reservas e a oferta, gera 1 ponto de penalidade ao motorista e registra no histórico, sem bloqueio automático.
- **RF-017**: O motorista pode iniciar a viagem somente a partir do horário programado. Ao atingir o horário previsto de saída, a oferta deixa de aparecer na busca e fica visível somente aos participantes, mesmo que o motorista ainda não tenha iniciado, e não são aceitas novas reservas. Ao finalizar, a viagem é marcada como concluída.
- **RF-018**: Após o horário previsto, o motorista pode registrar no-show de passageiro (reserva "No-show", 2 pontos ao passageiro, vaga não liberada). O passageiro pode informar ausência do motorista (cancela viagem e reservas, 2 pontos ao motorista). Acontecimentos registrados no histórico. Não há contestação de penalidades nesta versão.
- **RF-019**: Avaliações permitidas apenas após viagens concluídas sem registro de no-show: nota de 1 a 5 estrelas, sem comentários, uma vez por participante por viagem. Reputação = média com uma casa decimal; sem avaliações exibe "Sem avaliações".
- **RF-020**: O sistema deve suportar viagens recorrentes (dias da semana, horário, origem, destino, paradas, vagas, valor), gerando ofertas individuais com janela de até 15 dias de antecedência; reservas e cancelamentos independentes por oferta.
- **RF-021**: Ao interromper recorrência, ofertas já criadas são preservadas; alterações afetam somente viagens futuras ainda não geradas.
- **RF-022**: Visibilidade: antes do horário previsto de saída as ofertas aparecem na busca (ou "Lotada"); ao atingir o horário previsto deixam de aparecer na busca e ficam visíveis somente aos participantes (mesmo sem início registrado), sem aceitar novas reservas; concluídas/canceladas não aparecem na busca.
- **RF-023**: Deve existir a área "Minhas viagens" para consultar viagens oferecidas, reservadas, concluídas e canceladas.
- **RF-024**: O usuário pode solicitar exclusão da conta: fica impedido de criar novas ofertas/reservas; viagens e reservas futuras relacionadas à conta são canceladas automaticamente, sem gerar penalidades para o usuário que solicitou a exclusão nem para os demais participantes afetados. Esses cancelamentos são registrados no histórico, mas não são tratados como cancelamentos comuns feitos pelo motorista ou passageiro. Dados pessoais são removidos ou anonimizados preservando registros necessários para histórico e integridade.
- **RF-025**: Penalidades devem ser registradas no histórico, sem bloqueio automático da conta.

### Requisitos não funcionais

- **RNF-001 (Usabilidade e clareza)**: A interface e as mensagens devem ser claras, refletindo corretamente as regras (ex.: oferta "Lotada", impossibilidade de reservar/cancelar quando aplicável).
- **RNF-002 (Privacidade e segurança)**: Dados pessoais e de localização devem ser tratados conforme princípios da LGPD; senhas armazenadas de forma segura; acesso a dados pessoais limitado ao necessário; não utilizar dados reais de estudantes.
- **RNF-003 (Integridade e persistência)**: Dados devem ser persistidos de forma durável; operações críticas de reserva/capacidade devem manter consistência mesmo sob concorrência.
- **RNF-004 (Confiabilidade de regras)**: Regras de negócio críticas (reservas, capacidade, busca por rota/horário, cancelamentos, penalidades, avaliações) devem ser verificáveis por testes automatizados com cobertura mínima de 80% do projeto.
- **RNF-005 (Manutenibilidade)**: A solução deve seguir organização simples e separação de responsabilidades, conforme a Constitution, facilitando evolução incremental.
- **RNF-006 (Rastreabilidade)**: Cada requisito e tarefa implementada deve manter vínculo com especificação, implementação e testes.

### Regras de negócio

- **RN-001**: Matrícula validada em base local de números fictícios autorizados; imutável após validação; sem integração com sistemas reais da Univille.
- **RN-002**: Capacidade de passageiros do veículo não inclui o motorista; cada reserva consome uma vaga.
- **RN-003**: Valor por passageiro pode ser zero; não há pagamento, repasse ou conciliação financeira pelo sistema.
- **RN-004**: Busca por percurso considera ordem dos pontos (origem do passageiro antes do destino na rota) e tolerância de ±30 minutos em relação ao horário desejado; sem geolocalização/raio.
- **RN-005**: Penalidades: passageiro cancela <24h = 1 ponto; motorista cancela viagem com reservas = 1 ponto; no-show passageiro = 2 pontos; no-show motorista (ausência informada pelo passageiro) = 2 pontos. Sem bloqueio automático e sem contestação nesta versão. Cancelamentos automáticos decorrentes da exclusão de conta do solicitante não geram penalidades para ele nem para os demais participantes afetados e não são tratados como cancelamentos comuns de motorista ou passageiro.
- **RN-006**: No-show de passageiro não libera vaga; viagens com registro de no-show não permitem avaliações.
- **RN-007**: Recorrência gera ofertas individuais independentes em janela de até 15 dias; interrupção preserva ofertas criadas; alterações afetam apenas ofertas futuras ainda não geradas.
- **RN-008**: Perfil público restringe dados sensíveis; placa visível apenas a passageiros com reserva confirmada.
- **RN-009**: Ao atingir o horário previsto de saída, a oferta/viagem deixa de aparecer na busca e fica visível somente aos participantes, mesmo sem o registro de início pelo motorista, e não aceita novas reservas. Cancelamentos automáticos por exclusão de conta devem ser registrados no histórico com essa natureza distinta.

### Pendências

- **PEND-001**: Critérios exatos de autenticação de sessão (duração, recuperação de senha) não especificados; definir em etapa posterior sem contradizer a Constitution.
- **PEND-002**: Formato de armazenamento e limites da foto de perfil (tamanho/tipos aceitos) não especificados.
- **PEND-003**: Representação detalhada de "viagem em andamento" na área "Minhas viagens" (status exibido) a detalhar no planejamento.

## Critérios de aceitação (consolidados)

- **CA-001**: Não é possível cadastrar com matrícula fora da base local autorizada nem alterar matrícula validada.
- **CA-002**: Dados privados (matrícula, e-mail, telefone, histórico de penalidades) e placa não são expostos indevidamente.
- **CA-003**: Busca retorna ofertas compatíveis por percurso e horário (±30 min), com ordenação correta e marcação "Lotada" quando aplicável, sem aceitar reserva em lotadas.
- **CA-004**: Capacidade nunca é excedida, inclusive sob concorrência; máximo de uma reserva por passageiro por viagem.
- **CA-005**: Cancelamentos comuns, no-show e penalidades seguem os prazos e pontuações definidos, com histórico registrado e sem bloqueio automático.
- **CA-006**: Viagens concluídas sem no-show permitem uma avaliação por participante (1–5, sem comentários); reputação calculada com uma casa decimal ou "Sem avaliações".
- **CA-007**: Recorrências geram ofertas independentes (janela 15 dias) e respeitam regras de interrupção/alteração futura.
- **CA-008**: "Minhas viagens" e regras de visibilidade refletem corretamente o estado: ao atingir o horário previsto a oferta sai da busca e fica visível somente aos participantes (mesmo sem início registrado), sem novas reservas; concluídas/canceladas não aparecem na busca.
- **CA-009**: Exclusão de conta impede novas ações, cancela automaticamente viagens e reservas futuras sem gerar penalidades ao solicitante nem aos demais afetados; cancelamentos ficam registrados no histórico com natureza distinta de cancelamentos comuns, preservando integridade/histórico com dados pessoais removidos ou anonimizados.

## Key Entities

- **Usuário**: integrante da comunidade; credenciais e dados de contato; atua como motorista e/ou passageiro; possui reputação e histórico de viagens/penalidades (privado).
- **Veículo**: pertence a um motorista; dados de identificação e capacidade de passageiros.
- **Oferta de carona (viagem)**: criada por motorista com veículo, percurso (origem, paradas, destino), data/horário, vagas, valor e situação; pode ser avulsa ou gerada por recorrência.
- **Recorrência**: configuração que gera ofertas individuais em janela limitada; independente das ofertas já geradas.
- **Reserva**: vínculo de um passageiro a uma oferta ocupando uma vaga; possui situação (confirmada, cancelada, no-show etc.).
- **Penalidade**: registro de pontos associado a usuário e evento, mantido em histórico.
- **Avaliação**: nota de 1 a 5 dada por participante após viagem concluída elegível, única por viagem.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuário elegível consegue concluir cadastro e passar a usar as funções principais (ofertar ou reservar) em um único fluxo guiado, sem assistência externa.
- **SC-002**: 100% das tentativas de reserva respeitam capacidade e unicidade por passageiro/viagem, mesmo em cenários de concorrência.
- **SC-003**: Buscas retornam apenas ofertas compatíveis com as regras de percurso, horário (±30 min) e situação, com ordenação e sinalização corretas.
- **SC-004**: 100% dos eventos de cancelamento, no-show e avaliação resultam no estado, pontuação e elegibilidade previstos, com registro em histórico.
- **SC-005**: Dados privados e placa não são expostos a usuários não autorizados conforme as regras definidas.
- **SC-006**: Regras de negócio críticas possuem verificação automatizada e o projeto atinge pelo menos 80% de cobertura de testes.
- **SC-007**: Usuários conseguem localizar e consultar suas viagens (oferecidas, reservadas, concluídas, canceladas) na área "Minhas viagens".

## Assumptions

- Base local de matrículas fictícias autorizadas estará disponível para validação no ambiente do projeto.
- "Integrantes da comunidade acadêmica" aptos a usar o sistema são aqueles com matrícula presente nessa base autorizada.
- Não há pagamentos, mapas externos, geolocalização, notificações, lista de espera, chat ou integração com sistemas reais da Univille na primeira versão.
- A stack e as diretrizes de qualidade, testes e rastreabilidade seguem a Constitution do projeto.
- Detalhes técnicos não especificados (ex.: autenticação de sessão, formato de foto) serão definidos em etapas posteriores sem alterar as regras aprovadas.
