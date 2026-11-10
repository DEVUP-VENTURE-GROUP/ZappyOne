// A new chat message pops up wherever the person is in the app (a vibration and a banner with Open), unless they wrote it or already have that chat open.
import { Vibration } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { toast } from '../components/Toast';

export function useChatPopup({ enabled, linkFor }: { enabled: boolean; linkFor: (kind: string, jobId: string) => string | null }): void {
  const router = useRouter();
  const path = usePathname();
  useSocketEvent('chat.message', (p) => {
    if (!p || (p as { mine?: boolean }).mine) return;
    const link = linkFor(p.kind, p.jobId);
    if (link && path === link) return;
    Vibration.vibrate([0, 120, 80, 120]);
    const text = String(p.text || '').slice(0, 90);
    toast(`New message: ${text}`, {
      id: `chat-${p.jobId}`,
      duration: 7000,
      ...(link ? { action: { label: 'Open', onPress: () => router.push(link as never) } } : {}),
    });
  }, enabled);
}
