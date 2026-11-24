# Carona Univille

Sistema de caronas acadêmicas desenvolvido com Spec-Driven Development (SDD).

## Objetivo e funcionalidades

O Carona Univille facilita a organização de caronas entre estudantes, com foco em percursos acadêmicos, segurança e controle das viagens. As principais funcionalidades implementadas são:

- cadastro e login com matrícula autorizada, autenticação JWT e perfis de usuário;
- cadastro de veículos e upload de foto de perfil;
- criação, edição, busca e detalhamento de ofertas de carona;
- reservas, cancelamentos, no-show e penalidades;
- avaliação de viagens concluídas;
- ofertas recorrentes e acompanhamento em “Minhas viagens”;
- interface web responsiva com rotas protegidas.

O projeto está organizado em `backend/` (API REST com Express e SQLite), `frontend/` (interface com React e Vite) e `specs/` (artefatos do SDD).

## Instalação das dependências

É necessário ter o Node.js e o npm instalados. Não existe pacote npm na raiz do repositório; instale as dependências em cada módulo:

```bash
cd backend
npm install
cd ../frontend
npm install
```

## Configuração do ambiente

### Backend

No Windows (PowerShell), execute:

```powershell
cd backend
copy .env.example .env
```

No Linux ou macOS:

```bash
cd backend
cp .env.example .env
```

Edite o arquivo `backend/.env` criado e configure as variáveis conforme o seu ambiente. Defina um valor forte e exclusivo para `JWT_SECRET`; não divulgue nem versione esse valor. O arquivo `.env` deve permanecer fora do controle de versão. Se JWT nao for definido será definido automaticamente.

Antes da primeira execução, prepare o banco de dados:

```bash
cd backend
npm run db:setup
```

### Frontend

Copie `frontend/.env.example` para `frontend/.env` e ajuste `VITE_API_URL` caso a API não esteja disponível no endereço padrão:

```powershell
cd frontend
copy .env.example .env
```

Em Linux ou macOS, use `cp .env.example .env`.

## Executando o projeto

Use terminais separados para manter o backend e o frontend em execução ao mesmo tempo.

### Terminal 1 — backend

```bash
cd backend
npm run dev
```

A API ficará disponível em `http://localhost:3000/api`, conforme a configuração padrão do exemplo.

### Terminal 2 — frontend

```bash
cd frontend
npm run dev
```

Acesse o endereço exibido pelo Vite no terminal. Para encerrar cada serviço, pressione `Ctrl+C` no terminal correspondente.

Outros comandos disponíveis:

- `npm start`: executa o backend sem observação de alterações;
- `npm run build`: gera a build de produção do frontend;
- `npm run preview`: serve localmente a build do frontend;
- `npm run db:migrate`, `npm run db:seed` e `npm run db:setup`: comandos de banco do backend.

## Métricas de testes e cobertura

### Execução dos testes

Última execução confirmada:

- backend: 41 arquivos de teste e 333 testes aprovados com `npm test`;
- frontend: 2 arquivos de teste e 6 testes aprovados com `npm test`.

Para executar os testes novamente:

```bash
cd backend
npm test
```

```bash
cd frontend
npm test
```

### Cobertura do backend

Última medição do backend com Vitest + V8:

| Métrica | Cobertura |
| --- | --- |
| Linhas | 91,14% (2667/2926) |
| Funções | 92,01% (634/689) |
| Branches | 80,86% (2142/2649) |
| Statements | 88,05% (2919/3315) |

Relatório HTML completo da cobertura dos testes do backend: [abrir no repositório](docs/relatorios/cobertura-backend/index.html).

A meta mínima de 80% é validada pelo comando abaixo. Para gerar ou atualizar o relatório HTML em `backend/coverage/` (abertura em `backend/coverage/index.html`):

```bash
cd backend
npm run test:coverage
```

//como iniciar 1. Instalar dependências

Backend:
cd backend
npm install


Frontend:
cd frontend
npm install


2. Preparar o banco
cd backend
npm run db:setup


3. Iniciar o sistema

Backend:
cd backend
npm run dev


Frontend (segundo terminal):
cd frontend
npm run dev


4. Acessar: http://localhost:5173