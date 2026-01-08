/**
 * Estratégias de resolução de conflitos para edições simultâneas
 * Implementa merge inteligente para diferentes tipos de operações
 */

/**
 * Estados de conflito possíveis
 */
const ConflictType = {
  TOOL_CONFLICT: 'tool_conflict',        // Mesmo tool modificado
  IMAGE_CONFLICT: 'image_conflict',      // Mesma imagem modificada
  REORDER_CONFLICT: 'reorder_conflict',  // Ordem de tools alterada
  NAME_CONFLICT: 'name_conflict',        // Nome do projeto alterado
  STALE_VERSION: 'stale_version',        // Versão desatualizada
};

/**
 * Detecta tipos de conflito entre duas versões do projeto
 */
function detectConflicts(localProject, remoteProject, clientChanges) {
  const conflicts = [];
  
  // Detectar conflito em tools
  if (JSON.stringify(localProject.tools) !== JSON.stringify(clientChanges.tools)) {
    if (JSON.stringify(remoteProject.tools) !== JSON.stringify(localProject.tools)) {
      conflicts.push({
        type: ConflictType.TOOL_CONFLICT,
        field: 'tools',
        local: localProject.tools,
        remote: remoteProject.tools,
        client: clientChanges.tools,
      });
    }
  }
  
  // Detectar conflito em imagens
  if (JSON.stringify(localProject.imgs) !== JSON.stringify(clientChanges.imgs)) {
    if (JSON.stringify(remoteProject.imgs) !== JSON.stringify(localProject.imgs)) {
      conflicts.push({
        type: ConflictType.IMAGE_CONFLICT,
        field: 'imgs',
        local: localProject.imgs,
        remote: remoteProject.imgs,
        client: clientChanges.imgs,
      });
    }
  }
  
  // Detectar conflito em nome
  if (localProject.name !== clientChanges.name) {
    if (remoteProject.name !== localProject.name) {
      conflicts.push({
        type: ConflictType.NAME_CONFLICT,
        field: 'name',
        local: localProject.name,
        remote: remoteProject.name,
        client: clientChanges.name,
      });
    }
  }
  
  return conflicts;
}

/**
 * Estratégia 1: Last-Write-Wins (LWW)
 * Simples mas pode perder dados
 */
function resolveConflict_LWW(localProject, remoteProject, clientChanges, conflict) {
  // Cliente sempre vence
  return clientChanges;
}

/**
 * Estratégia 2: Server-Wins
 * O servidor nunca é sobrescrito
 */
function resolveConflict_ServerWins(localProject, remoteProject, clientChanges, conflict) {
  return remoteProject;
}

/**
 * Estratégia 3: Three-Way Merge (recomendado)
 * Combina mudanças se não forem conflituosas
 */
function resolveConflict_ThreeWayMerge(localProject, remoteProject, clientChanges, conflict) {
  const merged = { ...remoteProject };
  
  switch (conflict.type) {
    case ConflictType.TOOL_CONFLICT:
      // Merge tools: manter todos que foram adicionados ou modificados
      merged.tools = mergeArrays(
        localProject.tools,
        remoteProject.tools,
        clientChanges.tools,
        '_id'
      );
      break;
      
    case ConflictType.IMAGE_CONFLICT:
      // Merge imagens: adicionar novas, manter removidas do server
      merged.imgs = mergeArrays(
        localProject.imgs,
        remoteProject.imgs,
        clientChanges.imgs,
        '_id'
      );
      break;
      
    case ConflictType.NAME_CONFLICT:
      // Para nome: client wins (última edição)
      merged.name = clientChanges.name;
      break;
  }
  
  return merged;
}

/**
 * Merge inteligente de arrays (ferramentas, imagens)
 * Baseado em IDs e timestamps
 */
function mergeArrays(local, remote, client, idField) {
  const result = new Map();
  
  // Adicionar elementos remotos (server state)
  remote.forEach(item => {
    result.set(item[idField], { ...item, source: 'remote' });
  });
  
  // Adicionar mudanças do client que não conflituam
  client.forEach(item => {
    const existing = result.get(item[idField]);
    
    if (!existing) {
      // Novo elemento do client
      result.set(item[idField], { ...item, source: 'client' });
    } else if (JSON.stringify(existing) === JSON.stringify(item)) {
      // Mesmo elemento, sem conflito
      result.set(item[idField], item);
    } else if (local.find(l => l[idField] === item[idField])) {
      // Item foi modificado localmente e remotamente
      // Estratégia: manter versão mais recente (baseado em timestamp)
      if (item.__modified__ && existing.__modified__) {
        const itemTime = new Date(item.__modified__).getTime();
        const existingTime = new Date(existing.__modified__).getTime();
        if (itemTime > existingTime) {
          result.set(item[idField], { ...item, source: 'client' });
        }
      } else {
        // Sem timestamp: client wins
        result.set(item[idField], { ...item, source: 'client' });
      }
    }
  });
  
  return Array.from(result.values());
}

/**
 * Estratégia 4: Selective Accept
 * Cliente escolhe qual resolver durante merge
 */
function resolveConflict_SelectiveAccept(localProject, remoteProject, clientChanges, conflict, userChoice) {
  const merged = { ...remoteProject };
  
  if (userChoice === 'client') {
    merged[conflict.field] = clientChanges[conflict.field];
  } else if (userChoice === 'merge') {
    merged[conflict.field] = resolveConflict_ThreeWayMerge(
      localProject,
      remoteProject,
      clientChanges,
      conflict
    )[conflict.field];
  }
  // else: server wins (default)
  
  return merged;
}

/**
 * Cria resposta de conflito para enviar ao cliente
 */
function createConflictResponse(conflicts, localVersion, remoteVersion) {
  return {
    status: 'conflict',
    code: 'CONCURRENT_MODIFICATION',
    message: 'Conflito de edição simultânea detectado',
    conflicts: conflicts.map(c => ({
      type: c.type,
      field: c.field,
      serverValue: c.remote[c.field],
      clientValue: c.client[c.field],
    })),
    localVersion,
    remoteVersion,
    suggestedResolution: 'three-way-merge',
  };
}

module.exports = {
  ConflictType,
  detectConflicts,
  resolveConflict_LWW,
  resolveConflict_ServerWins,
  resolveConflict_ThreeWayMerge,
  resolveConflict_SelectiveAccept,
  mergeArrays,
  createConflictResponse,
};
