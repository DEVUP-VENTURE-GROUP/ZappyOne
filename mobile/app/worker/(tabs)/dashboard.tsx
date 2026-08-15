import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, ScrollView,
  Switch, Alert, Modal, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  MapPin, Zap, ShieldAlert, Clock, Navigation, CheckCircle2, X, MessageSquare, Camera,
} from 'lucide-react-native';
import {
  useGetWorkerMeQuery, useGoOnlineMutation, useGoOfflineMutation,
  useWorkerAcceptMutation, useWorkerRejectMutation, useWorkerStartTripMutation,
  useWorkerArriveMutation, useWorkerStartServiceMutation, useWorkerCompleteMutation,
  useGetWorkerOrdersQuery,
} from '../../../services/api/workerApi';
import { getApiErrorMessage } from '../../../services/api/apiSlice';
import { useSocket } from '../../../hooks/useSocket';
import { useLocationTracker } from '../../../hooks/useLocationTracker';
import { ACTIVE_ORDER_STATUSES } from '../../../types/api';
import type { JobOffer } from '../../../types/api';
import type { OfferCancelledEvent, JobAssignedEvent, OfferBoostedEvent, KycRejectedEvent } from '../../../services/socket/events';

const KYC_MESSAGE: Record<string, { title: string; body: string; canRetry: boolean }> = {
  not_submitted: { title: 'Complete your KYC', body: 'Submit your documents to start receiving jobs.', canRetry: true },
  pending_review: { title: 'KYC under review', body: "We're verifying your documents — usually takes under 24 hours.", canRetry: false },
  rejected: { title: 'KYC needs attention', body: 'Your documents were rejected. Please resubmit.', canRetry: true },
  suspended: { title: 'Account suspended', body: 'Contact support to resolve this.', canRetry: false },
};

export default function WorkerDashboardScreen() {
  const router = useRouter();
  const { data: worker, isLoading, refetch: refetchWorker } = useGetWorkerMeQuery();
  const { data: ordersPage, refetch: refetchOrders } = useGetWorkerOrdersQuery(1);
  const [goOnline, { isLoading: goingOnline }] = useGoOnlineMutation();
  const [goOffline, { isLoading: goingOffline }] = useGoOfflineMutation();
  const [workerAccept, { isLoading: accepting }] = useWorkerAcceptMutation();
  const [workerReject] = useWorkerRejectMutation();
  const [workerStartTrip, { isLoading: startingTrip }] = useWorkerStartTripMutation();
  const [workerArrive, { isLoading: arriving }] = useWorkerArriveMutation();
  const [workerStartService, { isLoading: startingService }] = useWorkerStartServiceMutation();
  const [workerComplete, { isLoading: completing }] = useWorkerCompleteMutation();

  const [offer, setOffer] = useState<JobOffer | null>(null);
  const [offerSecondsLeft, setOfferSecondsLeft] = useState(0);
  const [otpInput, setOtpInput] = useState('');
  const [otpModalOpen, setOtpModalOpen] = useState(false);

  const socketClient = useSocket();
  const kycStatus = worker?.kyc?.status ?? 'not_submitted';
  const kycApproved = kycStatus === 'approved';
  const isOnline = worker?.isOnline ?? false;

  const activeOrder = useMemo(
    () => (ordersPage?.orders ?? []).find((o) => (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status)),
    [ordersPage],
  );

  // Live GPS while online — the socket client picks this up via
  // 'worker:location', which dispatch/tracking consume server-side.
  useLocationTracker(isOnline, activeOrder?._id);

  // ── Incoming offers + force-assignment + boosts + KYC push ──────────────
  useEffect(() => {
    const onOffer = (payload: JobOffer) => setOffer(payload);
    const onOfferCancelled = (payload: OfferCancelledEvent) => {
      setOffer((cur) => (cur?._id === payload.orderId ? null : cur));
    };
    const onJobAssigned = (_payload: JobAssignedEvent) => {
      setOffer(null);
      refetchOrders();
    };
    const onOfferBoosted = (payload: OfferBoostedEvent) => {
      setOffer((cur) => (cur && cur._id === payload.orderId ? { ...cur, price: payload.newTotal } : cur));
    };
    const onKycRejected = (payload: KycRejectedEvent) => {
      refetchWorker();
      Alert.alert('KYC rejected', payload.reason || 'Please check your KYC status.');
    };
    const onJobPulled = () => refetchOrders();

    socketClient.on('new_job_request', onOffer);
    socketClient.on('offer.cancelled', onOfferCancelled);
    socketClient.on('job.assigned', onJobAssigned);
    socketClient.on('offer.boosted', onOfferBoosted);
    socketClient.on('kyc.rejected', onKycRejected);
    socketClient.on('job.pulled', onJobPulled);
    socketClient.on('order.status', () => refetchOrders());

    return () => {
      socketClient.off('new_job_request', onOffer);
      socketClient.off('offer.cancelled', onOfferCancelled);
      socketClient.off('job.assigned', onJobAssigned);
      socketClient.off('offer.boosted', onOfferBoosted);
      socketClient.off('kyc.rejected', onKycRejected);
      socketClient.off('job.pulled', onJobPulled);
    };
  }, [socketClient, refetchOrders, refetchWorker]);

  // Countdown on the visible offer.
  useEffect(() => {
    if (!offer) { setOfferSecondsLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
      setOfferSecondsLeft(left);
      if (left <= 0) setOffer(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer]);

  const toggleOnline = async (next: boolean) => {
    if (!kycApproved) {
      Alert.alert('KYC required', 'Complete KYC verification before going online.');
      return;
    }
    if (!next) {
      try { await goOffline().unwrap(); } catch (e) { Alert.alert('Failed', getApiErrorMessage(e)); }
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Enable location access to go online.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await goOnline({ lat: pos.coords.latitude, lng: pos.coords.longitude }).unwrap();
    } catch (e) {
      Alert.alert('Could not go online', getApiErrorMessage(e, 'Please try again.'));
    }
  };

  const handleAccept = async () => {
    if (!offer) return;
    // Accepting only PUBLISHES an accept signal — the dispatch worker holds the
    // real atomic lock and decides who actually wins if several workers tapped
    // Accept at once (order.service.js's acceptOffer). A 200 here means the
    // signal was sent, not that this worker won the job; the real outcome
    // arrives moments later via 'job.assigned'/'offer.cancelled' or simply by
    // the job appearing (or not) in the next getWorkerOrders refetch.
    setOffer(null);
    try {
      await workerAccept(offer._id).unwrap();
      refetchOrders();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status !== 410 && status !== 404) {
        Alert.alert('Could not accept', getApiErrorMessage(e, 'This job may have been taken.'));
      }
    }
  };

  const handleReject = async () => {
    if (!offer) return;
    const id = offer._id;
    setOffer(null);
    workerReject(id).catch(() => {});
  };

  const handleStartTrip = async () => {
    if (!activeOrder) return;
    try {
      let coords: { lat: number; lng: number } | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch { /* server falls back to last known Redis ping */ }
      await workerStartTrip({ id: activeOrder._id, ...coords }).unwrap();
    } catch (e) { Alert.alert('Failed', getApiErrorMessage(e)); }
  };

  const handleArrive = async () => {
    if (!activeOrder) return;
    try {
      let coords: { lat: number; lng: number } | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch { /* fallback handled server-side */ }
      await workerArrive({ id: activeOrder._id, ...coords }).unwrap();
    } catch (e) { Alert.alert('Failed', getApiErrorMessage(e)); }
  };

  const handleStartService = async () => {
    if (!activeOrder || otpInput.length < 4) return;
    try {
      await workerStartService({ id: activeOrder._id, otp: otpInput }).unwrap();
      setOtpModalOpen(false);
      setOtpInput('');
    } catch (e) {
      Alert.alert('Incorrect OTP', getApiErrorMessage(e, 'Ask the customer for the correct code.'));
    }
  };

  const handleComplete = async () => {
    if (!activeOrder) return;
    Alert.alert('Complete service', 'Mark this job as complete?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete', onPress: async () => {
          try {
            await workerComplete({ id: activeOrder._id }).unwrap();
            refetchOrders();
          } catch (e) { Alert.alert('Failed', getApiErrorMessage(e)); }
        },
      },
    ]);
  };

  if (isLoading || !worker) {
    return <SafeAreaView className="flex-1 bg-navy items-center justify-center"><ActivityIndicator color="#F97316" /></SafeAreaView>;
  }

  const kycMsg = KYC_MESSAGE[kycStatus];

  return (
    <SafeAreaView className="flex-1 bg-lightBg">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View className="bg-navy px-5 pt-6 pb-8 rounded-b-3xl">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-slate-400 text-sm">Hey,</Text>
              <Text className="text-white text-2xl font-bold">{worker.name}</Text>
            </View>
            <View className="items-end">
              <Text className={`text-xs font-bold uppercase mb-1 ${isOnline ? 'text-emerald-400' : 'text-slate-400'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
              <Switch
                value={isOnline}
                onValueChange={toggleOnline}
                disabled={goingOnline || goingOffline || !kycApproved}
                trackColor={{ false: '#334155', true: '#16A34A' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View className="flex-row gap-4 mt-6">
            <View className="flex-1 bg-white/10 rounded-2xl p-3">
              <Text className="text-slate-300 text-[11px] font-bold uppercase">Rating</Text>
              <Text className="text-white text-xl font-extrabold mt-0.5">{worker.rating?.toFixed(1) ?? '5.0'}</Text>
            </View>
            <View className="flex-1 bg-white/10 rounded-2xl p-3">
              <Text className="text-slate-300 text-[11px] font-bold uppercase">Completed</Text>
              <Text className="text-white text-xl font-extrabold mt-0.5">{worker.completedJobs}</Text>
            </View>
          </View>
        </View>

        {/* KYC banner */}
        {!kycApproved ? (
          <TouchableOpacity
            className="mx-5 -mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex-row items-center gap-3"
            onPress={() => kycMsg.canRetry && router.push('/worker/kyc' as never)}
          >
            <ShieldAlert size={20} color="#B45309" />
            <View className="flex-1">
              <Text className="text-sm font-bold text-amber-800">{kycMsg.title}</Text>
              <Text className="text-xs text-amber-700 mt-0.5">{kycMsg.body}</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Active job */}
        {activeOrder ? (
          <View className="mx-5 mt-5 bg-white rounded-3xl border border-gray-100 p-5">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-lg font-bold text-navy capitalize">{String(activeOrder.service).replace(/_/g, ' ')}</Text>
              <Text className="text-primary font-bold">₹{activeOrder.pricing?.total ?? '—'}</Text>
            </View>
            <View className="flex-row items-start gap-2 mt-2">
              <MapPin size={14} color="#64748B" style={{ marginTop: 2 }} />
              <Text className="text-sm text-gray-500 flex-1">{activeOrder.pickupLocation?.address}</Text>
            </View>

            <View className="flex-row items-center gap-3 mt-4">
              <TouchableOpacity
                className="flex-1 flex-row items-center justify-center gap-2 border border-gray-200 rounded-xl p-3"
                onPress={() => router.push(`/chat/${activeOrder._id}` as never)}
              >
                <MessageSquare size={16} color="#2563EB" /><Text className="font-semibold text-navy">Chat</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-3">
              {activeOrder.status === 'assigned' ? (
                <TouchableOpacity className="bg-orange-500 rounded-xl p-4 items-center flex-row justify-center gap-2" onPress={handleStartTrip} disabled={startingTrip}>
                  {startingTrip ? <ActivityIndicator color="#fff" /> : <Navigation size={16} color="#fff" />}
                  <Text className="text-white font-bold">Start trip</Text>
                </TouchableOpacity>
              ) : activeOrder.status === 'on_the_way' ? (
                <TouchableOpacity className="bg-orange-500 rounded-xl p-4 items-center flex-row justify-center gap-2" onPress={handleArrive} disabled={arriving}>
                  {arriving ? <ActivityIndicator color="#fff" /> : <MapPin size={16} color="#fff" />}
                  <Text className="text-white font-bold">I've arrived</Text>
                </TouchableOpacity>
              ) : activeOrder.status === 'arrived' ? (
                <TouchableOpacity className="bg-orange-500 rounded-xl p-4 items-center flex-row justify-center gap-2" onPress={() => setOtpModalOpen(true)}>
                  <CheckCircle2 size={16} color="#fff" />
                  <Text className="text-white font-bold">Start service (enter OTP)</Text>
                </TouchableOpacity>
              ) : activeOrder.status === 'in_progress' ? (
                <TouchableOpacity className="bg-emerald-600 rounded-xl p-4 items-center flex-row justify-center gap-2" onPress={handleComplete} disabled={completing}>
                  {completing ? <ActivityIndicator color="#fff" /> : <Camera size={16} color="#fff" />}
                  <Text className="text-white font-bold">Mark complete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : isOnline ? (
          <View className="mx-5 mt-8 items-center py-10">
            <View className="w-16 h-16 rounded-full bg-orange-50 items-center justify-center mb-3">
              <Zap size={26} color="#F97316" />
            </View>
            <Text className="text-navy font-bold text-base">Waiting for jobs…</Text>
            <Text className="text-gray-400 text-sm mt-1">We'll alert you the moment one comes in</Text>
          </View>
        ) : (
          <View className="mx-5 mt-8 items-center py-10">
            <Text className="text-gray-400 text-sm">Go online to start receiving jobs</Text>
          </View>
        )}
      </ScrollView>

      {/* Incoming offer modal */}
      <Modal visible={!!offer} transparent animationType="slide">
        {offer ? (
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white rounded-t-3xl p-6">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-2">
                  <Clock size={16} color="#F97316" />
                  <Text className="text-sm font-bold text-orange-600">New job · {offerSecondsLeft}s</Text>
                </View>
                <TouchableOpacity onPress={handleReject}><X size={20} color="#94A3B8" /></TouchableOpacity>
              </View>

              <Text className="text-xl font-bold text-navy capitalize">{offer.service.replace(/_/g, ' ')}</Text>
              <View className="flex-row items-start gap-2 mt-2">
                <MapPin size={14} color="#64748B" style={{ marginTop: 2 }} />
                <Text className="text-sm text-gray-500 flex-1">{offer.pickupAddress}</Text>
              </View>
              {offer.distanceKm ? <Text className="text-xs text-gray-400 mt-1">{offer.distanceKm} km away</Text> : null}
              {offer.description ? <Text className="text-sm text-gray-600 mt-2">{offer.description}</Text> : null}

              <View className="bg-orange-50 rounded-2xl p-4 mt-4 flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-orange-700">You'll earn</Text>
                <Text className="text-2xl font-extrabold text-orange-700">₹{Math.round(offer.price)}</Text>
              </View>

              <View className="flex-row gap-3 mt-4">
                <TouchableOpacity className="flex-1 border border-gray-200 rounded-xl p-4 items-center" onPress={handleReject}>
                  <Text className="font-bold text-gray-500">Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-orange-500 rounded-xl p-4 items-center flex-row justify-center gap-2" onPress={handleAccept} disabled={accepting}>
                  {accepting ? <ActivityIndicator color="#fff" /> : null}
                  <Text className="font-bold text-white">Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>

      {/* Start-service OTP modal */}
      <Modal visible={otpModalOpen} transparent animationType="fade" onRequestClose={() => setOtpModalOpen(false)}>
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full">
            <Text className="text-lg font-bold text-navy mb-1">Enter start OTP</Text>
            <Text className="text-sm text-gray-500 mb-4">Ask the customer for the 4-6 digit code to begin the service.</Text>
            <TextInput
              className="border border-gray-200 rounded-xl p-4 text-2xl text-center tracking-[10px] mb-4"
              placeholder="••••"
              keyboardType="number-pad"
              maxLength={6}
              value={otpInput}
              onChangeText={(t) => setOtpInput(t.replace(/\D/g, ''))}
              autoFocus
            />
            <TouchableOpacity
              className={`rounded-xl p-4 items-center flex-row justify-center gap-2 ${otpInput.length >= 4 ? 'bg-orange-500' : 'bg-gray-300'}`}
              onPress={handleStartService}
              disabled={otpInput.length < 4 || startingService}
            >
              {startingService ? <ActivityIndicator color="#fff" /> : null}
              <Text className="text-white font-bold">Confirm & start</Text>
            </TouchableOpacity>
            <TouchableOpacity className="mt-3 items-center" onPress={() => { setOtpModalOpen(false); setOtpInput(''); }}>
              <Text className="text-gray-400 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
