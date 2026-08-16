/**
 * Address sheet — where the booking's location is chosen.
 * ----------------------------------------------------------------------------
 * The website does this in a desktop sidebar; the brief maps that to a bottom
 * sheet, which is also what Uber and Urban Company do on mobile.
 *
 * Three ways in, in the order people actually use them:
 *   1. a saved address (GET /users/addresses)
 *   2. current GPS position, reverse-geocoded for a readable line
 *   3. typed manually, then forward-geocoded to a pin
 *
 * The pin (lat/lng) and the text are separate concerns. Dispatch matches on the
 * COORDINATES, so editing the text of a GPS-derived address must not silently
 * move the pin — and picking a saved address must bring its own coordinates.
 * Both are handled by always emitting a complete `BookingLocation`.
 *
 * Route 3 exists because without it the sheet is a dead end: someone who denies
 * location permission and has no saved address has no way to produce a pin, and
 * the booking cannot proceed. `Location.geocodeAsync` resolves the typed text
 * on-device — no new backend route, no third-party key.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { Briefcase, Crosshair, House, MapPin, Search } from 'lucide-react-native';
import {
  BottomSheet,
  Button,
  Card,
  Input,
  SectionTitle,
  Text,
} from '../ui';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import type { SavedAddress } from '../../types/api';

export interface BookingLocation {
  lat: number;
  lng: number;
  address: string;
  landmark?: string;
  flatNumber?: string;
  /** How the pin was obtained — drives the label shown on the location card. */
  source: 'gps' | 'saved' | 'manual';
  savedLabel?: string;
}

export interface AddressSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (location: BookingLocation) => void;
  savedAddresses: SavedAddress[];
  savedLoading?: boolean;
  /** Pre-fills the form when re-opening to edit. */
  initial?: BookingLocation | null;
}

function tagIcon(tag?: string) {
  if (tag === 'home') return House;
  if (tag === 'work') return Briefcase;
  return MapPin;
}

function AddressSheetBase({
  visible,
  onClose,
  onConfirm,
  savedAddresses,
  savedLoading,
  initial,
}: AddressSheetProps) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [source, setSource] = useState<BookingLocation['source']>('manual');
  const [savedLabel, setSavedLabel] = useState<string | undefined>();
  const [address, setAddress] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [landmark, setLandmark] = useState('');
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Re-seed each time the sheet opens so an abandoned edit doesn't persist.
  useEffect(() => {
    if (!visible) return;
    setCoords(initial ? { lat: initial.lat, lng: initial.lng } : null);
    setSource(initial?.source ?? 'manual');
    setSavedLabel(initial?.savedLabel);
    setAddress(initial?.address ?? '');
    setFlatNumber(initial?.flatNumber ?? '');
    setLandmark(initial?.landmark ?? '');
    setGpsError(null);
  }, [visible, initial]);

  const useCurrentLocation = useCallback(async () => {
    setLocating(true);
    setGpsError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Location permission is off. Turn it on, or type your address below.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords({ lat, lng });
      setSource('gps');
      setSavedLabel(undefined);

      // Reverse geocoding is a convenience. If it fails the pin is still valid
      // and the customer can type the line themselves.
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) {
          const line = [place.name, place.street, place.district, place.city, place.region]
            .filter(Boolean)
            .join(', ');
          if (line) setAddress(line);
        }
      } catch {
        /* keep whatever the customer already typed */
      }
    } catch {
      setGpsError("We couldn't get a GPS fix. Type your address below instead.");
    } finally {
      setLocating(false);
    }
  }, []);

  const pickSaved = useCallback((saved: SavedAddress) => {
    setCoords({ lat: saved.lat, lng: saved.lng });
    setSource('saved');
    setSavedLabel(saved.label || saved.tag);
    setAddress(saved.address);
    setFlatNumber(saved.flatNumber ?? '');
    setLandmark(saved.landmark ?? '');
    setGpsError(null);
  }, []);

  /** Turn typed text into a pin, for people who can't or won't share GPS. */
  const locateTypedAddress = useCallback(async () => {
    const text = address.trim();
    if (!text) return;
    setLocating(true);
    setGpsError(null);
    try {
      const [match] = await Location.geocodeAsync(text);
      if (!match) {
        setGpsError(
          "We couldn't find that address on the map. Add the city, or use your current location.",
        );
        return;
      }
      setCoords({ lat: match.latitude, lng: match.longitude });
      setSource('manual');
      setSavedLabel(undefined);
    } catch {
      setGpsError('Address lookup is unavailable right now. Try your current location.');
    } finally {
      setLocating(false);
    }
  }, [address]);

  // Both halves are required: the text is what the pro reads, the pin is what
  // dispatch searches on.
  const canConfirm = Boolean(coords) && address.trim().length > 0;

  const confirm = useCallback(() => {
    if (!coords || !address.trim()) return;
    onConfirm({
      lat: coords.lat,
      lng: coords.lng,
      address: address.trim(),
      flatNumber: flatNumber.trim() || undefined,
      landmark: landmark.trim() || undefined,
      source,
      savedLabel,
    });
  }, [coords, address, flatNumber, landmark, source, savedLabel, onConfirm]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Service location" heightFraction={0.86}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <Button
          label={locating ? 'Locating…' : 'Use my current location'}
          variant={source === 'gps' ? 'primary' : 'secondary'}
          icon={
            locating ? undefined : (
              <Crosshair size={16} color={source === 'gps' ? colors.textInverse : colors.primary} />
            )
          }
          loading={locating}
          onPress={useCurrentLocation}
          fullWidth
        />

        {gpsError ? (
          <Text variant="caption" color={colors.error}>
            {gpsError}
          </Text>
        ) : null}

        {savedLoading ? (
          <View style={styles.savedLoading}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : savedAddresses.length > 0 ? (
          <View style={styles.block}>
            <SectionTitle>Saved addresses</SectionTitle>
            <View style={styles.savedList}>
              {savedAddresses.map((saved) => {
                const Icon = tagIcon(saved.tag);
                const active =
                  source === 'saved' &&
                  coords?.lat === saved.lat &&
                  coords?.lng === saved.lng;
                return (
                  <Card
                    key={saved._id}
                    variant={active ? 'default' : 'outline'}
                    onPress={() => pickSaved(saved)}
                    style={[styles.savedCard, active ? styles.savedCardActive : null]}
                    padding={spacing.md}
                    accessibilityLabel={`Use ${saved.label || saved.tag || 'saved'} address`}
                  >
                    <View style={styles.savedRow}>
                      <View style={styles.savedIcon}>
                        <Icon size={16} color={colors.primary} />
                      </View>
                      <View style={styles.flex}>
                        <Text variant="body" weight="semibold" numberOfLines={1}>
                          {saved.label || saved.tag || 'Saved address'}
                        </Text>
                        <Text
                          variant="caption"
                          color={colors.textSecondary}
                          numberOfLines={2}
                        >
                          {saved.address}
                        </Text>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.block}>
          <SectionTitle>Address details</SectionTitle>
          <Input
            label="Address"
            placeholder="Area, street, city"
            value={address}
            // Editing the text deliberately does NOT clear the pin: people
            // routinely correct a reverse-geocoded line ("Flat 3B" instead of
            // the street name) and the coordinates are still the right ones.
            onChangeText={setAddress}
            multiline
            multilineHeight={72}
          />
          <View style={styles.pairRow}>
            <Input
              label="Flat / house"
              placeholder="Optional"
              value={flatNumber}
              onChangeText={setFlatNumber}
              containerStyle={styles.flex}
            />
            <Input
              label="Landmark"
              placeholder="Optional"
              value={landmark}
              onChangeText={setLandmark}
              containerStyle={styles.flex}
            />
          </View>
        </View>

        {!coords && address.trim() ? (
          <Button
            label="Find this address on the map"
            variant="secondary"
            icon={<Search size={16} color={colors.primary} />}
            onPress={locateTypedAddress}
            loading={locating}
            fullWidth
          />
        ) : null}

        {!coords ? (
          <Text variant="caption" color={colors.textSecondary}>
            We need a map pin to find pros near you — use your current location, or
            type the address and we'll look it up.
          </Text>
        ) : null}
      </ScrollView>

      <Button
        label="Use this location"
        onPress={confirm}
        disabled={!canConfirm}
        fullWidth
        style={styles.confirm}
      />
    </BottomSheet>
  );
}

export const AddressSheet = memo(AddressSheetBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: spacing.base, paddingBottom: spacing.base },

  block: { gap: spacing.sm },
  savedLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  savedList: { gap: spacing.sm },
  savedCard: { borderRadius: radius.medium },
  savedCardActive: { borderWidth: 1.5, borderColor: colors.primary },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  savedIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.small,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pairRow: { flexDirection: 'row', gap: spacing.md },
  confirm: { marginTop: spacing.base },
});
