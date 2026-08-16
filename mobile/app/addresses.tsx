/**
 * Saved addresses.
 * ----------------------------------------------------------------------------
 * List, add, set default, remove — the four things `/users/addresses` supports.
 *
 * Adding an address reuses the location picker rather than duplicating a
 * cut-down address form here. That screen already owns GPS, search, saved
 * places and the map pin, and a second half-implementation would drift from it
 * immediately. The picker returns through `locationDraft`, the same channel the
 * booking flow uses.
 *
 * Recent locations are shown read-only beneath the saved ones: the server keeps
 * them (`/users/addresses` returns both lists) but exposes no endpoint to edit
 * or delete one, so they are offered only as a shortcut to save.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Briefcase,
  Clock,
  House,
  MapPin,
  Plus,
  Star,
  Trash2,
} from 'lucide-react-native';
import {
  Appear,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  ScreenHeader,
  SectionTitle,
  SkeletonList,
  Text,
} from '../components/ui';
import { AccountRow, AccountSection } from '../components/account/AccountUI';
import {
  useAddAddressMutation,
  useDeleteAddressMutation,
  useGetAddressesQuery,
  useSetDefaultAddressMutation,
} from '../services/api/authApi';
import { getApiErrorMessage } from '../services/api/apiSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  locationDraftCleared,
  locationSeeded,
  type DraftLocation,
} from '../store/locationDraftSlice';
import { colors } from '../theme/colors';
import { screenPadding, spacing } from '../theme/spacing';
import type { RecentLocation, SavedAddress } from '../types/api';

const TAGS: { key: 'home' | 'work' | 'other'; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'work', label: 'Work' },
  { key: 'other', label: 'Other' },
];

function tagIcon(tag?: string) {
  if (tag === 'home') return House;
  if (tag === 'work') return Briefcase;
  return MapPin;
}

export default function AddressesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const { data, isLoading, error, refetch } = useGetAddressesQuery();
  const [addAddress, { isLoading: adding }] = useAddAddressMutation();
  const [deleteAddress] = useDeleteAddressMutation();
  const [setDefaultAddress] = useSetDefaultAddressMutation();

  const addresses = data?.addresses ?? [];
  const recents = data?.recentLocations ?? [];

  const [pending, setPending] = useState<DraftLocation | null>(null);
  const [label, setLabel] = useState('');
  const [tag, setTag] = useState<'home' | 'work' | 'other'>('home');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedAddress | null>(null);

  // The picker hands its result back through the store; `requestId` makes sure
  // it is consumed once rather than re-applied on every render.
  const draft = useAppSelector((state) => state.locationDraft);
  const consumed = useRef(0);
  useEffect(() => {
    if (!draft.picked || draft.requestId === consumed.current) return;
    consumed.current = draft.requestId;
    setPending(draft.picked);
    setLabel(draft.picked.savedLabel ?? '');
    dispatch(locationDraftCleared());
  }, [draft, dispatch]);

  const openPicker = useCallback(
    (seed?: DraftLocation | null) => {
      dispatch(locationSeeded(seed ?? null));
      router.push('/location/picker');
    },
    [dispatch, router],
  );

  const save = useCallback(async () => {
    if (!pending) return;
    setSaveError(null);
    try {
      // POST takes flat lat/lng — the GeoJSON shape is read-only. See authApi.
      await addAddress({
        label: label.trim() || TAGS.find((t) => t.key === tag)?.label || 'Address',
        tag,
        address: pending.address,
        lat: pending.lat,
        lng: pending.lng,
        ...(pending.landmark ? { landmark: pending.landmark } : {}),
        ...(pending.flatNumber ? { flatNumber: pending.flatNumber } : {}),
      }).unwrap();
      setPending(null);
      setLabel('');
      refetch();
    } catch (err) {
      setSaveError(getApiErrorMessage(err, "We couldn't save that address."));
    }
  }, [pending, label, tag, addAddress, refetch]);

  const saveRecent = useCallback((recent: RecentLocation) => {
    setPending({
      lat: recent.lat,
      lng: recent.lng,
      address: recent.address,
      source: 'recent',
    });
    setLabel('');
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader
          title="Saved addresses"
          onBack={() => router.back()}
          right={
            <IconButton
              icon={<Plus size={18} color={colors.primary} />}
              onPress={() => openPicker(null)}
              variant="surface"
              accessibilityLabel="Add an address"
            />
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <SkeletonList count={3} />
        ) : error ? (
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load your addresses.")}
            onRetry={refetch}
          />
        ) : (
          <>
            {addresses.length > 0 ? (
              <Appear>
                <AccountSection title="Your addresses">
                  {addresses.map((address) => {
                    const Icon = tagIcon(address.tag);
                    return (
                      <View key={address._id}>
                        <AccountRow
                          icon={<Icon size={17} color={colors.primary} />}
                          label={address.label || address.tag || 'Address'}
                          detail={address.address}
                          right={
                            address.isDefault ? (
                              <View style={styles.defaultPill}>
                                <Text variant="caption" color={colors.successDark}>
                                  DEFAULT
                                </Text>
                              </View>
                            ) : (
                              <View />
                            )
                          }
                        />
                        <View style={styles.actionRow}>
                          {!address.isDefault ? (
                            <Button
                              label="Set default"
                              variant="ghost"
                              size="small"
                              icon={<Star size={13} color={colors.primary} />}
                              onPress={() => setDefaultAddress(address._id)}
                            />
                          ) : null}
                          <Button
                            label="Remove"
                            variant="dangerGhost"
                            size="small"
                            icon={<Trash2 size={13} color={colors.error} />}
                            onPress={() => setConfirmDelete(address)}
                          />
                        </View>
                      </View>
                    );
                  })}
                </AccountSection>
              </Appear>
            ) : (
              <EmptyState
                icon={<MapPin size={26} color={colors.textMuted} />}
                title="No saved addresses"
                message="Save the places you book from most and they'll be one tap away at checkout."
                actionLabel="Add an address"
                onAction={() => openPicker(null)}
              />
            )}

            {/* Read-only: the API keeps recents but exposes no way to edit them. */}
            {recents.length > 0 ? (
              <Appear offsetY={6}>
                <View style={styles.recentBlock}>
                  <SectionTitle>Recently used</SectionTitle>
                  {recents.map((recent) => (
                    <Card
                      key={`${recent.address}-${recent.usedAt ?? ''}`}
                      variant="outline"
                      onPress={() => saveRecent(recent)}
                      padding={spacing.md}
                      accessibilityLabel={`Save ${recent.address}`}
                    >
                      <View style={styles.recentRow}>
                        <View style={styles.recentIcon}>
                          <Clock size={15} color={colors.textSecondary} />
                        </View>
                        <Text variant="bodySmall" style={styles.flex} numberOfLines={2}>
                          {recent.address}
                        </Text>
                        <Text variant="caption" color={colors.primary}>
                          Save
                        </Text>
                      </View>
                    </Card>
                  ))}
                </View>
              </Appear>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* ── Label the picked location before saving ─────────────────────── */}
      <BottomSheet
        visible={Boolean(pending)}
        onClose={() => {
          setPending(null);
          setSaveError(null);
        }}
        title="Save this address"
      >
        <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={3}>
          {pending?.address}
        </Text>

        <View style={styles.tagRow}>
          {TAGS.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={tag === option.key}
              tone={tag === option.key ? 'blue' : 'neutral'}
              onPress={() => setTag(option.key)}
            />
          ))}
        </View>

        <Input
          label="Label"
          placeholder="e.g. Home, Mum's place"
          value={label}
          onChangeText={setLabel}
          maxLength={40}
          containerStyle={styles.labelInput}
        />

        {saveError ? (
          <Text variant="caption" color={colors.error}>
            {saveError}
          </Text>
        ) : null}

        <Button
          label="Save address"
          onPress={save}
          loading={adding}
          fullWidth
          style={styles.sheetPrimary}
        />
        <Button
          label="Change location"
          variant="secondary"
          onPress={() => {
            const seed = pending;
            setPending(null);
            openPicker(seed);
          }}
          fullWidth
          style={styles.sheetSecondary}
        />
      </BottomSheet>

      {/* ── Removal confirmation ────────────────────────────────────────── */}
      <BottomSheet
        visible={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Remove this address?"
      >
        <Text variant="bodySmall" color={colors.textSecondary}>
          {confirmDelete?.label || 'This address'} will be removed from your saved
          places. Your past bookings are unaffected.
        </Text>
        <Button
          label="Remove"
          variant="danger"
          onPress={() => {
            if (confirmDelete) deleteAddress(confirmDelete._id);
            setConfirmDelete(null);
          }}
          fullWidth
          style={styles.sheetPrimary}
        />
        <Button
          label="Keep it"
          variant="secondary"
          onPress={() => setConfirmDelete(null)}
          fullWidth
          style={styles.sheetSecondary}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: screenPadding, gap: spacing.lg, flexGrow: 1 },

  defaultPill: {
    backgroundColor: colors.successTint,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    marginTop: -spacing.xs,
  },

  recentBlock: { gap: spacing.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recentIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tagRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },
  labelInput: { marginTop: spacing.base },
  sheetPrimary: { marginTop: spacing.lg },
  sheetSecondary: { marginTop: spacing.sm },
});
