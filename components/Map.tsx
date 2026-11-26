import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker as MapMarker,
  type LongPressEvent,
  type MapPressEvent,
  type Region,
} from 'react-native-maps';

import type { Coordinates, MapLoadState, Marker as MarkerData } from '../types';
import MarkerList from './MarkerList';

/** Сколько ждём onMapReady, прежде чем считать, что карта не загрузилась. */
const MAP_LOAD_TIMEOUT_MS = 15000;

/** Стартовая область — Пермь. */
export const INITIAL_REGION: Region = {
  latitude: 58.0105,
  longitude: 56.2502,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

type MapProps = {
  markers: MarkerData[];
  onLongPress: (coordinate: Coordinates) => void;
  onMarkerPress: (marker: MarkerData) => void;
  /** Метки, в зоне которых находится пользователь (подсвечиваются). */
  nearbyIds: ReadonlySet<number>;
  /** Показывать системную точку «я» (нужно разрешение на геолокацию). */
  showsUserLocation: boolean;
  /** Текущая позиция пользователя (реальная или симулированная) — для кнопки «ко мне». */
  userLocation: Coordinates | null;
  /** Позиция в режиме симуляции (рисуется отдельным значком). */
  simulatedLocation: Coordinates | null;
  /** Обычное нажатие на карту (используется в режиме симуляции). */
  onMapPress?: (coordinate: Coordinates) => void;
  /** Отступ снизу для кнопок поверх карты. */
  bottomInset?: number;
};

/**
 * Полноэкранная карта с маркерами, зонами и местоположением пользователя.
 */
export default function AppMap({
  markers,
  onLongPress,
  onMarkerPress,
  nearbyIds,
  showsUserLocation,
  userLocation,
  simulatedLocation,
  onMapPress,
  bottomInset = 0,
}: MapProps) {
  const mapRef = useRef<MapView>(null);
  const [loadState, setLoadState] = useState<MapLoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centeredOnceRef = useRef(false);

  useEffect(() => {
    if (loadState !== 'loading') return;
    timeoutRef.current = setTimeout(() => setLoadState('error'), MAP_LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [loadState, attempt]);

  const centerOn = useCallback((coordinate: Coordinates) => {
    mapRef.current?.animateToRegion(
      { ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500,
    );
  }, []);

  // Один раз центрируем карту на пользователе, когда впервые узнали его позицию.
  useEffect(() => {
    if (loadState === 'ready' && userLocation && !centeredOnceRef.current) {
      centeredOnceRef.current = true;
      centerOn(userLocation);
    }
  }, [loadState, userLocation, centerOn]);

  const handleMapReady = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoadState('ready');
  }, []);

  const handleRetry = useCallback(() => {
    setLoadState('loading');
    setAttempt((n) => n + 1);
  }, []);

  const handleLongPress = useCallback(
    (event: LongPressEvent) => {
      const { coordinate } = event.nativeEvent;
      onLongPress({ latitude: coordinate.latitude, longitude: coordinate.longitude });
    },
    [onLongPress],
  );

  const handlePress = useCallback(
    (event: MapPressEvent) => {
      // На Android нажатие на маркер тоже приходит в onPress карты — его пропускаем.
      if (!onMapPress || event.nativeEvent.action === 'marker-press') return;
      const { coordinate } = event.nativeEvent;
      onMapPress({ latitude: coordinate.latitude, longitude: coordinate.longitude });
    },
    [onMapPress],
  );

  return (
    <View style={styles.container}>
      <MapView
        key={attempt}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={INITIAL_REGION}
        onMapReady={handleMapReady}
        onLongPress={handleLongPress}
        onPress={handlePress}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        showsCompass
        showsScale
        toolbarEnabled={false}
      >
        <MarkerList markers={markers} nearbyIds={nearbyIds} onMarkerPress={onMarkerPress} />

        {simulatedLocation && (
          <MapMarker
            coordinate={simulatedLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            zIndex={1000}
          >
            <View style={styles.simDotOuter} collapsable={false}>
              <View style={styles.simDotInner} />
            </View>
          </MapMarker>
        )}
      </MapView>

      {loadState === 'ready' && userLocation && (
        <Pressable
          style={({ pressed }) => [
            styles.locateButton,
            { bottom: 24 + bottomInset },
            pressed && styles.pressed,
          ]}
          onPress={() => centerOn(userLocation)}
          accessibilityRole="button"
          accessibilityLabel="Показать моё местоположение"
        >
          <Text style={styles.locateIcon}>◎</Text>
        </Pressable>
      )}

      {loadState === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.overlayText}>Загрузка карты…</Text>
        </View>
      )}

      {loadState === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>Не удалось загрузить карту</Text>
          <Text style={styles.errorText}>
            Проверьте подключение к интернету и попробуйте ещё раз.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={handleRetry}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayText: {
    marginTop: 12,
    fontSize: 16,
    color: '#334155',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 8,
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  locateButton: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  locateIcon: {
    fontSize: 24,
    color: '#2563eb',
  },
  simDotOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(147,51,234,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simDotInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#9333ea',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pressed: {
    opacity: 0.7,
  },
});
