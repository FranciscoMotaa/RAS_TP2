// Script para fazer upgrade do utilizador para Premium
// USO: docker compose exec -T users_mongoDB mongo --port 27019 user < upgrade-to-premium.js

const userId = "6960e80cd15133fd1643215c"; // ID do utilizador (ajustar conforme necessário)

// Atualizar para premium
db.users.updateOne(
  { _id: ObjectId(userId) },
  { $set: { type: "premium" } }
);

print("✓ Utilizador " + userId + " atualizado para Premium");

// Mostrar estado atual
const user = db.users.findOne({ _id: ObjectId(userId) });
print("\nEstado atual:");
print("  Nome: " + user.name);
print("  Email: " + user.email);
print("  Tipo: " + user.type);
print("  Operações: " + JSON.stringify(user.operations));
