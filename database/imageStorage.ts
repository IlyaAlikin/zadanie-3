import { Directory, File, Paths } from 'expo-file-system';

import { DatabaseError } from './errors';
import { dbLogger } from './logger';

/**
 * Хранение файлов изображений.
 *
 * expo-image-picker возвращает файл во временном кэше, который система может очистить.
 * Раз метки теперь хранятся постоянно, копируем изображение в папку документов приложения
 * и сохраняем в БД URI копии.
 */

const IMAGES_DIR_NAME = 'marker-images';

function imagesDirectory(): Directory {
  const dir = new Directory(Paths.document, IMAGES_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function extensionOf(uri: string): string {
  const match = /\.([a-zA-Z0-9]{2,5})(?:\?.*)?$/.exec(uri);
  return match ? match[1].toLowerCase() : 'jpg';
}

/** Копирует файл в хранилище приложения и возвращает URI копии. */
export async function persistImage(sourceUri: string): Promise<string> {
  try {
    const source = new File(sourceUri);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionOf(sourceUri)}`;
    const destination = new File(imagesDirectory(), name);
    await source.copy(destination);
    dbLogger.info('файл изображения сохранён', destination.uri);
    return destination.uri;
  } catch (error) {
    throw new DatabaseError('FILE', 'Не удалось сохранить файл изображения.', {
      operation: 'persistImage',
      cause: error,
    });
  }
}

/** Удаляет файл изображения. Ошибки не пробрасываются: файл мог быть уже удалён. */
export function removeImageFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
      dbLogger.info('файл изображения удалён', uri);
    }
  } catch (error) {
    dbLogger.error(`не удалось удалить файл ${uri}`, error);
  }
}

/** Удаляет всю папку с изображениями (при сбросе БД). */
export function removeAllImageFiles(): void {
  try {
    const dir = new Directory(Paths.document, IMAGES_DIR_NAME);
    if (dir.exists) dir.delete();
  } catch (error) {
    dbLogger.error('не удалось очистить папку изображений', error);
  }
}
