/**
 * Everything we do, in one place (the website's AllServicesPage). Every live
 * service shows and opens; each tap is recorded as demand, and the booking
 * step says if nobody can come to the address.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useGetServiceabilityQuery } from '@zappy/core/api';
import { loadGeoLocation, type CachedLocation } from '@zappy/core/lib/geoCache';
import { trackSearch } from '@zappy/core/lib/telemetry';
import { ScreenHeader } from '@zappy/ui/components';
import { LiveServices } from '@zappy/ui/components/home/LiveServices';
import { colors } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';

export function AllServicesPage() {
  const [here, setHere] = useState<CachedLocation | null>(null);
  useEffect(() => { loadGeoLocation().then(setHere); }, []);
  const { data: svc } = useGetServiceabilityQuery({ lat: here?.lat, lng: here?.lng }, { skip: here?.lat == null });
  return (
    <View style={styles.page}>
      <ScreenHeader title="All services" subtitle="What we can do for you today" safeArea />
      <ScrollView contentContainerStyle={styles.body}>
        <LiveServices availableCodes={svc ? svc.lines.map((l: { code: string }) => l.code) : null}
          onOpenService={(code, served) => trackSearch({ category: code, lat: here?.lat, lng: here?.lng, result: served ? 'served' : 'no_service', userType: 'user' })} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.base, paddingBottom: spacing.xxxl },
});
