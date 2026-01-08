/**
 * Middleware para gestão de versionamento e concorrência otimista
 * Implementa estratégia de ETag (Entity Tags) para detecção de conflitos
 */

const crypto = require('crypto');

/**
 * Gera um ETag baseado no conteúdo do projeto
 * @param {Object} project - Documento do projeto
 * @returns {String} ETag (hash SHA256)
 */
function generateETag(project) {
  // Cria um hash do estado do projeto
  const projectStr = JSON.stringify({
    name: project.name,
    imgs: project.imgs,
    tools: project.tools,
    __version__: project.__version__ || 0,
  });
  
  return crypto
    .createHash('sha256')
    .update(projectStr)
    .digest('hex');
}

/**
 * Middleware que calcula e valida ETags
 */
function versioningMiddleware(req, res, next) {
  // Armazena a função original de json para interceptar responses
  const originalJson = res.json;
  
  res.json = function(data) {
    if (data && data._id) {
      // Se é um projeto, gera ETag
      data.__etag__ = generateETag(data);
    }
    
    return originalJson.call(this, data);
  };
  
  next();
}

/**
 * Valida se o ETag recebido corresponde ao estado atual
 * @param {Object} project - Estado atual do projeto
 * @param {String} clientETag - ETag do cliente
 * @returns {Boolean} true se está atualizado, false se houve conflito
 */
function validateETag(project, clientETag) {
  if (!clientETag) {
    return true; // Se não há ETag, assume operação sem validação
  }
  
  const currentETag = generateETag(project);
  return currentETag === clientETag;
}

/**
 * Incrementa versão do projeto
 * @param {Object} project - Documento do projeto
 * @returns {Object} Projeto com versão incrementada
 */
function incrementVersion(project) {
  project.__version__ = (project.__version__ || 0) + 1;
  project.__lastModified__ = new Date().toISOString();
  return project;
}

module.exports = {
  generateETag,
  validateETag,
  incrementVersion,
  versioningMiddleware,
};
