<!--
Sync Impact Report
- Version change: N/A (template) → 1.0.0
- Modified principles: N/A (documento inicial)
- Added sections: Princípios centrais, Stack e restrições, Fluxo de trabalho e rastreabilidade, Governança
- Removed sections: Placeholders do template
- Templates requiring updates: ✅ nenhum (templates dependentes leem a constitution em tempo de execução)
- Follow-up TODOs: TODO(RATIFICATION_DATE): data original de adoção ainda não informada
-->

# Carona Univille Constitution

## Princípios centrais

### I. Simplicidade e organização
O código deve ser simples, organizado e fácil de entender. Devem-se evitar soluções desnecessariamente
complexas. As funcionalidades devem ser desenvolvidas de forma incremental, seguindo os requisitos e as
tarefas definidas nas especificações.

### II. Separação de responsabilidades
Frontend, backend e acesso ao banco de dados devem ter responsabilidades bem separadas para facilitar a
manutenção. A interface não deve concentrar lógica crítica do domínio.

### III. Regras de negócio e persistência no backend
As regras de negócio devem ficar concentradas no backend, evitando que validações importantes dependam
apenas da interface. A persistência dos dados deve ser feita no SQLite; não é permitido depender de dados
armazenados somente em memória.

### IV. Testes e qualidade das regras críticas
Regras de negócio importantes devem possuir testes automatizados, principalmente reservas, capacidade das
viagens, busca por rota e horário, cancelamentos, penalidades e avaliações. O projeto deve manter pelo
menos 80% de cobertura de testes, utilizando Vitest e Supertest.

### V. Privacidade, segurança e escopo controlado
Dados pessoais e informações de localização devem ser tratados com cuidado desde o início, respeitando os
princípios da LGPD. Senhas devem ser armazenadas de forma segura e o acesso aos dados pessoais deve ser
limitado ao necessário. Não serão utilizados dados reais de estudantes.

## Stack e restrições

- **Stack**: React com Vite no frontend, Node.js com Express no backend, SQLite como banco de dados e
  JavaScript como linguagem principal.
- **Validação de matrícula**: feita por uma base local com números fictícios autorizados, sem integração
  com sistemas reais da Univille.
- **Fora da primeira versão**: integração com pagamentos, mapas externos, serviços de geolocalização,
  notificações, lista de espera, chat e outras funcionalidades não aprovadas.
- **Conta de usuário**: uma mesma conta poderá atuar como motorista e passageiro, conforme definido nas
  especificações.

## Fluxo de trabalho e rastreabilidade

- Cada tarefa implementada deve estar relacionada ao requisito correspondente.
- Commits devem identificar a tarefa realizada.
- Deve ser mantida a relação entre requisitos, tarefas, implementação e testes.
- As próximas etapas da documentação devem respeitar as decisões registradas anteriormente, evitando
  requisitos contraditórios ou funcionalidades não aprovadas.

## Governança

- Esta constitution orienta as decisões do projeto Carona Univille e prevalece em caso de conflito com
  práticas informais.
- Alterações exigem atualização deste arquivo, registro da versão e data de emenda, e breve justificativa
  das mudanças e impactos.
- Versão segue semântica: MAJOR para mudanças incompatíveis em princípios/governança, MINOR para novos
  princípios ou expansões relevantes, PATCH para ajustes textuais.
- Revisões de especificações, tarefas e implementações devem verificar aderência a estes princípios.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): data original de adoção ainda não informada | **Last Amended**: 2026-11-15
