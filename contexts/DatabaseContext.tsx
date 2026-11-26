import type { SQLiteDatabase } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { DatabaseError, toDatabaseError } from '../database/errors';
import { persistImage, removeAllImageFiles, removeImageFile } from '../database/imageStorage';
import { dbLogger } from '../database/logger';
import {
  deleteImageById,
  deleteMarkerWithImages,
  insertImage,
  insertMarker,
  selectMarkerById,
  selectMarkerImages,
  selectMarkers,
} from '../database/operations';
import { closeDatabase, deleteDatabaseFile, initDatabase } from '../database/schema';
import type { DatabaseContextType } from '../types';

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export const DatabaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [initError, setInitError] = useState<Error | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pendingOps, setPendingOps] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const [initAttempt, setInitAttempt] = useState(0);

  // Актуальное соединение для асинхронного кода и очистки при размонтировании.
  const dbRef = useRef<SQLiteDatabase | null>(null);
  const mountedRef = useRef(true);

  // ---------- Инициализация и очистка соединения ----------

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    setIsInitializing(true);
    setInitError(null);

    initDatabase()
      .then(async (database) => {
        if (cancelled) {
          // Компонент размонтирован, пока БД открывалась, — закрываем сразу.
          await closeDatabase(database);
          return;
        }
        dbRef.current = database;
        setDb(database);
      })
      .catch((err: unknown) => {
        if (!cancelled) setInitError(toDatabaseError(err, 'INIT', 'initDatabase'));
      })
      .finally(() => {
        if (!cancelled) setIsInitializing(false);
      });

    return () => {
      // Очистка соединения с базой данных.
      cancelled = true;
      mountedRef.current = false;
      const current = dbRef.current;
      dbRef.current = null;
      if (current) void closeDatabase(current);
    };
  }, [initAttempt]);

  /** Переоткрывает соединение (стратегия восстановления при обрыве). */
  const reconnect = useCallback(async (): Promise<SQLiteDatabase> => {
    dbLogger.info('переподключение к БД…');
    const old = dbRef.current;
    dbRef.current = null;
    if (old) await closeDatabase(old);
    const fresh = await initDatabase();
    if (!mountedRef.current) {
      await closeDatabase(fresh);
      throw new DatabaseError('CONNECTION');
    }
    dbRef.current = fresh;
    setDb(fresh);
    return fresh;
  }, []);

  /**
   * Выполняет операцию над БД: ведёт счётчик загрузки, сохраняет ошибку
   * и один раз переподключается, если соединение оказалось закрыто.
   */
  const run = useCallback(
    async <T,>(operation: string, fn: (database: SQLiteDatabase) => Promise<T>): Promise<T> => {
      const database = dbRef.current;
      if (!database) {
        const err = new DatabaseError('CONNECTION', 'База данных ещё не открыта.', { operation });
        setError(err);
        throw err;
      }

      setPendingOps((n) => n + 1);
      try {
        try {
          return await fn(database);
        } catch (err) {
          const dbError = toDatabaseError(err, 'QUERY', operation);
          if (dbError.kind !== 'CONNECTION') throw dbError;
          // Соединение потеряно — пробуем переоткрыть и повторить операцию один раз.
          const fresh = await reconnect();
          return await fn(fresh);
        }
      } catch (err) {
        const dbError = toDatabaseError(err, 'QUERY', operation);
        if (mountedRef.current) setError(dbError);
        throw dbError;
      } finally {
        if (mountedRef.current) setPendingOps((n) => n - 1);
      }
    },
    [reconnect],
  );

  const bumpVersion = useCallback(() => setDataVersion((v) => v + 1), []);

  // ---------- Маркеры ----------

  const addMarker = useCallback(
    async (latitude: number, longitude: number) => {
      const id = await run('addMarker', (d) => insertMarker(d, latitude, longitude));
      bumpVersion();
      return id;
    },
    [run, bumpVersion],
  );

  const deleteMarker = useCallback(
    async (id: number) => {
      const uris = await run('deleteMarker', (d) => deleteMarkerWithImages(d, id));
      // Файлы удаляем только после успешного коммита транзакции.
      uris.forEach(removeImageFile);
      bumpVersion();
    },
    [run, bumpVersion],
  );

  const getMarkers = useCallback(() => run('getMarkers', selectMarkers), [run]);

  const getMarker = useCallback(
    (id: number) => run('getMarker', (d) => selectMarkerById(d, id)),
    [run],
  );

  // ---------- Изображения ----------

  const addImage = useCallback(
    async (markerId: number, uri: string) => {
      let storedUri: string;
      try {
        storedUri = await persistImage(uri);
      } catch (err) {
        const dbError = toDatabaseError(err, 'FILE', 'addImage');
        setError(dbError);
        throw dbError;
      }

      try {
        await run('addImage', (d) => insertImage(d, markerId, storedUri));
      } catch (err) {
        // Запись в БД не удалась — удаляем скопированный файл, чтобы не копить мусор.
        removeImageFile(storedUri);
        throw err;
      }
      bumpVersion();
    },
    [run, bumpVersion],
  );

  const deleteImage = useCallback(
    async (id: number) => {
      const uri = await run('deleteImage', (d) => deleteImageById(d, id));
      removeImageFile(uri);
      bumpVersion();
    },
    [run, bumpVersion],
  );

  const getMarkerImages = useCallback(
    (markerId: number) => run('getMarkerImages', (d) => selectMarkerImages(d, markerId)),
    [run],
  );

  // ---------- Восстановление ----------

  const clearError = useCallback(() => setError(null), []);

  const retryInit = useCallback(() => {
    setError(null);
    setInitAttempt((n) => n + 1);
  }, []);

  const resetDatabase = useCallback(async () => {
    const current = dbRef.current;
    dbRef.current = null;
    setDb(null);
    if (current) await closeDatabase(current);
    try {
      await deleteDatabaseFile();
    } catch (err) {
      dbLogger.error('не удалось удалить файл БД', err);
    }
    removeAllImageFiles();
    setError(null);
    setDataVersion((v) => v + 1);
    setInitAttempt((n) => n + 1);
  }, []);

  const value = useMemo<DatabaseContextType>(
    () => ({
      addMarker,
      deleteMarker,
      getMarkers,
      getMarker,
      addImage,
      deleteImage,
      getMarkerImages,
      isLoading: isInitializing || pendingOps > 0,
      error,
      isReady: db !== null && !isInitializing,
      initError,
      dataVersion,
      clearError,
      retryInit,
      resetDatabase,
    }),
    [
      addMarker,
      deleteMarker,
      getMarkers,
      getMarker,
      addImage,
      deleteImage,
      getMarkerImages,
      isInitializing,
      pendingOps,
      error,
      db,
      initError,
      dataVersion,
      clearError,
      retryInit,
      resetDatabase,
    ],
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
};

export function useDatabase(): DatabaseContextType {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useDatabase должен вызываться внутри <DatabaseProvider>');
  }
  return ctx;
}

/** Достаёт понятное пользователю сообщение из любой ошибки. */
export function errorMessage(error: unknown): string {
  if (error instanceof DatabaseError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return 'Произошла неизвестная ошибка.';
}
