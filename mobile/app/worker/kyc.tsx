import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, ScrollView, Alert, Image } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ChevronLeft, Camera, CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { useGetKycStatusQuery, useSubmitKycMutation } from '../../services/api/workerApi';
import { usePresignUploadMutation, uploadToPresignedUrl } from '../../services/api/uploadApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';

type DocKind = 'aadhaar' | 'license' | 'selfie';
interface DocState {
  localUri: string | null;
  key: string | null;
  uploading: boolean;
}
const EMPTY_DOC: DocState = { localUri: null, key: null, uploading: false };

const DOC_META: Record<DocKind, { title: string; hint: string }> = {
  aadhaar: { title: 'Aadhaar card', hint: 'Front side, all details clearly visible' },
  license: { title: "Driving license", hint: 'Or any valid government photo ID' },
  selfie: { title: 'Selfie', hint: 'Clear photo of your face, good lighting' },
};

export default function WorkerKycScreen() {
  const router = useRouter();
  const { data: kyc, isLoading: kycLoading, refetch } = useGetKycStatusQuery();
  const [presignUpload] = usePresignUploadMutation();
  const [submitKyc, { isLoading: submitting }] = useSubmitKycMutation();

  const [docs, setDocs] = useState<Record<DocKind, DocState>>({
    aadhaar: EMPTY_DOC, license: EMPTY_DOC, selfie: EMPTY_DOC,
  });

  const capture = async (kind: DocKind) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera needed', 'Enable camera access to capture your document.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      cameraType: kind === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setDocs((prev) => ({ ...prev, [kind]: { localUri: uri, key: null, uploading: true } }));
    try {
      const { uploadUrl, key } = await presignUpload({ folder: 'kyc', contentType: 'image/jpeg' }).unwrap();
      await uploadToPresignedUrl(uri, uploadUrl, 'image/jpeg');
      setDocs((prev) => ({ ...prev, [kind]: { localUri: uri, key, uploading: false } }));
    } catch (e) {
      setDocs((prev) => ({ ...prev, [kind]: EMPTY_DOC }));
      Alert.alert('Upload failed', getApiErrorMessage(e, 'Please try again.'));
    }
  };

  const allUploaded = docs.aadhaar.key && docs.license.key && docs.selfie.key;
  const anyUploading = docs.aadhaar.uploading || docs.license.uploading || docs.selfie.uploading;

  const handleSubmit = async () => {
    if (!allUploaded) return;
    let lat: number | null = null, lng: number | null = null, geoStatus = 'fetching';
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        lat = pos.coords.latitude; lng = pos.coords.longitude; geoStatus = 'ok';
      } else {
        geoStatus = 'denied';
      }
    } catch { geoStatus = 'denied'; }

    try {
      await submitKyc({
        aadhaarUrl: docs.aadhaar.key!,
        licenseUrl: docs.license.key!,
        selfieUrl: docs.selfie.key!,
        selfieMetadata: {
          capturedAt: new Date().toISOString(),
          captureMethod: 'live_camera',
          lat, lng, geoStatus,
        },
      }).unwrap();
      Alert.alert('Submitted', 'Your KYC is under review. This usually takes under 24 hours.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      refetch();
    } catch (e) {
      Alert.alert('Submission failed', getApiErrorMessage(e, 'Please try again.'));
    }
  };

  if (kycLoading) {
    return <SafeAreaView className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#F97316" /></SafeAreaView>;
  }

  // Already approved or pending — show status, no re-upload UI needed.
  if (kyc?.status === 'approved' || kyc?.status === 'pending_review') {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-row items-center px-4 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
            <ChevronLeft size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-navy ml-3">KYC status</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <View className={`w-16 h-16 rounded-full items-center justify-center mb-4 ${kyc.status === 'approved' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <ShieldCheck size={28} color={kyc.status === 'approved' ? '#16A34A' : '#B45309'} />
          </View>
          <Text className="text-lg font-bold text-navy text-center">
            {kyc.status === 'approved' ? "You're verified" : 'Under review'}
          </Text>
          <Text className="text-sm text-gray-500 text-center mt-2">
            {kyc.status === 'approved'
              ? 'Your KYC is approved — you can go online anytime.'
              : "We're checking your documents. This usually takes under 24 hours."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-navy ml-3">Submit KYC</Text>
      </View>

      {kyc?.status === 'rejected' ? (
        <View className="mx-5 mt-2 bg-red-50 border border-red-100 rounded-2xl p-4">
          <Text className="text-sm font-bold text-red-700">Your previous submission was rejected</Text>
          <Text className="text-xs text-red-600 mt-1">Please retake clear photos of each document below and resubmit.</Text>
        </View>
      ) : null}

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 140 }}>
        {(['aadhaar', 'license', 'selfie'] as DocKind[]).map((kind) => {
          const doc = docs[kind];
          const meta = DOC_META[kind];
          return (
            <TouchableOpacity
              key={kind}
              className="border border-gray-200 rounded-2xl p-4 mt-4 flex-row items-center gap-3"
              onPress={() => capture(kind)}
              disabled={doc.uploading}
            >
              <View className="w-16 h-16 rounded-xl bg-gray-50 items-center justify-center overflow-hidden">
                {doc.uploading ? (
                  <ActivityIndicator color="#F97316" />
                ) : doc.localUri ? (
                  <Image source={{ uri: doc.localUri }} className="w-full h-full" resizeMode="cover" />
                ) : (
                  <Camera size={22} color="#CBD5E1" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-navy">{meta.title}</Text>
                <Text className="text-xs text-gray-400 mt-0.5">{meta.hint}</Text>
              </View>
              {doc.key ? (
                <CheckCircle2 size={20} color="#16A34A" />
              ) : doc.localUri && !doc.uploading ? (
                <RotateCcw size={18} color="#94A3B8" />
              ) : null}
            </TouchableOpacity>
          );
        })}

        <Text className="text-xs text-gray-400 mt-5 text-center leading-relaxed">
          Your documents are stored securely and only used for identity verification.
        </Text>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-3 bg-white border-t border-gray-100">
        <TouchableOpacity
          className={`rounded-2xl p-4 items-center flex-row justify-center gap-2 ${allUploaded ? 'bg-orange-500' : 'bg-gray-300'}`}
          onPress={handleSubmit}
          disabled={!allUploaded || anyUploading || submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : null}
          <Text className="text-white text-lg font-bold">Submit for review</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
