import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ActiveNotification, Marker, NotificationPermissionState } from '../types';
import { formatDistance } from './location';

/**
 * Сервис локальных уведомлений о приближении к меткам.
 */

export const PROXIMITY_CHANNEL_ID = 'proximity';
/** Метка в data уведомления — по ней отличаем «наши» уведомления от прочих. */
export const PROXIMITY_NOTIFICATION_TYPE = 'marker-proximity';

export type ProximityNotificationData = {
  type: typeof PROXIMITY_NOTIFICATION_TYPE;
  markerId: number;
};

const log = (message: string, details?: unknown) => {
  if (!__DEV__) return;
  if (details === undefined) console.log(`[Notifications] ${message}`);
  else console.log(`[Notifications] ${message}`, details);
};

/**
 * Глобальная настройка: показывать уведомления, даже когда приложение открыто,
 * и создать канал на Android. Вызывается один раз при старте.
 */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PROXIMITY_CHANNEL_ID, {
      name: 'Приближение к меткам',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

function toPermissionState(status: Notifications.NotificationPermissionsStatus): NotificationPermissionState {
  if (status.granted) return 'granted';
  if (status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return status.canAskAgain ? 'denied' : 'blocked';
}

/** Текущее состояние разрешения (без запроса). */
export async function getNotificationPermission(): Promise<NotificationPermissionState> {
  try {
    return toPermissionState(await Notifications.getPermissionsAsync());
  } catch (error) {
    log('не удалось получить статус разрешения', error);
    return 'unknown';
  }
}

/** Запрашивает разрешение на уведомления. Отказ не бросает ошибку — возвращается статус. */
export async function requestNotificationPermissions(): Promise<NotificationPermissionState> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return toPermissionState(requested);
  } catch (error) {
    log('ошибка запроса разрешения', error);
    return 'unknown';
  }
}

type Listener = (activeMarkerIds: number[]) => void;

/**
 * Управляет уведомлениями о приближении к меткам.
 *
 * - Активные уведомления хранятся в памяти (Map markerId → ActiveNotification),
 *   поэтому для одной метки уведомление показывается только один раз, пока пользователь в зоне.
 * - Все операции выполняются строго последовательно (очередь промисов), чтобы частые
 *   обновления GPS не создавали гонок: «показать» и «убрать» для одной метки не пересекутся.
 * - Если уведомления запрещены, метка всё равно отмечается активной (notificationId = null),
 *   а пользователь видит её в баннере «Рядом» внутри приложения.
 */
export class NotificationManager {
  private activeNotifications: Map<number, ActiveNotification>;
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<Listener>();
  private notificationsAllowed = false;

  constructor() {
    this.activeNotifications = new Map();
  }

  /** Разрешены ли системные уведомления (обновляется из контекста). */
  setNotificationsAllowed(allowed: boolean) {
    this.notificationsAllowed = allowed;
  }

  /** Подписка на изменение списка активных меток (для UI). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getActiveMarkerIds());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getActiveMarkerIds(): number[] {
    return [...this.activeNotifications.keys()];
  }

  isActive(markerId: number): boolean {
    return this.activeNotifications.has(markerId);
  }

  private emit() {
    const ids = this.getActiveMarkerIds();
    this.listeners.forEach((listener) => listener(ids));
  }

  /** Ставит операцию в очередь; ошибка одной операции не ломает очередь. */
  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task).catch((error: unknown) => {
      log('ошибка операции с уведомлением', error);
    });
    this.queue = next;
    return next;
  }

  async showNotification(marker: Marker, distance?: number): Promise<void> {
    return this.enqueue(async () => {
      if (this.activeNotifications.has(marker.id)) {
        return; // Предотвращаем дубликаты
      }

      let notificationId: string | null = null;
      if (this.notificationsAllowed) {
        const data: ProximityNotificationData = {
          type: PROXIMITY_NOTIFICATION_TYPE,
          markerId: marker.id,
        };
        notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Вы рядом с меткой!',
            body:
              distance !== undefined
                ? `Метка №${marker.id} в ${formatDistance(distance)} от вас. Нажмите, чтобы открыть.`
                : `Вы находитесь рядом с сохранённой точкой №${marker.id}.`,
            data,
            sound: true,
          },
          // Уведомление отправляется сразу; на Android — в наш канал с высоким приоритетом.
          trigger: Platform.OS === 'android' ? { channelId: PROXIMITY_CHANNEL_ID } : null,
        });
      }

      this.activeNotifications.set(marker.id, {
        markerId: marker.id,
        notificationId,
        timestamp: Date.now(),
      });
      log(`показано для метки №${marker.id}`, { notificationId, distance });
      this.emit();
    });
  }

  async removeNotification(markerId: number): Promise<void> {
    return this.enqueue(async () => {
      const notification = this.activeNotifications.get(markerId);
      if (!notification) return;

      this.activeNotifications.delete(markerId);
      this.emit();

      if (notification.notificationId) {
        // Отменяем, если ещё не доставлено, и убираем из шторки, если уже показано.
        await Notifications.cancelScheduledNotificationAsync(notification.notificationId).catch(
          () => undefined,
        );
        await Notifications.dismissNotificationAsync(notification.notificationId).catch(
          () => undefined,
        );
      }
      log(`убрано для метки №${markerId}`);
    });
  }

  /** Убирает уведомления меток, которых больше нет в БД (метку удалили). */
  async syncWithMarkers(existingMarkerIds: Iterable<number>): Promise<void> {
    const existing = new Set(existingMarkerIds);
    const stale = this.getActiveMarkerIds().filter((id) => !existing.has(id));
    await Promise.all(stale.map((id) => this.removeNotification(id)));
  }

  /** Убирает все уведомления (например, при потере доступа к геолокации). */
  async clearAll(): Promise<void> {
    await Promise.all(this.getActiveMarkerIds().map((id) => this.removeNotification(id)));
  }

  /**
   * Удаляет из шторки уведомления о приближении, оставшиеся с прошлого запуска
   * (состояние в памяти после перезапуска пустое — без очистки остались бы «сироты»).
   */
  async dismissStaleNotifications(): Promise<void> {
    return this.enqueue(async () => {
      const presented = await Notifications.getPresentedNotificationsAsync();
      const ours = presented.filter(
        (n) => (n.request.content.data as Partial<ProximityNotificationData> | undefined)?.type ===
          PROXIMITY_NOTIFICATION_TYPE,
      );
      await Promise.all(
        ours.map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => undefined)),
      );
      if (ours.length > 0) log(`очищено старых уведомлений: ${ours.length}`);
    });
  }
}

/** Единственный экземпляр на всё приложение. */
export const notificationManager = new NotificationManager();
