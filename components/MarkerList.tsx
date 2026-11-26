import { Fragment, memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, Marker } from 'react-native-maps';

import { PROXIMITY_THRESHOLD } from '../services/proximity';
import type { Marker as MarkerData } from '../types';

type MarkerListProps = {
  markers: MarkerData[];
  /** Метки, рядом с которыми находится пользователь. */
  nearbyIds: ReadonlySet<number>;
  onMarkerPress: (marker: MarkerData) => void;
};

const COLOR_DEFAULT = '#2563eb';
const COLOR_NEARBY = '#16a34a';

/**
 * Отрисовывает маркеры и их зоны приближения. Должен находиться внутри <MapView>.
 */
function MarkerList({ markers, nearbyIds, onMarkerPress }: MarkerListProps) {
  return (
    <>
      {markers.map((marker) => {
        const isNearby = nearbyIds.has(marker.id);
        const coordinate = { latitude: marker.latitude, longitude: marker.longitude };
        return (
          <Fragment key={marker.id}>
            <Circle
              center={coordinate}
              radius={PROXIMITY_THRESHOLD}
              strokeWidth={1}
              strokeColor={isNearby ? 'rgba(22,163,74,0.8)' : 'rgba(37,99,235,0.5)'}
              fillColor={isNearby ? 'rgba(22,163,74,0.15)' : 'rgba(37,99,235,0.08)'}
            />
            <Marker
              identifier={String(marker.id)}
              coordinate={coordinate}
              anchor={{ x: 0.5, y: 1 }}
              onPress={(e) => {
                e.stopPropagation();
                onMarkerPress(marker);
              }}
            >
              <MarkerPin
                number={marker.id}
                imagesCount={marker.imageCount}
                color={isNearby ? COLOR_NEARBY : COLOR_DEFAULT}
              />
            </Marker>
          </Fragment>
        );
      })}
    </>
  );
}

function MarkerPin({
  number,
  imagesCount,
  color,
}: {
  number: number;
  imagesCount: number;
  color: string;
}) {
  return (
    <View style={styles.wrapper} collapsable={false}>
      <View style={[styles.pin, { backgroundColor: color }]}>
        <Text style={styles.pinText}>{number}</Text>
        {imagesCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{imagesCount}</Text>
          </View>
        )}
      </View>
      <View style={[styles.tail, { borderTopColor: color }]} />
    </View>
  );
}

const PIN_SIZE = 34;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#f97316',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default memo(MarkerList);
