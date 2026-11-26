import * as SQLite from 'expo-sqlite';

import { toDatabaseError } from './errors';
import { dbLogger } from './logger';
import { runMigrations } from './migrations';

export const DATABASE_NAME = 'markers.db';

/**
 * Открывает БД, настраивает соединение и применяет миграции.
 * Сама схема (CREATE TABLE ...) описана в database/migrations.
 */
export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    // Настройки соединения. foreign_keys в SQLite по умолчанию выключены
    // и включаются отдельно для каждого соединения (вне транзакции).
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
    `);

    const version = await runMigrations(db);
    dbLogger.info(`БД открыта: ${db.databasePath}, схема v${version}`);
    return db;
  } catch (error) {
    console.error('Ошибка инициализации базы данных:', error);
    // Не оставляем «висящее» соединение, если инициализация не удалась.
    if (db) {
      await db.closeAsync().catch(() => undefined);
    }
    throw toDatabaseError(error, 'INIT', 'initDatabase');
  }
};

/** Закрывает соединение (ошибки закрытия только логируются). */
export const closeDatabase = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    await db.closeAsync();
    dbLogger.info('соединение закрыто');
  } catch (error) {
    dbLogger.error('ошибка при закрытии БД', error);
  }
};

/** Полностью удаляет файл БД (используется для восстановления после повреждения). */
export const deleteDatabaseFile = async (): Promise<void> => {
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  dbLogger.info('файл БД удалён');
};
