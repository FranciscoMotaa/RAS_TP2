# Relatório — pictuRAS Fase 2

Autor: [Preencher]
Curso/UC: [Preencher]
Data: [Preencher]

## 1. Resumo
Breve síntese do objetivo do trabalho, abordagem e principais resultados. 5–7 linhas.

## 2. Objetivos e Requisitos
- Enunciar objetivos da Fase 2 com base no enunciado (sem transcrever o PDF).
- Listar requisitos funcionais e não funcionais que foram considerados.
- Critérios de aceitação para cada requisito.

## 3. Arquitetura do Sistema
- Visão geral (diagrama de componentes + fluxo alto nível).

```mermaid
graph LR
  Frontend[Frontend (Next.js)] --> Nginx[Nginx]
  Nginx --> APIGW[apiGateway]
  Frontend --> WSGW[wsGateway]

  APIGW --> Users[users]
  APIGW --> Subs[subscriptions]
  APIGW --> Projects[projects]

  Projects --> MQ[RabbitMQ]
  Projects --> MinIO[MinIO]
  Projects --> Tools[Tools (workers)]

  MinIO --> Projects
  APIGW --> Share[Share Endpoints]
  WSGW --> Frontend

  classDef svc fill:#e8f5e9,stroke:#2e7d32,stroke-width:1px;
  classDef infra fill:#e3f2fd,stroke:#1565c0,stroke-width:1px;
  class APIGW,Users,Subs,Projects,WSGW,Tools svc;
  class Nginx,MinIO,MQ infra;
```
- Serviços e responsabilidades:
  - `apiGateway`: encaminhamento e autenticação — ver [apiGateway/app.js](../apiGateway/app.js) e [apiGateway/routes](../apiGateway/routes)
  - `wsGateway`: partilha em tempo real — ver [wsGateway/index.js](../wsGateway/index.js)
  - `users`: gestão de contas — ver [users/app.js](../users/app.js)
  - `projects`: orquestração de processamento — ver [projects/app.js](../projects/app.js)
  - `subscriptions`: planos e limites — ver [subscriptions/app.js](../subscriptions/app.js)
  - `imageStorageService`: estático/páginas e integração storage — ver [imageStorageService/app.js](../imageStorageService/app.js)
  - `minio`: armazenamento de imagens e ficheiros — ver [minio/server.js](../minio/server.js)
  - `Tools`: processamento (AI e comum) — ver [Tools/](../Tools)
  - `frontend`: UI Next.js — ver [frontend/app](../frontend/app)
  - `nginx`: proxy reverso — ver [nginx/nginx.conf](../nginx/nginx.conf)
  - `rabbitMQ`: mensageria — ver [rabbitMQ/](../rabbitMQ)
- Comunicação entre serviços (HTTP, WebSocket, filas). Indicar tópicos/rotas chave.
  - HTTP via `apiGateway` para `users`, `subscriptions`, `projects`.
  - WebSocket/partilha via `wsGateway` (links JWT de partilha).
  - Filas RabbitMQ para orquestração de processamento.

## 4. Tecnologias e Justificação
- Docker Compose — orquestração dos serviços — ver [docker-compose.yaml](../docker-compose.yaml)
- Node.js/Express, Next.js, Tailwind CSS, MinIO, RabbitMQ, Nginx.
- Justificar escolhas, trade-offs e alternativas consideradas.

## 5. Funcionalidades Implementadas
- Conta de utilizador: registo/login e sessão — ver [frontend/app/login](../frontend/app/login) e [users/routes](../users/routes)
- Gestão de projetos — ver [frontend/app/dashboard](../frontend/app/dashboard)
- Submissão e processamento de imagens (ferramentas comuns e AI) — ver [Tools/](../Tools)
- Cancelamento de processamento (compatibilidade POST e DELETE) — ver [apiGateway/routes/projects.js](../apiGateway/routes/projects.js)
- Partilha e visualização em tempo real — ver [wsGateway/](../wsGateway)

## 6. Fluxos e UX
- Fluxo "Preview" vs "Apply": explicar comportamento e decisões.
- Após "Apply", navegação para modo resultados e vista grelha.
- Ferramentas AI: aplicar sem necessidade de preview.
- Descrever estados de carregamento, erros e notificações.

## 7. API e Endpoints Relevantes
Principais endpoints (método, caminho, serviço, propósito):

- `GET /:user` — apiGateway/projects: lista projetos do utilizador.
- `GET /:user/:project` — apiGateway/projects: detalhes do projeto + imagens.
- `POST /:user/:project/img` — apiGateway/projects: upload de imagem para o projeto.
- `GET /:user/:project/imgs` — apiGateway/projects: lista de imagens (URLs presign). 
- `GET /:user/:project/process` — apiGateway/projects: download ZIP dos resultados.
- `GET /:user/:project/process/url` — apiGateway/projects: URLs dos resultados.
- `POST /:user/:project/process` — apiGateway/projects: iniciar processamento.
- `POST /:user/:project/process/cancel` — apiGateway/projects: cancelar (legacy, compatibilidade).
- `DELETE /:user/:project/process` — apiGateway/projects: cancelar (preferível).
- `POST /:user/:project/tool` — apiGateway/projects: adicionar ferramenta ao projeto.
- `PUT /:user/:project` — apiGateway/projects: atualizar projeto.
- `DELETE /:user/:project` — apiGateway/projects: remover projeto.

- `POST /projects/:id/share` — wsGateway/shareRoutes: gerar link de partilha JWT.
- `GET /share/validate` — wsGateway/shareRoutes: validar token de partilha.
- `POST /share/consume` — wsGateway/shareRoutes: consumir token single-use.

- `GET /validate/:user` — apiGateway/users: valida JWT.
- `POST /` — apiGateway/users: registo; `POST /:email/login`: login.
- `PUT /:user` — apiGateway/users: atualizar utilizador; `DELETE /:user`: apagar.

- `GET /:user` — apiGateway/subscriptions: obter subscrição; `GET /:user/status`.
- `POST /` — apiGateway/subscriptions: criar subscrição + cartão.
- `PUT /:user` — apiGateway/subscriptions: atualizar; `PUT /:user/cancel`: cancelar.
- `PUT /:user/card` — apiGateway/subscriptions: atualizar cartão.

- `POST /:userId/:projectId/:stage` — minio/upload: enviar imagem (`src|preview|out`).
- `GET /docker|/host/:userId/:projectId/:stage/:imageName` — minio/images: obter URL presign.
- `DELETE /:userId/:projectId/:stage/:fileName` — minio/delete: apagar ficheiro.

- `GET /` — imageStorageService/index: health; `POST /`: upload direto; `GET /:filename` e `DELETE /:filename`.

## 8. Segurança
- Certificados e TLS (pastas `certs/` nos serviços). Proxy no [nginx/nginx.conf](../nginx/nginx.conf).
- Autenticação/Middleware: referenciar onde é aplicado.
- Considerações de permissões e isolamento entre serviços.

## 9. Testes e Validação
- Estratégia de testes (manuais e/ou automatizados).
- Como reproduzir os testes:
```bash
# Build e subida dos serviços
docker compose build
docker compose up -d

# Rebuild sem cache (quando necessário)
docker compose build --no-cache
docker compose up -d
```
- Casos de teste: upload, aplicar ferramenta comum, aplicar ferramenta AI, cancelar processamento, partilha.
- Resultados observados (screenshots e tempos, se relevantes).

## 10. Resultados
- Imagens de exemplo, estado final dos projetos, tabelas de resultados.
- Métricas básicas (ex.: tempo médio por ferramenta, taxa de sucesso).

## 11. Problemas e Resoluções
- Conflitos de merge (decisão: manter endpoints POST e DELETE). 
- Correção de navegação pós-"Apply" e comportamento das ferramentas AI.
- Outros desafios e como foram mitigados.

## 12. Trabalho Futuro
- Melhorias de UX, feedback em tempo real, métricas e observabilidade.
- Controlo de quotas/limites, escalabilidade dos workers, caching.

## 13. Conclusões
- Lições aprendidas e avaliação do cumprimento dos objetivos.
- Principais contributos e próximos passos.

## 14. Referências
- Documentação oficial das tecnologias utilizadas.
- Artigos/recursos relevantes.

## 15. Anexos
- Diagramas, logs, configurações detalhadas e comandos complementares.

---

### Checklist de Entrega
- Objetivos e requisitos claramente mapeados.
- Arquitetura e responsabilidades por serviço documentadas.
- Fluxos UX descritos (Preview/Apply/Resultados).
- Endpoints principais listados e justificados.
- Testes reprodutíveis com comandos Docker.
- Problemas e resoluções explicados.
- Conclusões e trabalho futuro.

> Nota: Preencher com evidências (capturas, outputs e links para ficheiros do workspace) sempre que possível.
