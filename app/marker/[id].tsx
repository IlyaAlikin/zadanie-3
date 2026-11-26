import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ErrorView from '../../components/ErrorView';
import ImageList from '../../components/ImageList';
import { errorMessage, useDatabase } from '../../contexts/DatabaseContext';
import { useLocation } from '../../contexts/LocationContext';
import { calculateDistance, formatDistance } from '../../services/location';
import type { Marker, MarkerDetailsParams, MarkerImage } from '../../types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-found' }
  | { status: 'ready'; marker: Marker; images: MarkerImage[] };

/** Экран деталей маркера: данные из SQLite и управление изображениями. */
export default function MarkerDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<MarkerDetailsParams>();
  const markerId = Number(id);
  const isValidId = Number.isInteger(markerId) && markerId > 0;

  const { getMarker, getMarkerImages, addImage, deleteImage, deleteMarker, dataVersion } =
    useDatabase();
  const { effectiveLocation, nearby } = useLocation();

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Загружаем маркер и его изображения; перечитываем после изменений данных.
  useEffect(() => {
    if (!isValidId || deleting) return;
    let active = true;

    Promise.all([getMarker(markerId), getMarkerImages(markerId)])
      .then(([marker, images]) => {
        if (!active) return;
        setState(marker ? { status: 'ready', marker, images } : { status: 'not-found' });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(error) });
      });

    return () => {
      active = false;
    };
  }, [isValidId, markerId, getMarker, getMarkerImages, dataVersion, reloadKey, deleting]);

  /** Возврат к карте: назад по стеку, а если стека нет (deep link) — замена на корень. */
  const goBackToMap = useCallback(() => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (error) {
      console.error('Ошибка навигации назад', error);
      router.replace('/');
    }
  }, [router]);

  const handleAddImage = useCallback(async () => {
    if (!isValidId) return;
    setPicking(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Нет доступа к галерее',
          'Разрешите доступ к фотографиям в настройках, чтобы добавлять изображения.',
          permission.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Открыть настройки', onPress: () => void Linking.openSettings() },
              ],
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled) return;

      const uris = result.assets.map((asset) => asset.uri).filter(Boolean);
      if (uris.length === 0) {
        throw new Error('Выбранные файлы не содержат изображений.');
      }

      // Сохраняем по одному, чтобы ошибка одного файла не отменяла остальные.
      let failed = 0;
      let lastError: unknown = null;
      for (const uri of uris) {
        try {
          await addImage(markerId, uri);
        } catch (error) {
          failed += 1;
          lastError = error;
        }
      }

      if (failed > 0) {
        Alert.alert(
          failed === uris.length
            ? 'Не удалось добавить изображения'
            : `Добавлено ${uris.length - failed} из ${uris.length}`,
          errorMessage(lastError),
        );
      }
    } catch (error) {
      console.error('Ошибка выбора изображения', error);
      Alert.alert('Не удалось добавить изображение', errorMessage(error));
    } finally {
      setPicking(false);
    }
  }, [isValidId, markerId, addImage]);

  const handleRemoveImage = useCallback(
    (image: MarkerImage) => {
      Alert.alert('Удалить изображение?', 'Изображение будет удалено из метки.', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteImage(image.id).catch((error: unknown) =>
              Alert.alert('Не удалось удалить изображение', errorMessage(error)),
            );
          },
        },
      ]);
    },
    [deleteImage],
  );

  const handleRemoveMarker = useCallback(() => {
    Alert.alert('Удалить метку?', 'Метка и все её изображения будут удалены.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteMarker(markerId);
            goBackToMap();
          } catch (error) {
            setDeleting(false);
            Alert.alert('Не удалось удалить метку', errorMessage(error));
          }
        },
      },
    ]);
  }, [deleteMarker, markerId, goBackToMap]);

  // ----- Состояния ошибок и загрузки -----

  if (!isValidId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Ошибка' }} />
        <ErrorView
          title="Некорректная ссылка"
          message={`«${id ?? ''}» — не идентификатор метки.`}
          actions={[{ label: 'Вернуться к карте', onPress: goBackToMap }]}
        />
      </>
    );
  }

  if (state.status === 'loading' || deleting) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: deleting ? 'Удаление…' : 'Загрузка…' }} />
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (state.status === 'not-found') {
    return (
      <>
        <Stack.Screen options={{ title: 'Метка не найдена' }} />
        <ErrorView
          title="Метка не найдена"
          message={`Метки №${markerId} нет в базе данных. Возможно, она была удалена.`}
          actions={[{ label: 'Вернуться к карте', onPress: goBackToMap }]}
        />
      </>
    );
  }

  if (state.status === 'error') {
    return (
      <>
        <Stack.Screen options={{ title: 'Ошибка' }} />
        <ErrorView
          title="Не удалось загрузить метку"
          message={state.message}
          actions={[
            {
              label: 'Повторить',
              onPress: () => {
                setState({ status: 'loading' });
                setReloadKey((k) => k + 1);
              },
            },
            { label: 'Вернуться к карте', onPress: goBackToMap },
          ]}
        />
      </>
    );
  }

  const { marker, images } = state;
  const distance = effectiveLocation
    ? calculateDistance(
        effectiveLocation.latitude,
        effectiveLocation.longitude,
        marker.latitude,
        marker.longitude,
      )
    : null;
  const isNearby = nearby.some((n) => n.markerId === marker.id);

  const header = (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Местоположение</Text>
        <InfoRow label="Широта" value={marker.latitude.toFixed(6)} />
        <InfoRow label="Долгота" value={marker.longitude.toFixed(6)} />
        <InfoRow label="Создана" value={new Date(marker.createdAt).toLocaleString('ru-RU')} />
        <InfoRow label="Изображений" value={String(images.length)} />
        <InfoRow
          label="Расстояние до вас"
          value={
            distance === null
              ? 'неизвестно'
              : `${formatDistance(distance)}${isNearby ? ' · вы рядом' : ''}`
          }
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.addButton, (pressed || picking) && styles.pressed]}
        onPress={handleAddImage}
        disabled={picking}
        accessibilityRole="button"
      >
        {picking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.addButtonText}>Добавить изображение</Text>
        )}
      </Pressable>

      {images.length > 0 && <Text style={styles.sectionTitle}>Изображения</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `Метка №${marker.id}`,
          headerRight: () => (
            <Pressable onPress={handleRemoveMarker} hitSlop={8} accessibilityRole="button">
              <Text style={styles.headerDelete}>Удалить</Text>
            </Pressable>
          ),
        }}
      />
      <ImageList images={images} onRemove={handleRemoveImage} header={header} />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>
        {value}
      </Text>
    </View>
  );
}

/** Перехват непредвиденных ошибок рендера экрана деталей. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <ErrorView
      title="Не удалось отобразить метку"
      message={error.message}
      actions={[
        { label: 'Повторить', onPress: () => void retry() },
        {
          label: 'Вернуться к карте',
          onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 15,
    color: '#64748b',
  },
  infoValue: {
    fontSize: 15,
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
  },
  addButton: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 12,
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerDelete: {
    color: '#dc2626',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
