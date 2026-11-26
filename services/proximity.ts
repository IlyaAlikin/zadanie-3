import type { Coordinates, Marker, NearbyMarker } from '../types';
import { calculateDistance } from './location';
import type { NotificationManager } from './notifications';

/** Радиус зоны метки: ближе — показываем уведомление (м). */
export const PROXIMITY_THRESHOLD = 100;

/**
 * Радиус выхода из зоны (м). Больше радиуса входа (гистерезис), чтобы на границе
 * зоны из-за погрешности GPS уведомление не появлялось и не исчезало постоянно.
 */
export const EXIT_THRESHOLD = 130;

/** Слишком неточные координаты (погрешность больше, м) для проверки зон не используем. */
export const MAX_ACCEPTABLE_ACCURACY = 200;

/**
 * Проверяет расстояние до всех меток и показывает/убирает уведомления.
 * Возвращает метки внутри зоны (отсортированы по расстоянию).
 */
export const checkProximity = (
  userLocation: Coordinates,
  markers: Marker[],
  manager: NotificationManager,
): NearbyMarker[] => {
  const nearby: NearbyMarker[] = [];

  markers.forEach((marker) => {
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      marker.latitude,
      marker.longitude,
    );

    if (distance <= PROXIMITY_THRESHOLD) {
      void manager.showNotification(marker, distance);
      nearby.push({ markerId: marker.id, distance });
    } else if (distance > EXIT_THRESHOLD) {
      void manager.removeNotification(marker.id);
    } else if (manager.isActive(marker.id)) {
      // Между радиусами входа и выхода сохраняем текущее состояние.
      nearby.push({ markerId: marker.id, distance });
    }
  });

  return nearby.sort((a, b) => a.distance - b.distance);
};
