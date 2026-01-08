# Guia de Integração - Gestão de Concorrência

## Passo-a-Passo para Integrar no Projeto Existente

### 1. Instalação de Dependências

Adicione ao `package.json` do serviço `projects`:

```json
{
  "dependencies": {
    "socket.io": "^4.6.0",
    "socket.io-client": "^4.6.0"
  }
}
```

```bash
cd projects/
npm install socket.io socket.io-client
```

### 2. Estrutura de Diretórios

Os middlewares já foram criados em:

```
projects/
├── middleware/
│   ├── versioning.js          ✅ Versionamento com ETag
│   ├── conflictResolution.js  ✅ Detecção e merge de conflitos
│   ├── retryManager.js        ✅ Retry com backoff exponencial
│   ├── transactions.js        ✅ Transações ACID MongoDB
│   └── notifications.js       ✅ WebSocket em tempo real
├── controllers/
│   └── project.js             ✅ Atualizado com suporte a concorrência
├── models/
│   └── project.js             ✅ Atualizado com versionamento
├── examples/
│   └── concurrency-examples.js ✅ Exemplos práticos
└── tests/
    └── concurrency.test.js     ✅ Suite de testes
```

### 3. Atualizar `app.js`

```javascript
// app.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { 
  projectEventNotificationMiddleware, 
  setupProjectWebSocket 
} = require('./middleware/notifications');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "https://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middlewares existentes
app.use(express.json());
// ... outros middlewares

// Adicionar middleware de notificação
app.use(projectEventNotificationMiddleware);

// Setup WebSocket
setupProjectWebSocket(io);

// Rotas
const { router: projectsRouter } = require('./routes/projects');
app.use('/', projectsRouter);

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

module.exports = { app, server, io };
```

### 4. Atualizar Rotas Críticas

#### Exemplo: PUT /:user/:project (Atualizar nome)

**Antes:**
```javascript
router.put("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      project.name = req.body.name || project.name;
      Project.update(req.params.user, req.params.project, project)
        .then((_) => res.sendStatus(204))
        .catch((_) => res.status(503).jsonp(`Error updating`));
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring project`));
});
```

**Depois:**
```javascript
const { isConcurrencyError, RetryBuilder } = require("../middleware/retryManager");

router.put("/:user/:project", async (req, res, next) => {
  try {
    const project = await Project.getOne(req.params.user, req.params.project);
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Validar versão do cliente
    const clientVersion = req.body.__version__;
    if (clientVersion !== undefined && clientVersion !== project.__version__) {
      return res.status(409).json({
        error: "CONCURRENT_MODIFICATION",
        message: "Sua versão está desatualizada",
        serverVersion: project.__version__,
      });
    }

    // Atualizar
    const updatedProject = {
      ...project,
      name: req.body.name || project.name,
    };

    const result = await Project.update(
      req.params.user,
      req.params.project,
      updatedProject,
      clientVersion ?? project.__version__
    );

    // Notificar clientes via WebSocket
    req.notifyProjectUpdate(req.params.project, req.params.user, {
      field: "name",
      value: req.body.name,
      __version__: project.__version__ + 1,
    });

    res.sendStatus(204);

  } catch (error) {
    if (error.code === "CONCURRENT_MODIFICATION") {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});
```

#### Exemplo: POST /:user/:project/tool (Adicionar ferramenta)

```javascript
const { TransactionManager } = require("../middleware/transactions");

router.post("/:user/:project/tool", async (req, res, next) => {
  try {
    const transactionManager = new TransactionManager();
    
    const result = await transactionManager.executeWithTransactionRetry(
      async (session) => {
        const project = await Project.findOne(
          { user_id: req.params.user, _id: req.params.project },
          null,
          { session }
        );

        if (!project) {
          throw new Error("Project not found");
        }

        const tool = {
          position: project.tools.length,
          ...req.body,
        };

        const updated = await Project.findOneAndUpdate(
          { user_id: req.params.user, _id: req.params.project },
          {
            $push: { tools: tool },
            $inc: { __version__: 1 },
            $set: { __lastModified__: new Date() },
          },
          { session, new: true }
        );

        return { success: true, tool, version: updated.__version__ };
      }
    );

    // Notificar
    req.notifyProjectUpdate(req.params.project, req.params.user, {
      field: "tools",
      action: "added",
      tool: result.tool,
    });

    res.status(201).json(result);

  } catch (error) {
    console.error("[ADD TOOL ERROR]", error.message);
    res.status(500).json({ error: error.message });
  }
});
```

### 5. Frontend - Cliente React/Next.js

#### Hook para atualizar com retry

```typescript
// hooks/useProjectUpdate.ts
import { useState, useCallback } from 'react';

export function useProjectUpdate(projectId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateWithRetry = useCallback(
    async (updates: any, maxRetries = 3) => {
      setLoading(true);
      setError(null);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // 1. Fetch versão atual
          const res = await fetch(`/api/projects/${projectId}`);
          const current = await res.json();

          // 2. Tentar atualizar
          const updateRes = await fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...updates,
              __version__: current.__version__,
            }),
          });

          if (updateRes.ok) {
            setLoading(false);
            return await updateRes.json();
          }

          if (updateRes.status === 409 && attempt < maxRetries) {
            // Conflito - retry
            await new Promise(r => setTimeout(r, 100 * attempt));
            continue;
          }

          throw new Error(`HTTP ${updateRes.status}`);

        } catch (err) {
          if (attempt === maxRetries) {
            setError(err.message);
            throw err;
          }
        }
      }
    },
    [projectId]
  );

  return { loading, error, updateWithRetry };
}
```

#### Usar em componentes

```typescript
// components/ProjectEditor.tsx
import { useProjectUpdate } from '@/hooks/useProjectUpdate';

export function ProjectEditor({ projectId }: { projectId: string }) {
  const { updateWithRetry, loading, error } = useProjectUpdate(projectId);
  const [name, setName] = useState('');

  const handleSave = async () => {
    try {
      await updateWithRetry({ name });
      toast.success('Projeto atualizado!');
    } catch (err) {
      toast.error('Erro ao atualizar. Tente novamente.');
    }
  };

  return (
    <div>
      <input value={name} onChange={e => setName(e.target.value)} />
      <button onClick={handleSave} disabled={loading}>
        {loading ? 'Salvando...' : 'Guardar'}
      </button>
      {error && <span style={{ color: 'red' }}>{error}</span>}
    </div>
  );
}
```

#### Escutar eventos WebSocket

```typescript
// hooks/useProjectEvents.ts
import { useEffect } from 'react';
import { io } from 'socket.io-client';

export function useProjectEvents(projectId: string, userId: string) {
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:3000', {
      secure: true,
      rejectUnauthorized: false,
    });

    // Subscrever
    socket.emit('project:subscribe', { userId, projectId });

    // Ouvir eventos
    socket.on('project:event', (event) => {
      console.log('[Project Event]', event);

      switch (event.type) {
        case 'PROJECT_UPDATED':
          console.log('Projeto foi atualizado:', event.data);
          // Recarregar dados
          refetchProject?.();
          break;

        case 'CONCURRENT_MODIFICATION':
          console.warn('Conflito detectado:', event.conflict);
          toast.warning('Outro utilizador está a editar este projeto');
          break;

        case 'STALE_VERSION':
          toast.info(event.message);
          break;
      }
    });

    return () => {
      socket.emit('project:unsubscribe', { userId, projectId });
      socket.disconnect();
    };
  }, [projectId, userId]);
}
```

### 6. Variáveis de Ambiente

Adicionar ao `.env`:

```env
# Projects Service
MONGO_URL=mongodb://projects_mongoDB:27018/project
NODE_ENV=production
PORT=10000

# WebSocket
WEBSOCKET_PORT=10000
WEBSOCKET_URL=https://projects:10000

# CORS
FRONTEND_URL=https://frontend:3000

# Retry Config
RETRY_MAX_ATTEMPTS=5
RETRY_INITIAL_DELAY_MS=100
RETRY_MAX_DELAY_MS=5000
```

### 7. Testes

Executar suite de testes:

```bash
cd projects/
npm test -- tests/concurrency.test.js
```

Teste manual com curl:

```bash
# Terminal 1
curl -X PUT http://localhost:10000/projects/user1/project1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Fotos A", "__version__": 1}'

# Terminal 2 (simultaneamente)
curl -X PUT http://localhost:10000/projects/user1/project1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Fotos B", "__version__": 1}'

# Uma deverá retornar 409 Conflict
```

### 8. Monitoramento e Logging

Adicionar logs para rastrear conflitos:

```javascript
// app.js
const logger = require('morgan');

app.use(logger('combined', {
  skip: (req, res) => res.statusCode < 400,
  stream: process.stderr // Log apenas erros
}));

// Middleware de logging customizado
app.use((req, res, next) => {
  if (req.path.includes('/project') && req.method !== 'GET') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - v${req.body?.__version__}`);
  }
  next();
});
```

### 9. Checklist de Integração

- ✅ Instalou socket.io
- ✅ Criou middleware de versionamento
- ✅ Criou middleware de conflitos
- ✅ Criou middleware de retry
- ✅ Criou middleware de transações
- ✅ Criou middleware de WebSocket
- ✅ Atualizou modelo Project
- ✅ Atualizou controladores
- ✅ Atualizou app.js com WebSocket
- ✅ Atualizou rotas críticas
- ✅ Frontend implementado com retry
- ✅ Frontend implementado com WebSocket
- ✅ Testes criados e passando
- ✅ Documentação completa

## Suporte e Troubleshooting

### Erro: "CONCURRENT_MODIFICATION"

**Causa**: Versão do cliente está desatualizada
**Solução**: Cliente deve fazer fetch do estado atual e retry

### Erro: "TransactionCoordinated"

**Causa**: Conflito em transação MongoDB
**Solução**: Automaticamente retentado, máximo 3 vezes

### WebSocket não conecta

**Causa**: CORS mal configurado
**Solução**: Verificar `FRONTEND_URL` em .env

### Performance lenta com muitos conflitos

**Causa**: Demasiados retries
**Solução**: Ajustar `RETRY_MAX_DELAY_MS` e analisar padrão de conflitos

---

Documentação completa em [CONCURRENCY_MANAGEMENT.md](./CONCURRENCY_MANAGEMENT.md)
