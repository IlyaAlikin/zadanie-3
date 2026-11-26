import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LocationErrorKind, NotificationPermissionState, TrackingStatus } from '../types';

type LocationStatusProps = {
  status: TrackingStatus;
  errorKind: LocationErrorKind | null;
  errorMsg: string | null;
  onRetry: () => void;
  notificationPermission: NotificationPermissionState;
  onRequestNotifications: () => void;
  /** Включена симуляция GPS — ошибка реального GPS не мешает работе. */
  simulationEnabled: boolean;
};

/**
 * Баннеры о состоянии геолокации и уведомлений с действиями для исправления.
 */
export default function LocationStatus({
  status,
  errorKind,
  errorMsg,
  onRetry,
  notificationPermission,
  onRequestNotifications,
  simulationEnabled,
}: LocationStatusProps) {
  const [notificationsHidden, setNotificationsHidden] = useState(false);

  const openSettings = () => void Linking.openSettings();

  const locationAction =
    errorKind === 'PERMISSION_BLOCKED' || errorKind === 'SERVICES_DISABLED'
      ? { label: 'Открыть настройки', onPress: openSettings }
      : { label: 'Разрешить', onPress: onRetry };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {status === 'starting' && !simulationEnabled && (
        <View style={[styles.banner, styles.info]}>
          <ActivityIndicator size="small" color="#1d4ed8" />
          <Text style={[styles.text, styles.infoText]}>Определяем местоположение…</Text>
        </View>
      )}

      {status === 'error' && errorMsg && (
        <View style={[styles.banner, styles.error]}>
          <View style={styles.body}>
            <Text style={[styles.title, styles.errorText]}>Геолокация недоступна</Text>
            <Text style={[styles.text, styles.errorText]}>
              {errorMsg}
              {simulationEnabled ? ' Сейчас работает симуляция GPS.' : ' Уведомления о метках не работают.'}
            </Text>
            <View style={styles.actions}>
              <Action label={locationAction.label} onPress={locationAction.onPress} />
              {locationAction.label !== 'Разрешить' && <Action label="Повторить" onPress={onRetry} />}
            </View>
          </View>
        </View>
      )}

      {(notificationPermission === 'denied' || notificationPermission === 'blocked') &&
        !notificationsHidden && (
          <View style={[styles.banner, styles.warning]}>
            <View style={styles.body}>
              <Text style={[styles.title, styles.warningText]}>Уведомления выключены</Text>
              <Text style={[styles.text, styles.warningText]}>
                О приближении к меткам сообщим только внутри приложения (панель «Рядом»).
              </Text>
              <View style={styles.actions}>
                {notificationPermission === 'denied' ? (
                  <Action label="Разрешить" onPress={onRequestNotifications} />
                ) : (
                  <Action label="Открыть настройки" onPress={openSettings} />
                )}
                <Action label="Скрыть" onPress={() => setNotificationsHidden(true)} />
              </View>
            </View>
          </View>
        )}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      {({ pressed }) => <Text style={[styles.action, pressed && styles.pressed]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  info: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  infoText: {
    color: '#1e3a8a',
  },
  error: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#991b1b',
  },
  warning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  warningText: {
    color: '#92400e',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  text: {
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  action: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
