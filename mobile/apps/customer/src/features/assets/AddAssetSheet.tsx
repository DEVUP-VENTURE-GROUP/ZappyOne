/** Save a thing (the website's AddAssetSheet): the service, the brand, optionally the model, what you call it and where it is. */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useCreateAssetMutation, useRepairBrandsQuery, useRepairModelsQuery } from '@zappy/core/api';
import { BottomSheet, Button, Input } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { spacing } from '@zappy/ui/theme/spacing';
import { Question } from '../pet/profile/Question';
import { VERTICAL_LABEL } from './assetLabels';

export function AddAssetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const [vertical, setVertical] = useState('water_tank_care');
  const [brandCode, setBrandCode] = useState('');
  const [modelCode, setModelCode] = useState('');
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [create, { isLoading }] = useCreateAssetMutation();
  const { data: brands } = useRepairBrandsQuery(vertical);
  const { data: models } = useRepairModelsQuery({ brandCode, vertical }, { skip: !brandCode });
  useEffect(() => { setBrandCode(''); setModelCode(''); }, [vertical]);
  useEffect(() => { setModelCode(''); }, [brandCode]);

  async function save() {
    if (!brandCode) { toast.error(t('assets.pick', 'Pick one')); return; }
    try { await create({ vertical, brandCode, modelCode: modelCode || null, label, address: address || undefined }).unwrap(); toast.success(t('assets.saved', 'Saved')); onClose(); }
    catch (err) { toast.error(errText(err, t('assets.saveFailed', 'Could not save. Try again.'))); }
  }

  const brandList: { code: string; name: string }[] = brands?.brands || [];
  const modelList: { code: string; name: string }[] = models?.models || [];
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('assets.add', 'Save a thing')} heightFraction={0.85}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Question label={t('assets.kind', 'What is it?')} missing={false} options={Object.entries(VERTICAL_LABEL).map(([value, l]) => ({ value, label: l }))} value={vertical} onChange={(v) => setVertical(String(v))} />
        {brandList.length ? <Question label={t('assets.brand', 'Which one?')} missing={false} scroll options={brandList.map((b) => ({ value: b.code, label: b.name }))} value={brandCode} onChange={(v) => setBrandCode(String(v))} /> : null}
        {brandCode && modelList.length ? <Question label={t('assets.model', 'Model (optional)')} missing={false} scroll options={modelList.map((m) => ({ value: m.code, label: m.name }))} value={modelCode} onChange={(v) => setModelCode(String(v))} /> : null}
        <Input value={label} onChangeText={setLabel} placeholder={t('assets.label', 'What do you call it? e.g. Terrace tank')} />
        <Input value={address} onChangeText={setAddress} placeholder={t('assets.where', 'Where is it? (optional)')} />
        <Button label={isLoading ? t('assets.saving', 'Saving…') : t('common.save', 'Save')} variant="secondary" loading={isLoading} disabled={!brandCode} onPress={save} fullWidth />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ body: { gap: spacing.base, paddingBottom: spacing.xxl } });
