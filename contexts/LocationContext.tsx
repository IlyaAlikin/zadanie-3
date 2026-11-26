import type * as Location from 'expo-location';
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
import { AppState } from 'react-native';

import {
  ensureLocationServicesEnabled,
  getLastKnownLocation,
  LocationServiceError,
  requestLocationPermissions,
  startLocationUpdates,
  toLocationError,
} from '../services/location';
import {
  configureNotifications,
  getNotificationPermission,
  notificationManager,
  requestNotificationPermissions,
} from '../services/notifications';
import { checkProximity, MAX_ACCEPTABLE_ACCURACY } from '../services/proximity';
import type {
  Coordinates,
  LocationErrorKind,
  LocationState,
  Marker,
  NearbyMarker,
  NotificationPermissionState,
  TrackingStatus,
} from '../types';
import { useDatabase } from './DatabaseContext';

type LocationContextValue = LocationState & {
  /** Тип ошибки геолокации (для выбора действия в UI). */
  errorKind: LocationErrorKind | null;
  status: TrackingStatus;
  /** Повторить запуск отслеживания (после отказа/выключенного GPS). */
  retry: () => void;

  notificationPermission: NotificationPermissionState;
  requestNotifications: () => Promise<void>;

  /** Метки в зоне приближения, по возрастанию расстояния. */
  nearby: NearbyMarker[];

  /** Режим симуляции GPS: позиция задаётся нажатием на карту. */
  simulation: { enabled: boolean; location: Coordinates | null };
  setSimulationEnabled: (enabled: boolean) => void;
  setSimulatedLocation: (coordinate: Coordinates) => void;

  /** Координаты, по которым сейчас считаются зоны (симуляция или реальный GPS). */
  effectiveLocation: Coordinates | null;
};

const LocationContext = createContext<LocationContextValue | null>(null);

const log = (message: string, details?: unknown) => {
  if (!__DEV__) return;
  if (details === undefined) console.log(`[Location] ${message}`);
  else console.log(`[Location] ${message}`, details);
};

function toCoordinates(location: Location.LocationObject): Coordinates {
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const { getMarkers, dataVersion } = useDatabase();

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<LocationErrorKind | null>(null);
  const [status, setStatus] = useState<TrackingStatus>('starting');
  const [attempt, setAttempt] = useState(0);

  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>('unknown');
  const [nearby, setNearby] = useState<NearbyMarker[]>([]);

  const [simulationEnabled, setSimulationEnabledState] = useState(false);
  const [simulatedLocation, setSimulatedLocationState] = useState<Coordinates | null>(null);

  // Рефы — для доступа к актуальным значениям из колбэков GPS и AppState.
  const markersRef = useRef<Marker[]>([]);
  const statusRef = useRef<TrackingStatus>('starting');
  const simulationRef = useRef<{ enabled: boolean; location: Coordinates | null }>({
    enabled: false,
    location: null,
  });
  const realLocationRef = useRef<Location.LocationObject | null>(null);

  /** Координаты для проверки зон: симуляция имеет приоритет над GPS. */
  const getEffectiveCoordinates = useCallback((): Coordinates | null => {
    const sim = simulationRef.current;
    if (sim.enabled) return sim.location;
    const real = realLocationRef.current;
    if (!real) return null;
    const accuracy = real.coords.accuracy;
    if (accuracy != null && accuracy > MAX_ACCEPTABLE_ACCURACY) {
      log(`точность ${Math.round(accuracy)} м слишком низкая — пропускаем проверку зон`);
      return null;
    }
    return toCoordinates(real);
  }, []);

  /** Проверка приближения к меткам по текущим координатам. */
  const runProximityCheck = useCallback(() => {
    const coords = getEffectiveCoordinates();
    if (!coords) return;
    setNearby(checkProximity(coords, markersRef.current, notificationManager));
  }, [getEffectiveCoordinates]);

  // ---------- Уведомления: настройка и разрешение ----------

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await configureNotifications();
        await notificationManager.dismissStaleNotifications();
      } catch (error) {
        log('не удалось настроить уведомления', error);
      }
      const permission = await requestNotificationPermissions();
      if (!active) return;
      notificationManager.setNotificationsAllowed(permission === 'granted');
      setNotificationPermission(permission);
    })();
    return () => {
      active = false;
    };
  }, []);

  const requestNotifications = useCallback(async () => {
    const permission = await requestNotificationPermissions();
    notificationManager.setNotificationsAllowed(permission === 'granted');
    setNotificationPermission(permission);
  }, []);

  // Если метка ушла из зоны внутри менеджера (например, удалена) — обновляем список «рядом».
  useEffect(
    () =>
      notificationManager.subscribe((activeIds) => {
        const ids = new Set(activeIds);
        setNearby((prev) => prev.filter((n) => ids.has(n.markerId)));
      }),
    [],
  );

  // ---------- Метки из БД ----------

  useEffect(() => {
    let active = true;
    getMarkers()
      .then(async (markers) => {
        if (!active) return;
        markersRef.current = markers;
        // Удалённые метки — убрать их уведомления; новые — сразу проверить.
        await notificationManager.syncWithMarkers(markers.map((m) => m.id));
        runProximityCheck();
      })
      .catch((error: unknown) => log('не удалось загрузить метки для проверки зон', error));
    return () => {
      active = false;
    };
  }, [getMarkers, dataVersion, runProximityCheck]);

  // ---------- Отслеживание местоположения ----------

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const updateStatus = (next: TrackingStatus) => {
      statusRef.current = next;
      setStatus(next);
    };

    const handleError = (error: LocationServiceError) => {
      if (cancelled) return;
      log(`ошибка: ${error.kind}`, error.message);
      setErrorMsg(error.message);
      setErrorKind(error.kind);
      updateStatus('error');
      // Без доступа к геолокации зоны не определить — убираем уведомления (кроме симуляции).
      if (!simulationRef.current.enabled) void notificationManager.clearAll();
    };

    const setupLocation = async () => {
      updateStatus('starting');
      try {
        await requestLocationPermissions();
        await ensureLocationServicesEnabled();

        // Быстрый старт: последнее известное местоположение, пока ждём GPS.
        const last = await getLastKnownLocation();
        if (last && !cancelled && !realLocationRef.current) {
          realLocationRef.current = last;
          setLocation(last);
        }

        const subscription = await startLocationUpdates(
          (newLocation) => {
            if (cancelled) return;
            realLocationRef.current = newLocation;
            setLocation(newLocation);
            setErrorMsg(null);
            setErrorKind(null);
            if (statusRef.current !== 'watching') updateStatus('watching');
            if (!simulationRef.current.enabled) runProximityCheck();
          },
          handleError,
        );

        if (cancelled) {
          subscription.remove();
          return;
        }
        locationSubscription = subscription;
        setErrorMsg(null);
        setErrorKind(null);
        updateStatus('watching');
        log('отслеживание запущено');
        runProximityCheck();
      } catch (error) {
        handleError(toLocationError(error));
      }
    };

    void setupLocation();

    return () => {
      cancelled = true;
      if (locationSubscription) {
        locationSubscription.remove();
        log('отслеживание остановлено');
      }
    };
  }, [attempt, runProximityCheck]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Возврат в приложение: пользователь мог включить GPS или выдать разрешения в настройках.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (statusRef.current === 'error') retry();
      void getNotificationPermission().then((permission) => {
        notificationManager.setNotificationsAllowed(permission === 'granted');
        setNotificationPermission(permission);
      });
    });
    return () => subscription.remove();
  }, [retry]);

  // ---------- Симуляция GPS ----------

  const setSimulationEnabled = useCallback(
    (enabled: boolean) => {
      simulationRef.current = { ...simulationRef.current, enabled };
      setSimulationEnabledState(enabled);
      log(`симуляция ${enabled ? 'включена' : 'выключена'}`);
      if (getEffectiveCoordinates()) {
        runProximityCheck();
      } else {
        void notificationManager.clearAll();
        setNearby([]);
      }
    },
    [getEffectiveCoordinates, runProximityCheck],
  );

  const setSimulatedLocation = useCallback(
    (coordinate: Coordinates) => {
      simulationRef.current = { ...simulationRef.current, location: coordinate };
      setSimulatedLocationState(coordinate);
      if (simulationRef.current.enabled) runProximityCheck();
    },
    [runProximityCheck],
  );

  const effectiveLocation = useMemo<Coordinates | null>(() => {
    if (simulationEnabled) return simulatedLocation;
    return location ? toCoordinates(location) : null;
  }, [simulationEnabled, simulatedLocation, location]);

  const value = useMemo<LocationContextValue>(
    () => ({
      location,
      errorMsg,
      errorKind,
      status,
      retry,
      notificationPermission,
      requestNotifications,
      nearby,
      simulation: { enabled: simulationEnabled, location: simulatedLocation },
      setSimulationEnabled,
      setSimulatedLocation,
      effectiveLocation,
    }),
    [
      location,
      errorMsg,
      errorKind,
      status,
      retry,
      notificationPermission,
      requestNotifications,
      nearby,
      simulationEnabled,
      simulatedLocation,
      setSimulationEnabled,
      setSimulatedLocation,
      effectiveLocation,
    ],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation должен вызываться внутри <LocationProvider>');
  return ctx;
}
