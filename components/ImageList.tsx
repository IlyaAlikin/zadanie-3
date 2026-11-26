import { useState, type ReactElement } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import type { MarkerImage } from '../types';

type ImageListProps = {
  images: MarkerImage[];
  onRemove: (image: MarkerImage) => void;
  /** Шапка списка (информация о маркере, кнопка добавления). */
  header?: ReactElement;
};

const COLUMNS = 2;
const GAP = 12;
const PADDING = 16;

/**
 * Сетка изображений маркера с удалением и полноэкранным предпросмотром.
 */
export default function ImageList({ images, onRemove, header }: ImageListProps) {
  const { width } = useWindowDimensions();
  const [preview, setPreview] = useState<MarkerImage | null>(null);
  const tileSize = (width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <>
      <FlatList
        data={images}
        keyExtractor={(item) => String(item.id)}
        numColumns={COLUMNS}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Изображений пока нет</Text>
            <Text style={styles.emptyText}>
              Нажмите «Добавить изображение», чтобы прикрепить фото к этой метке.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ImageTile
            image={item}
            size={tileSize}
            onPress={() => setPreview(item)}
            onRemove={() => onRemove(item)}
          />
        )}
      />

      <Modal
        visible={preview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          {preview && (
            <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" />
          )}
          <Text style={styles.previewHint}>Нажмите, чтобы закрыть</Text>
        </Pressable>
      </Modal>
    </>
  );
}

type ImageTileProps = {
  image: MarkerImage;
  size: number;
  onPress: () => void;
  onRemove: () => void;
};

function ImageTile({ image, size, onPress, onRemove }: ImageTileProps) {
  const [failed, setFailed] = useState(false);

  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        disabled={failed}
        accessibilityRole="imagebutton"
        accessibilityLabel="Открыть изображение"
      >
        {failed ? (
          <View style={styles.broken}>
            <Text style={styles.brokenText}>Не удалось загрузить изображение</Text>
          </View>
        ) : (
          <Image
            source={{ uri: image.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        )}
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Удалить изображение"
      >
        <Text style={styles.removeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: PADDING,
    paddingBottom: 40,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
  },
  tile: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  broken: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  brokenText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
  previewHint: {
    marginTop: 16,
    color: '#cbd5e1',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
});
