/**
 * Типизированные ошибки слоя базы данных.
 */

export type DatabaseErrorKind =
  /** Не удалось открыть/инициализировать БД. */
  | 'INIT'
  /** Ошибка применения миграции. */
  | 'MIGRATION'
  /** Ошибка внутри транзакции (транзакция откатилась). */
  | 'TRANSACTION'
  /** Нарушение ограничения (FOREIGN KEY, NOT NULL, CHECK...). */
  | 'CONSTRAINT'
  /** Нет соединения с БД / соединение закрыто. */
  | 'CONNECTION'
  /** БД занята другой операцией (database is locked). */
  | 'BUSY'
  /** Запись не найдена. */
  | 'NOT_FOUND'
  /** Некорректные входные данные. */
  | 'VALIDATION'
  /** Ошибка работы с файлом изображения. */
  | 'FILE'
  /** Прочие ошибки запросов. */
  | 'QUERY';

const USER_MESSAGES: Record<DatabaseErrorKind, string> = {
  INIT: 'Не удалось открыть базу данных.',
  MIGRATION: 'Не удалось обновить структуру базы данных.',
  TRANSACTION: 'Операция не выполнена, изменения отменены.',
  CONSTRAINT: 'Операция нарушает целостность данных.',
  CONNECTION: 'Нет соединения с базой данных.',
  BUSY: 'База данных занята, попробуйте ещё раз.',
  NOT_FOUND: 'Запись не найдена.',
  VALIDATION: 'Некорректные данные.',
  FILE: 'Не удалось сохранить файл изображения.',
  QUERY: 'Ошибка при работе с базой данных.',
};

export class DatabaseError extends Error {
  readonly kind: DatabaseErrorKind;
  readonly operation?: string;
  readonly cause?: unknown;

  constructor(kind: DatabaseErrorKind, message?: string, options?: { operation?: string; cause?: unknown }) {
    super(message ?? USER_MESSAGES[kind]);
    this.name = 'DatabaseError';
    this.kind = kind;
    this.operation = options?.operation;
    this.cause = options?.cause;
  }

  /** Понятное пользователю сообщение. */
  get userMessage(): string {
    return this.message || USER_MESSAGES[this.kind];
  }
}

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Определяет тип ошибки SQLite по тексту исходного сообщения. */
export function classifySqliteError(error: unknown): DatabaseErrorKind | null {
  const msg = rawMessage(error).toLowerCase();
  if (msg.includes('constraint')) return 'CONSTRAINT';
  if (msg.includes('database is locked') || msg.includes('sqlite_busy')) return 'BUSY';
  if (
    msg.includes('database is closed') ||
    msg.includes('has been rejected') ||
    msg.includes('access to closed resource') ||
    msg.includes('unable to open') ||
    msg.includes('not open')
  ) {
    return 'CONNECTION';
  }
  return null;
}

/**
 * Приводит любую ошибку к DatabaseError.
 * Тип, определённый по тексту SQLite (constraint, locked, closed), имеет приоритет над fallback.
 */
export function toDatabaseError(
  error: unknown,
  fallback: DatabaseErrorKind,
  operation?: string,
): DatabaseError {
  if (error instanceof DatabaseError) return error;

  const kind = classifySqliteError(error) ?? fallback;
  const raw = rawMessage(error);

  let message = USER_MESSAGES[kind];
  if (kind === 'CONSTRAINT' && raw.toLowerCase().includes('foreign key')) {
    message = 'Связанная метка не существует (нарушение внешнего ключа).';
  }

  return new DatabaseError(kind, message, { operation, cause: error });
}
