/**
 * Sistema de retry inteligente para operações com conflito de concorrência
 * Implementa backoff exponencial com jitter
 */

/**
 * Configuração padrão de retry
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1, // 10% jitter aleatório
};

/**
 * Classe para gerenciar retries com backoff exponencial
 */
class RetryManager {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    };
    this.attempt = 0;
  }

  /**
   * Calcula delay para o próximo retry
   * Formula: min(initialDelay * (multiplier ^ attempt), maxDelay) + jitter
   */
  calculateDelay() {
    const exponentialDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, this.attempt),
      this.config.maxDelayMs
    );

    // Adiciona jitter aleatório para evitar thundering herd
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
    
    return exponentialDelay + jitter;
  }

  /**
   * Pode tentar novamente?
   */
  canRetry() {
    return this.attempt < this.config.maxRetries;
  }

  /**
   * Incrementa contador de tentativas
   */
  incrementAttempt() {
    this.attempt++;
  }

  /**
   * Retorna estado atual
   */
  getState() {
    return {
      attempt: this.attempt,
      maxRetries: this.config.maxRetries,
      nextDelayMs: this.attempt < this.config.maxRetries ? this.calculateDelay() : null,
    };
  }

  /**
   * Reset para nova operação
   */
  reset() {
    this.attempt = 0;
  }
}

/**
 * Executor de operações com retry automático
 */
class RetryExecutor {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    };
  }

  /**
   * Executa operação com retry automático
   * @param {Function} operation - Função a executar (deve ser async)
   * @param {Function} shouldRetry - Função que determina se deve fazer retry (erro)
   * @param {Function} onRetry - Callback chamado antes de cada retry
   */
  async executeWithRetry(operation, shouldRetry, onRetry = null) {
    const retryManager = new RetryManager(this.config);
    let lastError;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Verifica se é erro que justifica retry
        if (!shouldRetry(error)) {
          throw error;
        }

        // Verifica se ainda há tentativas
        if (!retryManager.canRetry()) {
          const finalError = new Error(
            `Operação falhou após ${retryManager.config.maxRetries} tentativas. ${error.message}`
          );
          finalError.originalError = error;
          finalError.retryState = retryManager.getState();
          throw finalError;
        }

        // Calcula delay e aguarda
        const delay = retryManager.calculateDelay();
        retryManager.incrementAttempt();

        // Callback (opcional)
        if (onRetry) {
          onRetry({
            attempt: retryManager.attempt,
            maxRetries: retryManager.config.maxRetries,
            delayMs: delay,
            error: error.message,
          });
        }

        // Aguarda antes de retry
        await this.sleep(delay);
      }
    }
  }

  /**
   * Promise-based sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Detecta se um erro é devido a conflito de concorrência
 */
function isConcurrencyError(error) {
  if (!error) return false;

  // Erros que indicam conflito
  const concurrencyPatterns = [
    'CONCURRENT_MODIFICATION',
    'stale_version',
    'etag_mismatch',
    'version_conflict',
    'E11000', // Índice único violado (possível conflito)
  ];

  const errorStr = error.message || error.toString();
  return concurrencyPatterns.some(pattern =>
    errorStr.includes(pattern)
  );
}

/**
 * Detecta se um erro é transiente/retentável
 */
function isTransientError(error) {
  if (!error) return false;

  const transientPatterns = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'CONCURRENT_MODIFICATION',
    'timeout',
  ];

  const errorStr = error.message || error.toString();
  return transientPatterns.some(pattern =>
    errorStr.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Builder para criar RetryExecutor com configurações fluentes
 */
class RetryBuilder {
  constructor() {
    this.config = { ...DEFAULT_RETRY_CONFIG };
  }

  withMaxRetries(maxRetries) {
    this.config.maxRetries = maxRetries;
    return this;
  }

  withInitialDelay(ms) {
    this.config.initialDelayMs = ms;
    return this;
  }

  withMaxDelay(ms) {
    this.config.maxDelayMs = ms;
    return this;
  }

  withBackoffMultiplier(multiplier) {
    this.config.backoffMultiplier = multiplier;
    return this;
  }

  withJitterFactor(factor) {
    this.config.jitterFactor = factor;
    return this;
  }

  build() {
    return new RetryExecutor(this.config);
  }
}

module.exports = {
  RetryManager,
  RetryExecutor,
  RetryBuilder,
  isConcurrencyError,
  isTransientError,
  DEFAULT_RETRY_CONFIG,
};
