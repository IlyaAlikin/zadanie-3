import type { SQLiteDatabase } from 'expo-sqlite';

import type { Marker, MarkerImage, MarkerImageRow, MarkerRow } from '../types';
import { DatabaseError, toDatabaseError, type DatabaseErrorKind } from './errors';
import { logged } from './logger';

/**
 * Слой доступа к данным: чистые функции, принимающие соединение с БД.
 * Ничего не знают о React и UI.
 */

// ---------- Вспомогательные функции ----------

const BUSY_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Обёртка для каждой операции: логирование, повтор при `database is locked`
 * (экспоненциальная задержка) и приведение ошибок к DatabaseError.
 */
async function execute<T>(
  operation: string,
  params: unknown,
  fallback: DatabaseErrorKind,
  fn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await logged(operation, params, fn);
    } catch (error) {
      const dbError = toDatabaseError(error, fallback, operation);
      if (dbError.kind === 'BUSY' && attempt < BUSY_RETRIES) {
        await sleep(50 * 2 ** attempt);
        continue;
      }
      throw dbError;
    }
  }
}

/** SQLite CURRENT_TIMESTAMP хранит UTC в формате 'YYYY-MM-DD HH:MM:SS'. */
function sqliteDateToIso(value: string | null): string {
  if (!value) return new Date(0).toISOString();
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function mapMarker(row: MarkerRow): Marker {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: sqliteDateToIso(row.created_at),
    imageCount: row.image_count ?? 0,
  };
}

function mapImage(row: MarkerImageRow): MarkerImage {
  return {
    id: row.id,
    markerId: row.marker_id,
    uri: row.uri,
    createdAt: sqliteDateToIso(row.created_at),
  };
}

function assertId(id: number, what: string) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new DatabaseError('VALIDATION', `Некорректный идентификатор ${what}: ${id}`);
  }
}

function assertCoordinates(latitude: number, longitude: number) {
  const valid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  if (!valid) {
    throw new DatabaseError('VALIDATION', `Некорректные координаты: ${latitude}, ${longitude}`);
  }
}

const MARKER_SELECT = `
  SELECT m.id, m.latitude, m.longitude, m.created_at,
         (SELECT COUNT(*) FROM marker_images i WHERE i.marker_id = m.id) AS image_count
  FROM markers m
`;

// ---------- Маркеры ----------

/** Создаёт маркер, возвращает его id. */
export function insertMarker(db: SQLiteDatabase, latitude: number, longitude: number): Promise<number> {
  return execute('insertMarker', { latitude, longitude }, 'QUERY', async () => {
    assertCoordinates(latitude, longitude);
    const result = await db.runAsync(
      'INSERT INTO markers (latitude, longitude) VALUES (?, ?)',
      latitude,
      longitude,
    );
    return result.lastInsertRowId;
  });
}

/** Все маркеры с количеством изображений. */
export function selectMarkers(db: SQLiteDatabase): Promise<Marker[]> {
  return execute('selectMarkers', undefined, 'QUERY', async () => {
    const rows = await db.getAllAsync<MarkerRow>(`${MARKER_SELECT} ORDER BY m.id`);
    return rows.map(mapMarker);
  });
}

/** Один маркер по id (null, если не найден). */
export function selectMarkerById(db: SQLiteDatabase, id: number): Promise<Marker | null> {
  return execute('selectMarkerById', { id }, 'QUERY', async () => {
    assertId(id, 'метки');
    const row = await db.getFirstAsync<MarkerRow>(`${MARKER_SELECT} WHERE m.id = ?`, id);
    return row ? mapMarker(row) : null;
  });
}

/**
 * Удаляет маркер вместе со всеми изображениями в одной транзакции.
 * Изображения удаляются явно (не полагаемся только на ON DELETE CASCADE),
 * поэтому ограничение внешнего ключа не может быть нарушено.
 * Возвращает URI файлов удалённых изображений, чтобы вызывающий код удалил файлы.
 */
export function deleteMarkerWithImages(db: SQLiteDatabase, id: number): Promise<string[]> {
  return execute('deleteMarkerWithImages', { id }, 'TRANSACTION', async () => {
    assertId(id, 'метки');
    let uris: string[] = [];

    await db.withExclusiveTransactionAsync(async (txn) => {
      const images = await txn.getAllAsync<{ uri: string }>(
        'SELECT uri FROM marker_images WHERE marker_id = ?',
        id,
      );
      uris = images.map((img) => img.uri);

      await txn.runAsync('DELETE FROM marker_images WHERE marker_id = ?', id);
      const result = await txn.runAsync('DELETE FROM markers WHERE id = ?', id);

      if (result.changes === 0) {
        // Бросаем внутри транзакции — она откатится.
        throw new DatabaseError('NOT_FOUND', 'Метка не найдена или уже удалена.');
      }
    });

    return uris;
  });
}

// ---------- Изображения ----------

/** Добавляет изображение к маркеру. Возвращает id изображения. */
export function insertImage(db: SQLiteDatabase, markerId: number, uri: string): Promise<number> {
  return execute('insertImage', { markerId, uri }, 'QUERY', async () => {
    assertId(markerId, 'метки');
    if (!uri) throw new DatabaseError('VALIDATION', 'Пустой URI изображения.');
    // Если маркера нет, SQLite вернёт FOREIGN KEY constraint failed → CONSTRAINT.
    const result = await db.runAsync(
      'INSERT INTO marker_images (marker_id, uri) VALUES (?, ?)',
      markerId,
      uri,
    );
    return result.lastInsertRowId;
  });
}

/** Удаляет изображение. Возвращает URI его файла. */
export function deleteImageById(db: SQLiteDatabase, id: number): Promise<string> {
  return execute('deleteImageById', { id }, 'TRANSACTION', async () => {
    assertId(id, 'изображения');
    let uri = '';

    await db.withExclusiveTransactionAsync(async (txn) => {
      const row = await txn.getFirstAsync<{ uri: string }>(
        'SELECT uri FROM marker_images WHERE id = ?',
        id,
      );
      if (!row) {
        throw new DatabaseError('NOT_FOUND', 'Изображение не найдено или уже удалено.');
      }
      uri = row.uri;
      await txn.runAsync('DELETE FROM marker_images WHERE id = ?', id);
    });

    return uri;
  });
}

/** Все изображения маркера в порядке добавления. */
export function selectMarkerImages(db: SQLiteDatabase, markerId: number): Promise<MarkerImage[]> {
  return execute('selectMarkerImages', { markerId }, 'QUERY', async () => {
    assertId(markerId, 'метки');
    const rows = await db.getAllAsync<MarkerImageRow>(
      'SELECT id, marker_id, uri, created_at FROM marker_images WHERE marker_id = ? ORDER BY id',
      markerId,
    );
    return rows.map(mapImage);
  });
}
