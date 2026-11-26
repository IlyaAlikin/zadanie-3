import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDistance } from '../services/location';
import type { NearbyMarker } from '../types';

type NearbyPanelProps = {
  nearby: NearbyMarker[];
  onPress: (markerId: number) => void;
};

/** Панель «Рядом с вами»: метки в зоне приближения и расстояние до них. */
export default function NearbyPanel({ nearby, onPress }: NearbyPanelProps) {
  if (nearby.length === 0) return null;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Рядом с вами</Text>
      {nearby.slice(0, 3).map((item) => (
        <Pressable
          key={item.markerId}
          onPress={() => onPress(item.markerId)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <View style={styles.dot} />
          <Text style={styles.name}>Метка №{item.markerId}</Text>
          <Text style={styles.distance}>{formatDistance(item.distance)}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
      {nearby.length > 3 && <Text style={styles.more}>и ещё {nearby.length - 3}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16a34a',
  },
  name: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
  distance: {
    fontSize: 15,
    color: '#16a34a',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    fontSize: 20,
    color: '#94a3b8',
  },
  more: {
    fontSize: 13,
    color: '#64748b',
  },
  pressed: {
    opacity: 0.6,
  },
});
