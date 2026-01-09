# Solução para Erro 404 - Daily Operations Limit

## Problema
Ao clicar em **Apply**, aparece o erro:
```
POST http://localhost:8080/api-gateway/projects/.../process 404 (Not Found)
```

## Causa
Utilizadores **FREE** têm limite de **5 operações AI por dia**.  
Cada **imagem × ferramenta AI** conta como 1 operação.

Ferramentas AI: `cut_ai`, `upgrade_ai`, `bg_remove_ai`, `text_ai`, `obj_ai`, `people_ai`

## ✅ Solução Aplicada

O utilizador `teste@teste.com` foi **atualizado para Premium** com processamento ilimitado:
```bash
✓ Email: teste@teste.com
✓ Tipo: premium  
✓ Operações: 0
```

Agora podes processar quantas imagens e ferramentas AI quiseres! 🎉

---

## Outras Soluções (para referência futura)

### Opção 1: Resetar Contador (apenas para testes)
```bash
docker compose exec -T users_mongoDB mongo --port 27019 user --quiet --eval \
  "db.users.updateMany({}, { \$set: { operations: [] } })"
```

### Opção 2: Upgrade manual de outro utilizador
```bash
# Listar utilizadores
docker compose exec -T users_mongoDB mongo --port 27019 user --quiet --eval \
  "db.users.find().forEach(function(u) { print('ID:', u._id, 'Email:', u.email, 'Tipo:', u.type); });"

# Fazer upgrade (substituir USER_ID)
docker compose exec -T users_mongoDB mongo --port 27019 user --quiet --eval \
  "db.users.updateOne({ _id: ObjectId('USER_ID') }, { \$set: { type: 'premium', operations: [] } });"
```

### Opção 3: Via Frontend
1. Aceder http://localhost:3000  
2. Account Settings → Upgrade to Premium

### Opção 4: Usar apenas ferramentas comuns
Remover ferramentas AI e usar apenas:
- `resize`, `rotate`, `crop`, `brightness`, `contrast`, `saturation`, `border`, `binarization`

---

## Melhorias Implementadas

1. **API Gateway** - Propaga corretamente status 404 e mensagem de erro
2. **Frontend** - Deteta limite diário e mostra mensagem clara:
   ```
   Daily Limit Reached
   You have reached the daily limit for AI tool processing. 
   Upgrade to Premium for unlimited processing or try again tomorrow.
   ```

## Teste
Agora podes testar o Apply com qualquer número de ferramentas AI! ✨
