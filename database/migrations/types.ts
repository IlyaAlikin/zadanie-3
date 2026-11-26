import type { SQLiteDatabase } from 'expo-sqlite';

/** Объект, на котором выполняются запросы миграции (БД или транзакция). */
export type MigrationExecutor = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

export interface Migration {
  /** Номер версии схемы после применения миграции (1, 2, 3...). */
  version: number;
  /** Короткое имя для логов. */
  name: string;
  /** Применение миграции. Выполняется внутри транзакции. */
  up: (db: MigrationExecutor) => Promise<void>;
}
