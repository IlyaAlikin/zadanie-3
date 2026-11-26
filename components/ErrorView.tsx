import { Pressable, StyleSheet, Text, View } from 'react-native';

type Action = { label: string; onPress: () => void };

type ErrorViewProps = {
  title: string;
  message?: string;
  actions?: Action[];
};

/** Универсальный экран ошибки с кнопками действий. */
export default function ErrorView({ title, message, actions = [] }: ErrorViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actions.map((action, index) => (
        <Pressable
          key={action.label}
          onPress={action.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            index > 0 && styles.secondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, index > 0 && styles.secondaryButtonText]}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    minWidth: 200,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: '#e2e8f0',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButtonText: {
    color: '#1e293b',
  },
  pressed: {
    opacity: 0.7,
  },
});
