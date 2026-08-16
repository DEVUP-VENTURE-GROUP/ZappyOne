/**
 * Edit profile.
 * ----------------------------------------------------------------------------
 * Exactly the three fields `PATCH /users/me` accepts — name, email, avatarUrl —
 * and no more. The phone number is shown but not editable: it is the account's
 * identity and the login credential, and there is no endpoint to change it.
 * Rendering it as a disabled field says that plainly instead of offering an
 * edit that would silently do nothing.
 *
 * Avatar upload is deliberately absent. `uploadApi` exists, but nothing in the
 * customer API accepts an avatar file, so a picker here would end at a dead
 * end. Initials stand in, the same as everywhere else in the app.
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import {
  Appear,
  Avatar,
  Button,
  Card,
  Input,
  ScreenHeader,
  Text,
} from '../../components/ui';
import { useGetMeQuery, useUpdateMeMutation } from '../../services/api/authApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';

/** Permissive on purpose — the server is the authority, this only catches typos. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: me, isLoading } = useGetMeQuery();
  const [updateMe, { isLoading: saving }] = useUpdateMeMutation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Seed once the profile arrives, without clobbering an in-progress edit.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!me || seeded) return;
    setName(me.name ?? '');
    setEmail(me.email ?? '');
    setSeeded(true);
  }, [me, seeded]);

  const dirty = seeded && (name !== (me?.name ?? '') || email !== (me?.email ?? ''));

  const save = async () => {
    setError(null);
    setEmailError(null);

    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      setEmailError("That doesn't look like an email address.");
      return;
    }

    try {
      await updateMe({
        name: name.trim(),
        // Only send email when there is one; the field is optional server-side.
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
      }).unwrap();
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't save your profile."));
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Edit profile" onBack={() => router.back()} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarBlock}>
            <Avatar name={name || me?.name} uri={me?.avatarUrl} size={84} />
            <Text variant="caption" color={colors.textMuted} align="center">
              Your initials are used as your picture.
            </Text>
          </View>

          <Appear offsetY={6}>
            <Card variant="outline" style={styles.form}>
              <Input
                label="Name"
                placeholder="What should we call you?"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                maxLength={60}
                editable={!isLoading}
              />
              <Input
                label="Email"
                placeholder="Optional — for receipts"
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  setEmailError(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                error={emailError}
                editable={!isLoading}
              />

              {/* Shown, never editable — no endpoint changes a phone number. */}
              <View>
                <Text variant="label">Phone</Text>
                <View style={styles.lockedField}>
                  <Text variant="body" style={styles.flex}>
                    {me?.phone ?? '—'}
                  </Text>
                  <Lock size={15} color={colors.textMuted} />
                </View>
                <Text variant="caption" color={colors.textMuted} style={styles.hint}>
                  Your number is how you sign in, so it can&apos;t be changed here.
                </Text>
              </View>
            </Card>
          </Appear>

          {error ? (
            <Card variant="outline" style={styles.errorCard}>
              <Text variant="bodySmall" color={colors.errorDark}>
                {error}
              </Text>
            </Card>
          ) : null}

          <Button
            label="Save changes"
            onPress={save}
            loading={saving}
            disabled={!dirty || saving}
            fullWidth
            size="large"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: screenPadding, gap: spacing.lg },

  avatarBlock: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.base },

  form: { gap: spacing.base },
  lockedField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  hint: { marginTop: spacing.xs },

  errorCard: { backgroundColor: colors.errorTint, borderColor: colors.errorTint },
});
