import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList, Alert, Modal, TextInput, ScrollView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Location from 'expo-location';
import { ChevronLeft, MapPin, Star, Trash2, Plus, Home, Briefcase } from 'lucide-react-native';
import {
  useGetAddressesQuery, useAddAddressMutation, useDeleteAddressMutation, useSetDefaultAddressMutation,
} from '../services/api/authApi';
import { getApiErrorMessage } from '../services/api/apiSlice';
import type { SavedAddress } from '../types/api';

const TAG_ICON: Record<string, React.ReactNode> = {
  home: <Home size={14} color="#2563EB" />,
  work: <Briefcase size={14} color="#2563EB" />,
};

export default function AddressesScreen() {
  const router = useRouter();
  // `getAddresses` returns both saved addresses and recent locations; this
  // screen manages the saved ones only.
  const { data: savedLocations, isLoading, refetch } = useGetAddressesQuery();
  const addresses = savedLocations?.addresses ?? [];
  const [addAddress, { isLoading: adding }] = useAddAddressMutation();
  const [deleteAddress] = useDeleteAddressMutation();
  const [setDefaultAddress] = useSetDefaultAddressMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [addressText, setAddressText] = useState('');
  const [locating, setLocating] = useState(false);
  const [pendingLoc, setPendingLoc] = useState<{ lat: number; lng: number } | null>(null);

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Enable location access to use this.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      setPendingLoc({ lat, lng });
      const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (a) setAddressText([a.name, a.street, a.city, a.region].filter(Boolean).join(', '));
    } catch {
      Alert.alert('Location error', 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!pendingLoc || !addressText.trim()) {
      Alert.alert('Missing details', 'Set a location and address first.');
      return;
    }
    try {
      await addAddress({
        label: label.trim() || 'Address',
        address: addressText.trim(),
        lat: pendingLoc.lat,
        lng: pendingLoc.lng,
      }).unwrap();
      setModalOpen(false);
      setLabel(''); setAddressText(''); setPendingLoc(null);
      refetch();
    } catch (e) {
      Alert.alert('Could not save', getApiErrorMessage(e, 'Please try again.'));
    }
  };

  const handleDelete = (addr: SavedAddress) => {
    Alert.alert('Remove address', `Remove "${addr.label || addr.address}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteAddress(addr._id) },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
            <ChevronLeft size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-navy ml-3">Saved addresses</Text>
        </View>
        <TouchableOpacity onPress={() => setModalOpen(true)} className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
          <Plus size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 flex-row items-start gap-3">
              <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center mt-0.5">
                {TAG_ICON[item.tag ?? ''] ?? <MapPin size={14} color="#2563EB" />}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-navy">{item.label || 'Address'}</Text>
                  {item.isDefault ? (
                    <View className="bg-emerald-50 rounded-full px-2 py-0.5">
                      <Text className="text-[10px] font-bold text-emerald-600">DEFAULT</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-xs text-gray-500 mt-1" numberOfLines={2}>{item.address}</Text>
                <View className="flex-row items-center gap-4 mt-2">
                  {!item.isDefault ? (
                    <TouchableOpacity className="flex-row items-center gap-1" onPress={() => setDefaultAddress(item._id)}>
                      <Star size={12} color="#64748B" />
                      <Text className="text-xs font-semibold text-gray-500">Set default</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity className="flex-row items-center gap-1" onPress={() => handleDelete(item)}>
                    <Trash2 size={12} color="#EF4444" />
                    <Text className="text-xs font-semibold text-red-500">Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center mt-20">
              <MapPin size={40} color="#CBD5E1" />
              <Text className="text-gray-400 mt-3">No saved addresses yet</Text>
            </View>
          }
        />
      )}

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <ScrollView className="bg-white rounded-t-3xl p-6" keyboardShouldPersistTaps="handled">
            <Text className="text-lg font-bold text-navy mb-4">Add address</Text>

            <TouchableOpacity
              className="flex-row items-center gap-2 border border-gray-200 rounded-xl p-3 mb-3"
              onPress={useCurrentLocation}
              disabled={locating}
            >
              {locating ? <ActivityIndicator size="small" color="#2563EB" /> : <MapPin size={16} color="#2563EB" />}
              <Text className="text-sm font-semibold text-primary">Use my current location</Text>
            </TouchableOpacity>

            <TextInput
              className="border border-gray-200 rounded-xl p-3 text-sm mb-3"
              placeholder="Label (e.g. Home, Work)"
              value={label}
              onChangeText={setLabel}
            />
            <TextInput
              className="border border-gray-200 rounded-xl p-3 text-sm mb-4"
              placeholder="Full address"
              value={addressText}
              onChangeText={setAddressText}
              multiline
            />

            <TouchableOpacity
              className="bg-primary rounded-xl p-4 items-center flex-row justify-center gap-2"
              onPress={handleSave}
              disabled={adding || !pendingLoc}
            >
              {adding ? <ActivityIndicator color="#fff" /> : null}
              <Text className="text-white font-bold">Save address</Text>
            </TouchableOpacity>
            <TouchableOpacity className="mt-3 items-center mb-2" onPress={() => setModalOpen(false)}>
              <Text className="text-gray-400 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
