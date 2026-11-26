import type { SQLiteDatabase } from 'expo-sqlite';

import { DatabaseError, toDatabaseError } from '../errors';
import { dbLogger } from '../logger';
import { migration001 } from './001_initial_schema';
import { migration002 } from './002_add_indexes';
import type { Migration } from './types';

/** Все миграции по возрастанию версии. Новые добавляются в конец. */
export const MIGRATIONS: Migration[] = [migration001, migration002];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Текущая версия схемы хранится в PRAGMA user_version. */
export async function getSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Применяет все миграции, версия которых больше текущей.
 * Каждая миграция и обновление user_version выполняются в одной транзакции:
 * при ошибке схема остаётся на предыдущей версии.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<number> {
  const current = await getSchemaVersion(db);

  if (current > LATEST_VERSION) {
    throw new DatabaseError(
      'MIGRATION',
      `База данных создана более новой версией приложения (схема v${current}, поддерживается до v${LATEST_VERSION}).`,
    );
  }

  const pending = MIGRATIONS.filter((m) => m.version > current);
  if (pending.length === 0) {
    dbLogger.info(`схема актуальна (v${current})`);
    return current;
  }

  for (const migration of pending) {
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await migration.up(txn);
        // PRAGMA не поддерживает параметры; version — число из кода, не из пользовательского ввода.
        await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
      });
      dbLogger.info(`миграция v${migration.version} (${migration.name}) применена`);
    } catch (error) {
      throw toDatabaseError(error, 'MIGRATION', `migration v${migration.version} ${migration.name}`);
    }
  }

  return LATEST_VERSION;
}
