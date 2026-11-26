import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import DatabaseGate from '../components/DatabaseGate';
import { DatabaseProvider } from '../contexts/DatabaseContext';
import { LocationProvider } from '../contexts/LocationContext';
import { useNotificationNavigation } from '../hooks/useNotificationNavigation';

function AppNavigator() {
  useNotificationNavigation();

  return (
    <Stack screenOptions={{ headerTransparent: false, headerBackTitle: 'Карта' }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Карта' }} />
      <Stack.Screen name="marker/[id]" options={{ title: 'Метка' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <StatusBar style="dark" />
      <DatabaseGate>
        <LocationProvider>
          <AppNavigator />
        </LocationProvider>
      </DatabaseGate>
    </DatabaseProvider>
  );
}
