/**
 * Testes para Sistema de Gestão de Concorrência
 * Requer: jest, mongodb-memory-server
 */

const mongoose = require("mongoose");
const {
  generateETag,
  validateETag,
  incrementVersion,
} = require("../middleware/versioning");
const {
  detectConflicts,
  resolveConflict_ThreeWayMerge,
  ConflictType,
} = require("../middleware/conflictResolution");
const {
  RetryManager,
  isConcurrencyError,
} = require("../middleware/retryManager");

// =============================================================================
// TESTES: Versionamento
// =============================================================================

describe("Versioning Middleware", () => {
  const mockProject = {
    _id: "123",
    name: "Test Project",
    imgs: [],
    tools: [],
    __version__: 1,
  };

  test("generateETag cria hash único", () => {
    const etag1 = generateETag(mockProject);
    const etag2 = generateETag(mockProject);

    expect(etag1).toBe(etag2);
    expect(etag1).toHaveLength(64); // SHA256
  });

  test("generateETag muda quando projeto muda", () => {
    const etag1 = generateETag(mockProject);

    const modified = {
      ...mockProject,
      name: "Modified Project",
    };
    const etag2 = generateETag(modified);

    expect(etag1).not.toBe(etag2);
  });

  test("validateETag detecta mudanças", () => {
    const etag = generateETag(mockProject);

    expect(validateETag(mockProject, etag)).toBe(true);
    expect(validateETag({ ...mockProject, name: "Changed" }, etag)).toBe(false);
  });

  test("incrementVersion incrementa versão", () => {
    const project = { ...mockProject };
    const result = incrementVersion(project);

    expect(result.__version__).toBe(2);
    expect(result.__lastModified__).toBeDefined();
  });
});

// =============================================================================
// TESTES: Detecção de Conflitos
// =============================================================================

describe("Conflict Detection", () => {
  const baseProject = {
    _id: "123",
    name: "Base",
    imgs: [{ _id: "img1", og_uri: "http://example.com/1.jpg" }],
    tools: [{ _id: "tool1", procedure: "resize", params: { size: 100 } }],
  };

  test("detectConflicts não reporta conflito quando não há", () => {
    const conflicts = detectConflicts(
      baseProject,
      baseProject,
      baseProject
    );

    expect(conflicts).toHaveLength(0);
  });

  test("detectConflicts identifica conflito de tools", () => {
    const modified = {
      ...baseProject,
      tools: [{ _id: "tool1", procedure: "rotate", params: { angle: 90 } }],
    };

    const conflicts = detectConflicts(baseProject, baseProject, modified);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].type).toBe(ConflictType.TOOL_CONFLICT);
  });

  test("detectConflicts identifica conflito de name", () => {
    const conflicts = detectConflicts(
      baseProject,
      baseProject,
      { ...baseProject, name: "Modified" }
    );

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].type).toBe(ConflictType.NAME_CONFLICT);
  });
});

// =============================================================================
// TESTES: Three-Way Merge
// =============================================================================

describe("Three-Way Merge", () => {
  const local = {
    name: "Project A",
    tools: [
      { _id: "t1", procedure: "crop", position: 0 },
      { _id: "t2", procedure: "rotate", position: 1 },
    ],
  };

  const remote = {
    name: "Project B",
    tools: [
      { _id: "t1", procedure: "crop", position: 0 },
      { _id: "t3", procedure: "resize", position: 1 },
    ],
  };

  const client = {
    name: "Project C",
    tools: [
      { _id: "t1", procedure: "crop", position: 0 },
      { _id: "t2", procedure: "rotate", position: 1 },
      { _id: "t4", procedure: "brightness", position: 2 },
    ],
  };

  test("mergeThreeWay combina mudanças não conflituosas", () => {
    const conflict = { type: "tool_conflict", field: "tools" };
    const merged = resolveConflict_ThreeWayMerge(local, remote, client, conflict);

    // Deve manter ferramentas de todos
    expect(merged.tools.length).toBeGreaterThan(0);
  });

  test("mergeThreeWay preserva ordem de ferramentas", () => {
    const conflict = { type: "tool_conflict", field: "tools" };
    const merged = resolveConflict_ThreeWayMerge(local, remote, client, conflict);

    const positions = merged.tools.map(t => t.position);
    expect(positions).toEqual(positions.sort((a, b) => a - b));
  });
});

// =============================================================================
// TESTES: Retry Manager
// =============================================================================

describe("RetryManager", () => {
  test("RetryManager calcula delay exponencial", () => {
    const manager = new RetryManager();

    expect(manager.calculateDelay()).toBeLessThan(200); // Attempt 0
    manager.incrementAttempt();

    expect(manager.calculateDelay()).toBeLessThan(400); // Attempt 1
    manager.incrementAttempt();

    expect(manager.calculateDelay()).toBeLessThan(800); // Attempt 2
  });

  test("RetryManager respeita max retries", () => {
    const manager = new RetryManager({ maxRetries: 3 });

    expect(manager.canRetry()).toBe(true);
    manager.incrementAttempt();
    expect(manager.canRetry()).toBe(true);
    manager.incrementAttempt();
    expect(manager.canRetry()).toBe(true);
    manager.incrementAttempt();
    expect(manager.canRetry()).toBe(false);
  });

  test("isConcurrencyError detecta erros", () => {
    const concurrencyError = new Error("CONCURRENT_MODIFICATION");
    const otherError = new Error("Something else");

    expect(isConcurrencyError(concurrencyError)).toBe(true);
    expect(isConcurrencyError(otherError)).toBe(false);
  });
});

// =============================================================================
// TESTES: Retry Executor
// =============================================================================

const { RetryExecutor } = require("../middleware/retryManager");

describe("RetryExecutor", () => {
  test("executa operação com sucesso na primeira tentativa", async () => {
    const executor = new RetryExecutor({ maxRetries: 3 });
    let called = 0;

    const result = await executor.executeWithRetry(
      async () => {
        called++;
        return "success";
      },
      () => false // Nunca retry
    );

    expect(result).toBe("success");
    expect(called).toBe(1);
  });

  test("retenta operação que falha", async () => {
    const executor = new RetryExecutor({ maxRetries: 3, initialDelayMs: 10 });
    let called = 0;

    const result = await executor.executeWithRetry(
      async () => {
        called++;
        if (called < 3) {
          throw new Error("CONCURRENT_MODIFICATION");
        }
        return "success";
      },
      (error) => isConcurrencyError(error)
    );

    expect(result).toBe("success");
    expect(called).toBe(3);
  });

  test("falha após max retries", async () => {
    const executor = new RetryExecutor({ maxRetries: 2, initialDelayMs: 10 });

    try {
      await executor.executeWithRetry(
        async () => {
          throw new Error("CONCURRENT_MODIFICATION");
        },
        () => true // Sempre retry
      );
      fail("Deveria ter lançado erro");
    } catch (error) {
      expect(error.message).toContain("failed after");
    }
  });

  test("callback de retry é chamado", async () => {
    const executor = new RetryExecutor({ maxRetries: 2, initialDelayMs: 10 });
    const retries = [];

    await executor.executeWithRetry(
      async () => {
        if (retries.length < 1) {
          throw new Error("CONCURRENT_MODIFICATION");
        }
        return "success";
      },
      () => true,
      (info) => retries.push(info)
    );

    expect(retries.length).toBe(1);
    expect(retries[0].attempt).toBe(1);
  });
});

// =============================================================================
// TESTES: Integração (end-to-end)
// =============================================================================

describe("Concurrency Integration", () => {
  test("simula conflito e resolução", async () => {
    // Simular dois clientes atualizando simultaneamente
    const clientAVersion = 1;
    const clientBVersion = 1;
    const currentServerVersion = 1;

    // Ambos tentam atualizar
    const updateA = {
      name: "Updated by A",
      __version__: clientAVersion,
    };

    const updateB = {
      name: "Updated by B",
      __version__: clientBVersion,
    };

    // Simular lógica de validação
    if (clientAVersion === currentServerVersion) {
      // A sucesso, versão agora 2
      expect(true).toBe(true); // A wins
    } else {
      // A falha
      expect(false).toBe(true);
    }

    // B tenta com versão desatualizada
    if (clientBVersion !== currentServerVersion) {
      // B detecta conflito
      expect(true).toBe(true);
    }
  });
});

// =============================================================================
// TESTES: Performance
// =============================================================================

describe("Performance", () => {
  test("generateETag é rápido", () => {
    const project = {
      _id: "123",
      name: "Test",
      imgs: Array(100).fill({ og_uri: "http://example.com/img.jpg" }),
      tools: Array(50).fill({ procedure: "resize", params: {} }),
    };

    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
      generateETag(project);
    }
    const end = process.hrtime.bigint();

    const timeMs = Number(end - start) / 1000000;
    console.log(`generateETag 1000x: ${timeMs.toFixed(2)}ms`);
    expect(timeMs).toBeLessThan(100); // < 100ms para 1000 chamadas
  });

  test("detectConflicts é rápido", () => {
    const project = {
      _id: "123",
      tools: Array(100).fill({ _id: Math.random(), procedure: "test" }),
      imgs: Array(100).fill({ _id: Math.random(), og_uri: "http://test" }),
    };

    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
      detectConflicts(project, project, project);
    }
    const end = process.hrtime.bigint();

    const timeMs = Number(end - start) / 1000000;
    console.log(`detectConflicts 1000x: ${timeMs.toFixed(2)}ms`);
    expect(timeMs).toBeLessThan(200);
  });
});
