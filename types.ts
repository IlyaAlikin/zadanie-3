/**
 * Общие типы приложения.
 */

import type * as Location from 'expo-location';

// ---------- Доменные модели (то, с чем работает UI) ----------

/** Маркер на карте. */
export interface Marker {
  /** Первичный ключ из таблицы `markers`. */
  id: number;
  latitude: number;
  longitude: number;
  /** Дата создания (ISO-строка, UTC). */
  createdAt: string;
  /** Количество привязанных изображений (вычисляется запросом). */
  imageCount: number;
}

/** Изображение, привязанное к маркеру. */
export interface MarkerImage {
  /** Первичный ключ из таблицы `marker_images`. */
  id: number;
  /** Внешний ключ на `markers.id`. */
  markerId: number;
  /** URI файла изображения в хранилище приложения. */
  uri: string;
  /** Дата добавления (ISO-строка, UTC). */
  createdAt: string;
}

/** Географическая точка. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

// ---------- Строки таблиц SQLite (как они приходят из запросов) ----------

/** Строка запроса маркеров (таблица `markers` + агрегат `image_count`). */
export interface MarkerRow {
  id: number;
  latitude: number;
  longitude: number;
  created_at: string;
  image_count: number;
}

/** Строка таблицы `marker_images`. */
export interface MarkerImageRow {
  id: number;
  marker_id: number;
  uri: string;
  created_at: string;
}

// ---------- Контекст базы данных ----------

/** API, которое предоставляет `DatabaseContext`. */
export interface DatabaseContextType {
  // Операции с базой данных
  addMarker: (latitude: number, longitude: number) => Promise<number>;
  deleteMarker: (id: number) => Promise<void>;
  getMarkers: () => Promise<Marker[]>;
  getMarker: (id: number) => Promise<Marker | null>;
  addImage: (markerId: number, uri: string) => Promise<void>;
  deleteImage: (id: number) => Promise<void>;
  getMarkerImages: (markerId: number) => Promise<MarkerImage[]>;

  // Статусы
  /** true, пока идёт инициализация БД или выполняется любая операция. */
  isLoading: boolean;
  /** Последняя ошибка работы с БД (null, если ошибок нет). */
  error: Error | null;
  /** База открыта и миграции применены. */
  isReady: boolean;
  /** Ошибка инициализации (если БД не удалось открыть). */
  initError: Error | null;
  /** Счётчик изменений данных: растёт после каждой успешной записи. */
  dataVersion: number;

  // Восстановление после ошибок
  clearError: () => void;
  /** Повторная попытка открыть БД. */
  retryInit: () => void;
  /** Удаление файла БД и создание пустой базы (крайняя мера). */
  resetDatabase: () => Promise<void>;
}

// ---------- Навигация ----------

/** Параметры экрана деталей маркера (`app/marker/[id].tsx`). */
export type MarkerDetailsParams = {
  id: string;
};

/** Маршруты приложения и их параметры. */
export type RootStackParamList = {
  '/': undefined;
  '/marker/[id]': MarkerDetailsParams;
};

/** Состояние загрузки карты. */
export type MapLoadState = 'loading' | 'ready' | 'error';

// ---------- Геолокация (задание 3) ----------


/** Настройки отслеживания местоположения. */
export interface LocationConfig {
  accuracy: Location.Accuracy;
  /** Как часто обновлять местоположение (мс). */
  timeInterval: number;
  /** Минимальное расстояние (в метрах) между обновлениями. */
  distanceInterval: number;
}

/** Текущее местоположение пользователя и ошибка геолокации. */
export interface LocationState {
  location: Location.LocationObject | null;
  errorMsg: string | null;
}

/** Причина, по которой геолокация недоступна. */
export type LocationErrorKind =
  /** Пользователь отказал, но можно спросить ещё раз. */
  | 'PERMISSION_DENIED'
  /** Пользователь отказал навсегда — только через настройки. */
  | 'PERMISSION_BLOCKED'
  /** Выключены службы геолокации (GPS) на устройстве. */
  | 'SERVICES_DISABLED'
  /** Прочие ошибки (нет сигнала, сбой провайдера). */
  | 'UNAVAILABLE';

/** Состояние отслеживания. */
export type TrackingStatus = 'starting' | 'watching' | 'error';

/** Состояние разрешения на уведомления. */
export type NotificationPermissionState = 'unknown' | 'granted' | 'denied' | 'blocked';

// ---------- Уведомления (задание 3) ----------

/** Активное (показанное) уведомление о приближении к метке. */
export interface ActiveNotification {
  markerId: number;
  /** id системного уведомления; null — если уведомления запрещены и показан только баннер в приложении. */
  notificationId: string | null;
  timestamp: number;
}

/** Метка, рядом с которой находится пользователь. */
export interface NearbyMarker {
  markerId: number;
  /** Расстояние в метрах. */
  distance: number;
}
