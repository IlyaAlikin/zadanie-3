/**
 * Логирование операций с БД. Работает только в режиме разработки (__DEV__),
 * в production-сборке ничего не выводит.
 */

const PREFIX = '[DB]';

export const dbLogger = {
  info(message: string, details?: unknown) {
    if (!__DEV__) return;
    if (details === undefined) console.log(`${PREFIX} ${message}`);
    else console.log(`${PREFIX} ${message}`, details);
  },

  error(message: string, error: unknown) {
    if (!__DEV__) return;
    console.warn(`${PREFIX} ✖ ${message}`, error);
  },
};

/**
 * Выполняет операцию, логируя её имя, параметры и длительность.
 */
export async function logged<T>(operation: string, params: unknown, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    dbLogger.info(`${operation} ✓ ${Date.now() - start}ms`, params);
    return result;
  } catch (error) {
    dbLogger.error(`${operation} (${Date.now() - start}ms)`, error);
    throw error;
  }
}
