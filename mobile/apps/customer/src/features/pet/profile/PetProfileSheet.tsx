/**
 * Add a pet, or finish an older profile (the website's PetProfileSheet).
 * Name, size, gender, age, weight, temperament, vaccinations, biting and
 * strangers are required: the provider is matched and briefed on them. Breed
 * (which pre-fills a size), photo, allergies and notes stay optional.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useCreateMyPetMutation, usePetBreedsQuery, useUpdateMyPetMutation } from '@zappy/core/api';
import { BottomSheet, Button, Chip, Input, Text } from '@zappy/ui/components';
import { ImageUploadField } from '@zappy/ui/components/common/ImageUploadField';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { AGES, BITE, GENDERS, REQUIRED, SIZES, SPECIES, STRANGERS, TEMPERAMENTS, VACCINATION, ageOf } from './petProfileOptions';
import { Question } from './Question';

export interface Pet {
  _id: string; name: string; species: string; breedCode?: string; breed?: string; size: string; weight?: number; gender?: string; dob?: string;
  temperament?: string; vaccinationStatus?: string; biteRisk?: string; aggressionLevel?: string; allergies?: string[]; specialNeeds?: string; photoKey?: string; safetyAnsweredAt?: string;
}
type Form = Record<string, string | number>;

export function PetProfileSheet({ pet, visible, onClose }: { pet?: Pet | null; visible: boolean; onClose: () => void }) {
  const t = useT();
  const editing = !!pet;
  const answered = !!pet?.safetyAnsweredAt;
  const [species, setSpecies] = useState(pet?.species || 'dog');
  const [form, setForm] = useState<Form>(() => ({
    name: pet?.name || '', breedCode: pet?.breedCode || '', breed: pet?.breed || '', size: pet?.size || '', weight: pet?.weight ?? '',
    gender: pet?.gender && pet.gender !== 'unknown' ? pet.gender : '', age: ageOf(pet?.dob),
    // On an older profile these were defaults, not answers: ask again.
    temperament: pet?.temperament && pet.temperament !== 'unknown' ? pet.temperament : '',
    vaccinationStatus: answered ? pet!.vaccinationStatus || '' : '', biteRisk: answered ? pet!.biteRisk || '' : '', aggressionLevel: answered ? pet!.aggressionLevel || '' : '',
    allergies: (pet?.allergies || []).join(', '), specialNeeds: pet?.specialNeeds || '',
  }));
  const [photoKey, setPhotoKey] = useState(pet?.photoKey || '');
  const [tried, setTried] = useState(false);
  const { data: breedData } = usePetBreedsQuery({ species });
  const [create, { isLoading: creating }] = useCreateMyPetMutation();
  const [update, { isLoading: updating }] = useUpdateMyPetMutation();
  const breeds: { code: string; name: string; typicalSize?: string }[] = breedData?.breeds || [];
  const set = (k: string) => (v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const missing = (k: string) => tried && (form[k] === '' || form[k] == null);

  function pickBreed(code: string) {
    const b = breeds.find((x) => x.code === code);
    setForm((f) => ({ ...f, breedCode: code, breed: b?.name || '', size: f.size || b?.typicalSize || '' }));
  }

  async function save() {
    setTried(true);
    if (!String(form.name).trim()) { toast.error(t('pets.needName', 'Give your pet a name')); return; }
    if (REQUIRED.some((k) => form[k] === '' || form[k] == null)) { toast.error(t('pets.answerRed', 'Please answer the questions in red. The provider needs them to handle your pet safely.')); return; }
    if (!(Number(form.weight) > 0)) { toast.error(t('pets.needWeight', 'Enter the weight in kg (a guess is fine)')); return; }
    const { age, allergies, ...rest } = form;
    const body = {
      ...rest, species, photoKey, weight: Number(form.weight),
      dob: new Date(Date.now() - Number(age) * 365.25 * 86400e3).toISOString(),
      allergies: String(allergies).split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editing) await update({ id: pet!._id, ...body }).unwrap(); else await create(body).unwrap();
      toast.success(editing ? t('pets.saved', 'Profile saved') : t('pets.added', 'Added'));
      onClose();
    } catch (err) { toast.error(errText(err, t('pets.saveFailed', 'Could not save. Try again.'))); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? t('pets.finish', 'Finish {x}’s profile').replace('{x}', pet!.name) : t('pets.add', 'Add a pet')} heightFraction={0.92}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!editing ? (
          <View style={styles.row}>{SPECIES.map((s) => <Chip key={String(s.value)} label={t(`pets.species.${s.value}`, s.label)} selected={species === s.value} onPress={() => { setSpecies(String(s.value)); setForm((f) => ({ ...f, breedCode: '', breed: '' })); }} />)}</View>
        ) : null}
        <Input value={String(form.name)} onChangeText={set('name')} placeholder={t('pets.name', 'Name')} error={tried && !String(form.name).trim() ? t('pets.needName', 'Give your pet a name') : null} />
        {breeds.length ? (
          <Question label={t('pets.breed', 'Breed (optional, or mixed / indie)')} missing={false} scroll options={breeds.map((b) => ({ value: b.code, label: b.name }))} value={String(form.breedCode)} onChange={(v) => pickBreed(String(v))} />
        ) : null}
        <View style={styles.note}><Text variant="caption" color={zappy[800]}>{t('pets.why', 'These help us send the right person with the right care. Every question below is needed to book.')}</Text></View>
        <Question label={t('pets.gender', 'Gender')} missing={missing('gender')} options={GENDERS} value={form.gender} onChange={set('gender')} keyPrefix="pets.g" />
        <Question label={t('pets.size', 'Size')} missing={missing('size')} options={SIZES} value={form.size} onChange={set('size')} keyPrefix="pets.s" />
        <Question label={t('pets.age', 'Age')} missing={missing('age')} options={AGES} value={form.age} onChange={set('age')} scroll />
        <Input label={t('pets.weight', 'Weight (kg)')} value={String(form.weight)} onChangeText={set('weight')} keyboardType="decimal-pad" placeholder={t('pets.weightHint', 'A guess is fine')} error={missing('weight') ? t('pets.needWeight', 'Enter the weight in kg (a guess is fine)') : null} />
        <Question label={t('pets.mood', 'Usual mood')} missing={missing('temperament')} options={TEMPERAMENTS} value={form.temperament} onChange={set('temperament')} keyPrefix="pets.m" />
        <Question label={t('pets.vacc', 'Vaccinations')} missing={missing('vaccinationStatus')} options={VACCINATION} value={form.vaccinationStatus} onChange={set('vaccinationStatus')} keyPrefix="pets.v" />
        <Question label={t('pets.bite', 'Has your pet ever bitten or snapped at someone?')} missing={missing('biteRisk')} options={BITE} value={form.biteRisk} onChange={set('biteRisk')} keyPrefix="pets.b" />
        <Question label={t('pets.strangers', 'With strangers, your pet is…')} missing={missing('aggressionLevel')} options={STRANGERS} value={form.aggressionLevel} onChange={set('aggressionLevel')} keyPrefix="pets.x" />
        <Text variant="caption" weight="bold" color={ink[400]}>{t('pets.optional', 'OPTIONAL')}</Text>
        <Input value={String(form.allergies)} onChangeText={set('allergies')} placeholder={t('pets.allergies', 'Allergies, comma separated')} />
        <Input value={String(form.specialNeeds)} onChangeText={set('specialNeeds')} placeholder={t('pets.needs', 'Special needs or handling instructions')} multiline multilineHeight={64} />
        <ImageUploadField value={photoKey} onChange={setPhotoKey} folder="pet/photos" label="photo" />
        <Button label={editing ? t('pets.saveProfile', 'Save profile') : t('pets.addPet', 'Add pet')} variant="secondary" loading={creating || updating} onPress={save} fullWidth />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.base, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.sm },
  note: { padding: spacing.md, borderRadius: radius.medium, backgroundColor: zappy[50] },
});
