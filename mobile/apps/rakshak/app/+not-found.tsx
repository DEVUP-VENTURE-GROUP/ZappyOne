import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { colors } from '@zappy/ui/theme/colors';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.background }}>
        <Text variant="heading3">This screen does not exist.</Text>
        <Link href="/"><Text color={colors.primary} weight="semibold">Go to home</Text></Link>
      </View>
    </>
  );
}
