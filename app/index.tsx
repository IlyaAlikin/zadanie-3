import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ErrorView from '../components/ErrorView';
import LocationStatus from '../components/LocationStatus';
import AppMap from '../components/Map';
import NearbyPanel from '../components/NearbyPanel';
import { errorMessage, useDatabase } from '../contexts/DatabaseContext';
import { useLocation } from '../contexts/LocationContext';
import type { Coordinates, Marker } from '../types';

/**
 * Экран карты: метки из SQLite, текущее местоположение, зоны приближения,
 * режим симуляции GPS.
 */
export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getMarkers, addMarker, dataVersion } = useDatabase();
  const {
    status,
    errorKind,
    errorMsg,
    retry,
    notificationPermission,
    requestNotifications,
    nearby,
    simulation,
    setSimulationEnabled,
    setSimulatedLocation,
    effectiveLocation,
  } = useLocation();

  const [markers, setMarkers] = useState<Marker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);

  // Перечитываем маркеры при старте и после каждого изменения данных (dataVersion).
  useEffect(() => {
    let active = true;
    getMarkers()
      .then((list) => {
        if (!active) return;
        setMarkers(list);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [getMarkers, dataVersion, reloadKey]);

  const nearbyIds = useMemo(() => new Set(nearby.map((n) => n.markerId)), [nearby]);

  const handleLongPress = useCallback(
    async (coordinate: Coordinates) => {
      if (adding) return;
      setAdding(true);
      try {
        await addMarker(coordinate.latitude, coordinate.longitude);
      } catch (error) {
        Alert.alert('Не удалось добавить метку', errorMessage(error));
      } finally {
        setAdding(false);
      }
    },
    [addMarker, adding],
  );

  const openMarker = useCallback(
    (markerId: number) => {
      try {
        router.push({ pathname: '/marker/[id]', params: { id: String(markerId) } });
      } catch (error) {
        console.error('Ошибка навигации к маркеру', error);
        Alert.alert('Ошибка навигации', 'Не удалось открыть экран метки. Попробуйте ещё раз.');
      }
    },
    [router],
  );

  const handleMarkerPress = useCallback((marker: Marker) => openMarker(marker.id), [openMarker]);

  const toggleSimulation = useCallback(() => {
    const next = !simulation.enabled;
    setSimulationEnabled(next);
    // Стартуем симуляцию с реальной позиции, если она известна.
    if (next && !simulation.location && effectiveLocation) {
      setSimulatedLocation(effectiveLocation);
    }
  }, [simulation, setSimulationEnabled, setSimulatedLocation, effectiveLocation]);

  let hint: string;
  if (adding) hint = 'Сохраняем метку…';
  else if (loading) hint = 'Загружаем метки…';
  else if (simulation.enabled) hint = 'Симуляция GPS: нажмите на карту, чтобы переместиться';
  else if (markers.length === 0) hint = 'Удерживайте палец на карте, чтобы добавить метку';
  else hint = `Меток: ${markers.length} · удерживайте, чтобы добавить ещё`;

  return (
    <View style={styles.container}>
      <AppMap
        markers={markers}
        onLongPress={handleLongPress}
        onMarkerPress={handleMarkerPress}
        nearbyIds={nearbyIds}
        showsUserLocation={status === 'watching'}
        userLocation={effectiveLocation}
        simulatedLocation={simulation.enabled ? simulation.location : null}
        onMapPress={simulation.enabled ? setSimulatedLocation : undefined}
        bottomInset={insets.bottom}
      />

      <View style={[styles.top, { top: insets.top + 12 }]} pointerEvents="box-none">
        <View
          style={[styles.hint, simulation.enabled && styles.hintSimulation]}
          pointerEvents="none"
        >
          {(loading || adding) && <ActivityIndicator size="small" color="#fff" />}
          <Text style={styles.hintText}>{hint}</Text>
        </View>

        {loadError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>Не удалось загрузить метки: {loadError}</Text>
            <Pressable
              onPress={() => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.errorAction}>Повторить</Text>
            </Pressable>
          </View>
        )}

        <LocationStatus
          status={status}
          errorKind={errorKind}
          errorMsg={errorMsg}
          onRetry={retry}
          notificationPermission={notificationPermission}
          onRequestNotifications={() => void requestNotifications()}
          simulationEnabled={simulation.enabled}
        />
      </View>

      <View style={[styles.bottom, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
        <NearbyPanel nearby={nearby} onPress={openMarker} />
        <Pressable
          onPress={toggleSimulation}
          style={({ pressed }) => [
            styles.simButton,
            simulation.enabled && styles.simButtonActive,
            pressed && styles.pressed,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: simulation.enabled }}
        >
          <Text style={[styles.simButtonText, simulation.enabled && styles.simButtonTextActive]}>
            {simulation.enabled ? 'Симуляция GPS: вкл' : 'Симуляция GPS'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Перехват непредвиденных ошибок рендера экрана карты. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ErrorView
      title="Что-то пошло не так на экране карты"
      message={error.message}
      actions={[{ label: 'Повторить', onPress: () => void retry() }]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.78)',
  },
  hintSimulation: {
    backgroundColor: 'rgba(126,34,206,0.9)',
  },
  hintText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    flexShrink: 1,
  },
  errorBanner: {
    alignSelf: 'stretch',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 6,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 14,
  },
  errorAction: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  bottom: {
    position: 'absolute',
    left: 16,
    // Справа оставляем место под кнопку «ко мне».
    right: 76,
    gap: 10,
  },
  simButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8b4fe',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  simButtonActive: {
    backgroundColor: '#9333ea',
    borderColor: '#9333ea',
  },
  simButtonText: {
    color: '#7e22ce',
    fontSize: 14,
    fontWeight: '600',
  },
  simButtonTextActive: {
    color: '#fff',
  },
  pressed: {
    opacity: 0.7,
  },
});
