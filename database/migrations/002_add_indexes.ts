import type { Migration } from './types';

/**
 * Версия 2: индекс по внешнему ключу.
 * Ускоряет выборку изображений маркера и каскадное удаление.
 */
export const migration002: Migration = {
  version: 2,
  name: 'add_indexes',
  async up(db) {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_marker_images_marker_id
        ON marker_images (marker_id);
    `);
  },
};
