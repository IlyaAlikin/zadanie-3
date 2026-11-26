import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { LocationConfig, LocationErrorKind } from '../types';

/**
 * Сервис геолокации: разрешения, службы геолокации, подписка на обновления
 * и вычисление расстояний. Ничего не знает о React и UI.
 */

/** Настройки по умолчанию: баланс точности и расхода батареи. */
export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 5000,
  distanceInterval: 5,
};

const ERROR_MESSAGES: Record<LocationErrorKind, string> = {
  PERMISSION_DENIED: 'Доступ к местоположению не разрешён.',
  PERMISSION_BLOCKED:
    'Доступ к местоположению запрещён. Разрешите его в настройках устройства.',
  SERVICES_DISABLED: 'Службы геолокации выключены. Включите GPS в настройках устройства.',
  UNAVAILABLE: 'Не удалось определить местоположение.',
};

export class LocationServiceError extends Error {
  readonly kind: LocationErrorKind;

  constructor(kind: LocationErrorKind, message?: string) {
    super(message ?? ERROR_MESSAGES[kind]);
    this.name = 'LocationServiceError';
    this.kind = kind;
  }
}

/** Приводит любую ошибку к LocationServiceError. */
export function toLocationError(error: unknown): LocationServiceError {
  if (error instanceof LocationServiceError) return error;
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (lower.includes('services') && lower.includes('disabled')) {
    return new LocationServiceError('SERVICES_DISABLED');
  }
  if (lower.includes('permission') || lower.includes('not authorized')) {
    return new LocationServiceError('PERMISSION_DENIED');
  }
  return new LocationServiceError('UNAVAILABLE', `${ERROR_MESSAGES.UNAVAILABLE} (${raw})`);
}

/**
 * Запрашивает разрешение на доступ к местоположению (только «при использовании»).
 * Бросает LocationServiceError, если доступ не получен.
 */
export const requestLocationPermissions = async (): Promise<void> => {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return;

  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationServiceError(canAskAgain ? 'PERMISSION_DENIED' : 'PERMISSION_BLOCKED');
  }
};

/**
 * Проверяет, что службы геолокации включены.
 * На Android пробует показать системный диалог включения точного местоположения.
 */
export const ensureLocationServicesEnabled = async (): Promise<void> => {
  if (await Location.hasServicesEnabledAsync()) return;

  if (Platform.OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
      if (await Location.hasServicesEnabledAsync()) return;
    } catch {
      // Пользователь отказался включать — ниже бросим понятную ошибку.
    }
  }
  throw new LocationServiceError('SERVICES_DISABLED');
};

/**
 * Подписывается на обновления местоположения (пока приложение активно).
 * Возвращает подписку — её нужно вызвать `remove()` при размонтировании.
 */
export const startLocationUpdates = async (
  onLocation: (location: Location.LocationObject) => void,
  onError?: (error: LocationServiceError) => void,
  config: LocationConfig = DEFAULT_LOCATION_CONFIG,
): Promise<Location.LocationSubscription> => {
  try {
    return await Location.watchPositionAsync(
      {
        accuracy: config.accuracy,
        timeInterval: config.timeInterval,
        distanceInterval: config.distanceInterval,
      },
      onLocation,
      (reason) => onError?.(toLocationError(reason)),
    );
  } catch (error) {
    throw toLocationError(error);
  }
};

/** Последнее известное местоположение (быстро, без ожидания GPS). null, если неизвестно. */
export const getLastKnownLocation = async (): Promise<Location.LocationObject | null> => {
  try {
    return await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
  } catch {
    return null;
  }
};

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Расстояние между двумя точками по формуле гаверсинусов, в метрах.
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
};

/** «45 м» / «1,2 км». */
export const formatDistance = (meters: number): string =>
  meters < 1000
    ? `${Math.round(meters)} м`
    : `${(meters / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`;
