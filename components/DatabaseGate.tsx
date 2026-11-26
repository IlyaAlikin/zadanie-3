import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { errorMessage, useDatabase } from '../contexts/DatabaseContext';
import ErrorView from './ErrorView';

/**
 * Не пускает в приложение, пока БД не открыта.
 * При ошибке инициализации предлагает повторить попытку или сбросить базу.
 */
export default function DatabaseGate({ children }: { children: ReactNode }) {
  const { isReady, initError, retryInit, resetDatabase } = useDatabase();

  if (initError) {
    const confirmReset = () =>
      Alert.alert(
        'Сбросить базу данных?',
        'Все метки и изображения будут удалены без возможности восстановления.',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Сбросить', style: 'destructive', onPress: () => void resetDatabase() },
        ],
      );

    return (
      <ErrorView
        title="Не удалось открыть базу данных"
        message={errorMessage(initError)}
        actions={[
          { label: 'Повторить', onPress: retryInit },
          { label: 'Сбросить базу данных', onPress: confirmReset },
        ]}
      />
    );
  }

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Открываем базу данных…</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#334155',
  },
});
