import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList, Alert, Modal, TextInput } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ChevronLeft, Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, Plus } from 'lucide-react-native';
import { useGetWalletQuery, useWalletTransactionsQuery, useWalletTopupMutation } from '../services/api/walletApi';
import { openCashfreeCheckout, parseReturnUrl, paymentReturnUrl } from '../services/payments/cashfreeCheckout';
import { useVerifyPaymentMutation } from '../services/api/paymentsApi';
import { getApiErrorMessage } from '../services/api/apiSlice';

const TOPUP_PRESETS = [100, 200, 500, 1000];

export default function WalletScreen() {
  const router = useRouter();
  const { data: wallet, isLoading, refetch: refetchWallet } = useGetWalletQuery();
  const { data: transactions = [], isLoading: txLoading, refetch: refetchTx } = useWalletTransactionsQuery();
  const [walletTopup] = useWalletTopupMutation();
  const [verifyPayment] = useVerifyPaymentMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const doTopup = async (rupees: number) => {
    if (!rupees || rupees < 10) {
      Alert.alert('Minimum top-up', 'The minimum wallet top-up is ₹10.');
      return;
    }
    setProcessing(true);
    try {
      const paymentOrder = await walletTopup({
        amountPaise: Math.round(rupees * 100),
        returnUrl: paymentReturnUrl(),
      }).unwrap();
      const outcome = await openCashfreeCheckout(paymentOrder.paymentSessionId, paymentOrder.cashfreeEnv);
      if (outcome.kind === 'returned') {
        const { cfOrderId, cfPaymentId } = parseReturnUrl(outcome.url);
        if (cfOrderId && cfPaymentId) {
          await verifyPayment({ cfOrderId, cfPaymentId }).unwrap().catch(() => {});
        }
      }
      setModalOpen(false);
      setCustomAmount('');
      refetchWallet();
      refetchTx();
    } catch (e) {
      Alert.alert('Top-up failed', getApiErrorMessage(e, 'Please try again.'));
    } finally {
      setProcessing(false);
    }
  };

  const balance = wallet ? Math.round(wallet.balancePaise / 100) : 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-navy ml-3">Wallet</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : (
        <>
          <View className="mx-5 mt-2 bg-navy rounded-3xl p-6">
            <View className="flex-row items-center gap-2 mb-2">
              <WalletIcon size={16} color="#93C5FD" />
              <Text className="text-blue-200 text-xs font-bold uppercase">Balance</Text>
            </View>
            <Text className="text-white text-4xl font-extrabold">₹{balance.toLocaleString('en-IN')}</Text>
            <TouchableOpacity
              className="bg-white rounded-full px-5 py-2.5 self-start mt-4 flex-row items-center gap-1.5"
              onPress={() => setModalOpen(true)}
            >
              <Plus size={14} color="#0F172A" />
              <Text className="text-navy font-bold text-sm">Add money</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-base font-bold text-navy px-5 mt-6 mb-2">Transactions</Text>
          {txLoading ? (
            <ActivityIndicator color="#2563EB" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={(t) => t._id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
              renderItem={({ item }) => (
                <View className="flex-row items-center justify-between py-3 border-b border-gray-50">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className={`w-9 h-9 rounded-full items-center justify-center ${item.type === 'credit' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      {item.type === 'credit'
                        ? <ArrowDownRight size={16} color="#16A34A" />
                        : <ArrowUpRight size={16} color="#EF4444" />}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-navy" numberOfLines={1}>
                        {item.description || item.reason || (item.type === 'credit' ? 'Credit' : 'Debit')}
                      </Text>
                      <Text className="text-[11px] text-gray-400">
                        {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                  <Text className={`text-sm font-bold ${item.type === 'credit' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {item.type === 'credit' ? '+' : '-'}₹{Math.round(item.amountPaise / 100)}
                  </Text>
                </View>
              )}
              ListEmptyComponent={<Text className="text-gray-400 text-center mt-10">No transactions yet</Text>}
            />
          )}
        </>
      )}

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-lg font-bold text-navy mb-4">Add money to wallet</Text>
            <View className="flex-row flex-wrap gap-3 mb-4">
              {TOPUP_PRESETS.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  className="border border-gray-200 rounded-xl px-5 py-3"
                  onPress={() => doTopup(amt)}
                  disabled={processing}
                >
                  <Text className="font-bold text-navy">₹{amt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row items-center border border-gray-200 rounded-xl px-4 mb-4">
              <Text className="text-gray-400 mr-1">₹</Text>
              <TextInput
                className="flex-1 py-3 text-base"
                placeholder="Custom amount"
                keyboardType="number-pad"
                value={customAmount}
                onChangeText={setCustomAmount}
              />
            </View>
            <TouchableOpacity
              className="bg-primary rounded-xl p-4 items-center flex-row justify-center gap-2"
              onPress={() => doTopup(Number(customAmount))}
              disabled={processing || !customAmount}
            >
              {processing ? <ActivityIndicator color="#fff" /> : null}
              <Text className="text-white font-bold">Proceed to pay</Text>
            </TouchableOpacity>
            <TouchableOpacity className="mt-3 items-center" onPress={() => setModalOpen(false)}>
              <Text className="text-gray-400 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
