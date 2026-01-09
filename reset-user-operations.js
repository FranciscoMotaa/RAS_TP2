// Script para resetar operações diárias de um utilizador
// USO: docker compose exec -T users_mongoDB mongo --port 27019 user < reset-user-operations.js

const userId = "6960e80cd15133fd1643215c"; // ID do utilizador (ajustar conforme necessário)

// Conectar e atualizar
db.users.updateOne(
  { _id: ObjectId(userId) },
  { $set: { operations: [] } }
);

print("✓ Operações resetadas para o utilizador " + userId);

// Mostrar estado atual
const user = db.users.findOne({ _id: ObjectId(userId) });
print("\nEstado atual:");
print("  Tipo: " + user.type);
print("  Operações: " + JSON.stringify(user.operations));
