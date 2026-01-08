const mongoose = require("mongoose");

const toolSchema = new mongoose.Schema({
  position: { type: Number, required: true },
  procedure: { type: String, required: true },
  params: { type: mongoose.Schema.Types.Mixed, required: true }, // This field can be any type of object
});

const imgSchema = new mongoose.Schema({
  og_uri: { type: String, required: true },
  new_uri: { type: String, required: true },
  og_img_key: { type: String, required: true },
});

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true }, // Maybe mudar para falso por causa de users anónimos, ou procurar alguma solução
  imgs: { type: [imgSchema], default: [] },
  tools: { type: [toolSchema], default: [] },
  
  // Campos para controle de concorrência
  __version__: { type: Number, default: 0 },                              // Versão do documento (optimistic locking)
  __lastModified__: { type: Date, default: Date.now },                   // Timestamp da última modificação
  __lockTimestamp__: { type: Date, default: null },                      // Timestamp de lock pessimista (se usado)
  __lockedBy__: { type: String, default: null },                         // ID do utilizador que tem lock
}, { 
  timestamps: { createdAt: '__createdAt', updatedAt: '__updatedAt' },   // Timestamps automáticos
});

module.exports = mongoose.model("project", projectSchema);
