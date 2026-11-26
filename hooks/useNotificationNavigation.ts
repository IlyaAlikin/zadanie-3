import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import {
  PROXIMITY_NOTIFICATION_TYPE,
  type ProximityNotificationData,
} from '../services/notifications';

/**
 * Нажатие на уведомление о приближении открывает экран метки.
 * Работает и когда приложение было закрыто (useLastNotificationResponse).
 */
export function useNotificationNavigation() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const data = response.notification.request.content.data as
      | Partial<ProximityNotificationData>
      | undefined;
    if (data?.type !== PROXIMITY_NOTIFICATION_TYPE || typeof data.markerId !== 'number') return;

    try {
      router.push({ pathname: '/marker/[id]', params: { id: String(data.markerId) } });
    } catch (error) {
      console.error('Не удалось открыть метку из уведомления', error);
    } finally {
      // Чтобы при следующем рендере не открыть тот же экран повторно.
      Notifications.clearLastNotificationResponse();
    }
  }, [response, router]);
}
