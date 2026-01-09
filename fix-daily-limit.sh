#!/bin/bash
# Script para resolver o erro de limite diário de operações AI

echo "=== Resolver erro 404: Daily Operations Limit ==="
echo ""
echo "O erro ocorre porque utilizadores FREE têm limite de 5 operações AI por dia."
echo "Cada imagem × cada ferramenta AI conta como 1 operação."
echo ""
echo "Soluções disponíveis:"
echo ""
echo "OPÇÃO 1: Fazer upgrade para Premium (processamento ilimitado)"
echo "  - No frontend: Ir para Account Settings e fazer upgrade"
echo "  - Via Subscriptions API endpoint"
echo ""
echo "OPÇÃO 2: Resetar contador de operações (apenas para testes)"
echo "  Execute:"
echo "  docker compose exec -T users node -p \"require('./controllers/user').then(m => m.default.getAll()).then(users => users.forEach(u => {u.operations = []; return require('./controllers/user').default.update(u._id, u);}))\" 2>/dev/null"
echo ""
echo "OPÇÃO 3: Aguardar até amanhã (contador reseta automaticamente)"
echo ""
echo "OPÇÃO 4: Remover ferramentas AI do projeto"
echo "  - Usar apenas ferramentas comuns (resize, rotate, crop, etc.)"
echo "  - Ferramentas AI: cut_ai, upgrade_ai, bg_remove_ai, text_ai, obj_ai, people_ai"
echo ""

read -p "Escolher opção (1-4): " option

case $option in
  1)
    echo "Para fazer upgrade:"
    echo "1. Aceda ao frontend em http://localhost:3000"
    echo "2. Vá para Account Settings"
    echo "3. Clique em 'Upgrade to Premium'"
    ;;
  2)
    echo "A resetar operações..."
    docker compose exec -T users_mongoDB mongo --port 27019 user --quiet --eval \
      "db.users.updateMany({}, { \$set: { operations: [] } }); print('✓ Operações resetadas para todos os utilizadores');"
    ;;
  3)
    echo "O contador será resetado automaticamente às 00:00 UTC"
    ;;
  4)
    echo "Remova as ferramentas AI do projeto no frontend e tente novamente"
    ;;
  *)
    echo "Opção inválida"
    ;;
esac
