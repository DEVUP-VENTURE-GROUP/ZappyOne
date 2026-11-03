import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

// A link with ?focus=<key> scrolls the screen to the section that holds that field (the website's useFocusField); sections register with field(...keys).
export function useFocusField(ready: boolean) {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const ys = useRef<Record<string, number>>({});
  const done = useRef(false);
  const go = useCallback(() => {
    if (!ready || !focus || done.current || ys.current[focus] == null) return;
    done.current = true;
    const y = Math.max(0, ys.current[focus] - 16);
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 200);
  }, [ready, focus]);
  useEffect(go, [go]);
  const field = (...keys: string[]) => ({
    onLayout: (e: LayoutChangeEvent) => { keys.forEach((k) => { ys.current[k] = e.nativeEvent.layout.y; }); go(); },
  });
  return { scrollRef, field, focused: (...keys: string[]) => !!focus && keys.includes(focus) };
}
