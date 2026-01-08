# Observer Pattern Implementation - Project Sharing System

## Visão Geral

Este documento descreve a implementação do **padrão Observer** no sistema de partilha de projetos da aplicação PIcturas. O padrão Observer é um padrão de design comportamental que permite que um objeto (Subject) notifique automaticamente outros objetos (Observers) quando o seu estado muda.

## Arquitetura

### Componentes Principais

#### 1. **Subject (ProjectSubject)**
- **Localização**: `wsGateway/observers/ProjectObserver.js`
- **Responsabilidade**: Representa um projeto partilhado e mantém uma lista de observadores (utilizadores com acesso)
- **Métodos principais**:
  - `attach(userId, observerData)`: Adiciona um observador ao projeto
  - `detach(userId)`: Remove um observador do projeto
  - `notify(eventType, data, io)`: Notifica todos os observadores de uma alteração
  - `notifyOne(userId, eventType, data, io)`: Notifica um observador específico

#### 2. **Observer (Utilizadores Conectados)**
- **Localização**: Frontend - clientes conectados via WebSocket
- **Responsabilidade**: Receber notificações de alterações em projetos partilhados
- **Tipos de observadores**:
  - **Owner**: Dono do projeto (sempre pode editar)
  - **View**: Utilizador com permissão apenas de visualização
  - **Edit**: Utilizador com permissão de edição

#### 3. **Manager (ProjectObserverManager)**
- **Localização**: `wsGateway/observers/ProjectObserver.js`
- **Responsabilidade**: Gerir múltiplos ProjectSubjects (projetos partilhados)
- **Métodos principais**:
  - `subscribe(projectId, ownerId, userId, observerData)`: Subscreve um utilizador a um projeto
  - `unsubscribe(projectId, userId)`: Remove subscrição de um utilizador
  - `notifyProject(projectId, eventType, data, io)`: Notifica todos os observadores de um projeto
  - `getStats()`: Retorna estatísticas sobre observadores ativos

## Fluxo de Funcionamento

### 1. Subscrição (Attach Observer)

```
┌─────────────┐          ┌──────────────┐          ┌─────────────────┐
│  Frontend   │          │  wsGateway   │          │ ObserverManager │
│  (Observer) │          │              │          │                 │
└──────┬──────┘          └──────┬───────┘          └────────┬────────┘
       │                        │                           │
       │ Connect + shareToken   │                           │
       ├───────────────────────>│                           │
       │                        │                           │
       │                        │ subscribe(projectId,      │
       │                        │  ownerId, userId, {...})  │
       │                        ├──────────────────────────>│
       │                        │                           │
       │                        │                           │ Create/Get
       │                        │                           │ ProjectSubject
       │                        │                           │
       │                        │<──────────────────────────┤
       │                        │                           │
       │                        │ Join room (ownerId)       │
       │<───────────────────────┤                           │
       │                        │                           │
```

**Processo**:
1. Cliente frontend conecta ao WebSocket com `shareToken`
2. wsGateway verifica o token e extrai `projectId`, `ownerId`, `permission`
3. ObserverManager cria ou obtém o ProjectSubject para o projeto
4. ProjectSubject adiciona o utilizador à lista de observadores
5. Cliente junta-se à room do owner para receber notificações

### 2. Notificação (Notify Observers)

```
┌──────────────┐          ┌─────────────────┐          ┌─────────────┐
│   RabbitMQ   │          │ ObserverManager │          │  Observers  │
│              │          │                 │          │ (Frontends) │
└──────┬───────┘          └────────┬────────┘          └──────┬──────┘
       │                           │                          │
       │ Message: preview-ready    │                          │
       ├──────────────────────────>│                          │
       │                           │                          │
       │                           │ notifyProject(           │
       │                           │  projectId, 'preview-    │
       │                           │  ready', {img_url})      │
       │                           │                          │
       │                           │ Emit 'project-update'    │
       │                           ├─────────────────────────>│
       │                           ├─────────────────────────>│
       │                           ├─────────────────────────>│
       │                           │                          │
       │                           │                          │ Update UI
       │                           │                          │ with new
       │                           │                          │ preview
```

**Processo**:
1. Backend processa uma operação (preview, apply, etc.)
2. Envia mensagem para RabbitMQ (ws_queue)
3. wsGateway recebe mensagem e extrai `projectId`
4. ObserverManager notifica todos os observadores do projeto
5. Cada observador (frontend) recebe evento `project-update`
6. Frontend atualiza UI conforme o tipo de evento

### 3. Dessubscrição (Detach Observer)

```
┌─────────────┐          ┌──────────────┐          ┌─────────────────┐
│  Frontend   │          │  wsGateway   │          │ ObserverManager │
│  (Observer) │          │              │          │                 │
└──────┬──────┘          └──────┬───────┘          └────────┬────────┘
       │                        │                           │
       │ Disconnect             │                           │
       ├───────────────────────>│                           │
       │                        │                           │
       │                        │ unsubscribe(projectId,    │
       │                        │  userId)                  │
       │                        ├──────────────────────────>│
       │                        │                           │
       │                        │                           │ Remove observer
       │                        │                           │ from ProjectSubject
       │                        │                           │
       │                        │<──────────────────────────┤
       │                        │                           │
       │                        │                           │ If no observers:
       │                        │                           │ Delete ProjectSubject
```

## Tipos de Eventos

### Eventos Notificados aos Observers

| Evento | Descrição | Dados |
|--------|-----------|-------|
| `preview-ready` | Preview de imagem pronto | `{ img_url: string }` |
| `preview-error` | Erro no preview | `{ error_code: string, error_msg: string }` |
| `process-update` | Atualização no processamento | `{ messageId: string }` |
| `process-error` | Erro no processamento | `{ error_code: string, error_msg: string, messageId: string }` |
| `observer-joined` | Novo observador entrou | `{ observerId: string, permission: string }` |

## Permissões

O sistema verifica permissões antes de notificar:

```javascript
_hasPermission(observer, eventType) {
    const permission = observer.permission || 'view';
    
    // View-only observers can see all updates but not modify
    if (permission === 'view') {
        return true;
    }
    
    // Edit permission allows all notifications
    if (permission === 'edit') {
        return true;
    }
    
    return false;
}
```

## Integração Frontend

### Conexão com Observer Pattern

```typescript
// Frontend conecta passando shareToken
const socket = useGetSocket(session.token, roomId, shareToken);

// Socket.IO auth payload
{
  token: userJWT,
  roomId: ownerUserId,
  shareToken: projectShareToken  // ← Observer Pattern
}
```

### Listener de Eventos

```typescript
useEffect(() => {
  if (!socket.data || !shareToken) return;

  const handleProjectUpdate = (data: any) => {
    const { eventType, projectId, data: eventData } = data;
    
    // Only process updates for the current project
    if (projectId !== pid) return;

    switch (eventType) {
      case 'preview-ready':
        // Show updated preview
        break;
      case 'process-update':
        // Refetch project data
        refetchSharedProject();
        break;
      // ... outros eventos
    }
  };

  socket.data.on('project-update', handleProjectUpdate);

  return () => {
    socket.data.off('project-update', handleProjectUpdate);
  };
}, [socket.data, shareToken, pid]);
```

## Vantagens da Implementação

1. **Desacoplamento**: Frontend não precisa polling; recebe notificações automaticamente
2. **Escalabilidade**: Fácil adicionar novos tipos de eventos
3. **Eficiência**: Apenas observadores interessados recebem notificações
4. **Controle de Acesso**: Permissões verificadas antes de notificar
5. **Gestão de Recursos**: ProjectSubjects são removidos quando não há observadores

## Exemplo Completo de Uso

### Cenário: Utilizador A partilha projeto com Utilizador B

```
1. Utilizador A cria share link:
   - Backend gera shareToken JWT com {owner: A, projectId: X, permission: 'view'}

2. Utilizador B acede ao link:
   - Frontend extrai shareToken da URL
   - Conecta WebSocket passando shareToken no auth

3. wsGateway processa conexão:
   - Verifica shareToken
   - ObserverManager.subscribe(projectId: X, owner: A, observer: B, {permission: 'view'})
   - B junta-se à room de A

4. Utilizador A aplica ferramenta Black & White:
   - Backend processa → envia mensagem RabbitMQ
   - wsGateway recebe → ObserverManager.notifyProject(X, 'process-update')
   - B recebe evento 'project-update' → UI atualiza automaticamente

5. Utilizador B desconecta:
   - ObserverManager.unsubscribe(X, B)
   - Se não há mais observadores, ProjectSubject é removido
```

## Debugging

### Ver estatísticas de observadores (via Socket.IO):

```javascript
// Frontend
socket.emit('get-observer-stats');

socket.on('observer-stats', (stats) => {
  console.log('Total projects:', stats.totalProjects);
  console.log('Projects:', stats.projects);
  // Output:
  // {
  //   totalProjects: 2,
  //   projects: [
  //     { projectId: 'abc123', ownerId: 'user1', observerCount: 3 },
  //     { projectId: 'def456', ownerId: 'user2', observerCount: 1 }
  //   ]
  // }
});
```

### Logs do wsGateway:

```
[Observer] User userB subscribed to project projectX
[Observer] Notifying 2 observers of preview-ready on project projectX
[Observer] User userB unsubscribed from project projectX
[Observer] Removing subject for project projectX (no more observers)
```

## Ficheiros Modificados

- `wsGateway/observers/ProjectObserver.js` (novo)
- `wsGateway/index.js`
- `frontend/lib/queries/projects.ts`
- `frontend/app/dashboard/[pid]/page.tsx`

## Próximos Passos / Melhorias Futuras

1. **Persistência**: Guardar observadores em Redis para sobreviver a restarts
2. **Rate Limiting**: Limitar frequência de notificações por observer
3. **Eventos Granulares**: Adicionar eventos para cada tipo de alteração (image-added, tool-removed, etc.)
4. **Histórico**: Manter histórico de eventos para observers que reconectam
5. **Presença**: Mostrar quais utilizadores estão a visualizar o projeto em tempo real
