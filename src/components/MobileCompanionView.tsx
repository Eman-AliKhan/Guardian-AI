import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  BatteryLow,
  Bluetooth,
  Calculator,
  CheckCircle2,
  EyeOff,
  Flame,
  HeartPulse,
  Languages,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  PhoneIncoming,
  PhoneOff,
  Plus,
  Radio,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
  Watch,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { PAKISTAN_CITY_HUBS } from '../data/pakistanSeed';
import { MOBILE_TRANSLATIONS } from '../i18n/translations';
import { PWAInstallButton } from './PWAInstallButton';
import type {
  CitizenProfile,
  CommunityReport,
  EmergencyAgency,
  GuardianStateSnapshot,
  Incident,
  IncidentTrigger,
  LanguageCode,
  OfflineQueuedSOS,
  TrustedContact,
} from '../types/guardian';

interface MobileCompanionViewProps {
  state: GuardianStateSnapshot;
  isOffline: boolean;
  onToggleOffline: () => void;
  offlineQueue: OfflineQueuedSOS[];
  onTriggerSos: (payload: {
    trigger: IncidentTrigger;
    silentMode: boolean;
    lat: number;
    lng: number;
    city: string;
    area?: string;
    street?: string;
    fullAddress?: string;
    areaLabel: string;
    transcriptOrAudioNote?: string;
    agencyOverride?: EmergencyAgency;
    batteryPercent: number;
  }) => Promise<Incident | null>;
  onUploadEvidence: (incidentId: string, type: 'audio' | 'photo' | 'video', note: string) => Promise<void>;
  onUpdateProfile: (profile: Partial<CitizenProfile>) => Promise<void>;
  onSubmitCommunityReport: (report: {
    category: CommunityReport['category'];
    city: string;
    area: string;
    street: string;
    fullAddress: string;
    areaLabel: string;
    lat: number;
    lng: number;
    description: string;
    anonymous: boolean;
    shareProfileWithTeam: boolean;
  }) => Promise<CommunityReport>;
  onContactAck: (incidentId: string, contactId: string, contactName: string) => Promise<void>;
  onPingLocation: (incidentId: string, lat: number, lng: number, batteryPercent: number) => Promise<void>;
}

export const MobileCompanionView: React.FC<MobileCompanionViewProps> = ({
  state,
  isOffline,
  onToggleOffline,
  offlineQueue,
  onTriggerSos,
  onUploadEvidence,
  onUpdateProfile,
  onSubmitCommunityReport,
  onContactAck,
  onPingLocation,
}) => {
  const [phoneTab, setPhoneTab] = useState<'sos' | 'audio' | 'journey' | 'report' | 'account'>('sos');
  const [lang, setLang] = useState<LanguageCode>(state.citizenProfile.language || 'en');
  const [largeButtons, setLargeButtons] = useState(false);
  const [voiceGuidance, setVoiceGuidance] = useState(false);
  const [silentMode, setSilentMode] = useState(state.citizenProfile.silentSosDefault);
  const [quickExitMode, setQuickExitMode] = useState(false);
  const [fakeCallActive, setFakeCallActive] = useState(false);
  const [fakeCallAnswered, setFakeCallAnswered] = useState(false);

  // SOS 3-second cancel window
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const sosTimerRef = useRef<number | null>(null);

  // Travel Audio & 3-Prompt Confirmation
  const [audioGuardEnabled, setAudioGuardEnabled] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [threePromptStage, setThreePromptStage] = useState<number>(0); // 0 = idle, 1..3 = alert count
  const [pendingDistressReason, setPendingDistressReason] = useState<string>('');
  const threePromptTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Journey state
  const [journeyActive, setJourneyActive] = useState(false);
  const [journeyDestination, setJourneyDestination] = useState('Model Town Link Road, Lahore');
  const [citizenCoords, setCitizenCoords] = useState(() => {
    const hub = PAKISTAN_CITY_HUBS[state.citizenProfile.city] || PAKISTAN_CITY_HUBS.Lahore;
    return { lat: hub.lat, lng: hub.lng };
  });
  const [batteryPercent, setBatteryPercent] = useState(state.citizenProfile.batteryPercent || 78);

  // Wearable state
  const [heartRate, setHeartRate] = useState(76);
  const [wearableConnected, setWearableConnected] = useState(true);

  // Phone OTP & Profile edit state
  const [otpPhone, setOtpPhone] = useState(state.citizenProfile.phone);
  const [otpCode, setOtpCode] = useState('');
  const [otpSentBanner, setOtpSentBanner] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRelation, setNewContactRelation] = useState('Family');

  // Community / Assault / Household Report Form
  const [reportCategory, setReportCategory] = useState<CommunityReport['category']>('assault');
  const [reportArea, setReportArea] = useState(state.citizenProfile.area || 'Gulberg III');
  const [reportStreet, setReportStreet] = useState(state.citizenProfile.street || 'Main Boulevard, Street 14');
  const [reportDesc, setReportDesc] = useState('');
  const [reportAnon, setReportAnon] = useState(false);
  const [shareProfileWithTeam, setShareProfileWithTeam] = useState(true);
  const [reportStatusMsg, setReportStatusMsg] = useState<string | null>(null);

  // Last created incident by this phone
  const [lastIncidentId, setLastIncidentId] = useState<string | null>(null);
  const lastIncident =
    state.incidents.find((i) => i.id === lastIncidentId) ||
    state.incidents.find((i) => i.citizenId === state.citizenProfile.id) ||
    null;

  const t = MOBILE_TRANSLATIONS[lang];

  const speak = (text: string) => {
    if (!voiceGuidance || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === 'ur' ? 'ur-PK' : lang === 'ps' ? 'ps-AF' : 'en-US';
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore synthesis unavailability
    }
  };

  // Cleanup timers & mic on unmount
  useEffect(() => {
    return () => {
      if (sosTimerRef.current) window.clearInterval(sosTimerRef.current);
      if (threePromptTimerRef.current) window.clearTimeout(threePromptTimerRef.current);
      stopMicrophoneMonitor();
    };
  }, []);

  const stopMicrophoneMonitor = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  };

  const toggleAudioGuard = async () => {
    if (audioGuardEnabled) {
      setAudioGuardEnabled(false);
      stopMicrophoneMonitor();
      return;
    }

    setAudioGuardEnabled(true);
    speak(t.voicePromptAudioOn);

    // Attempt real browser microphone level monitoring if available
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!streamRef.current) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = Math.min(100, Math.round((sum / data.length / 128) * 100));
          setMicLevel(avg);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    } catch {
      // Graceful fallback when microphone permission isn't granted in browser sandbox
      setMicLevel(22);
    }
  };

  // Trigger 3-Prompt Confirmation ("click u r not in emergency 3 times, else auto-inform main system")
  const startThreePromptVerification = async (reason: string, soundEvent?: string) => {
    setPendingDistressReason(reason);
    setThreePromptStage(1);
    speak(t.voicePromptThreeCheck);

    // Optional AI audio phrase verification
    try {
      await fetch('/api/ai/analyze-audio-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: reason, soundEvent }),
      });
    } catch {
      // Reliability-first: local safety verification continues regardless of AI endpoint
    }
  };

  useEffect(() => {
    if (threePromptStage === 0) return;

    if (threePromptStage <= 3) {
      threePromptTimerRef.current = window.setTimeout(() => {
        if (threePromptStage < 3) {
          setThreePromptStage((prev) => prev + 1);
          speak(t.voicePromptThreeCheck);
        } else {
          // 3 prompts unconfirmed -> auto-escalate to main control room & nearest station
          setThreePromptStage(0);
          dispatchSos('audio_distress', `Auto-escalated after 3 unanswered safety prompts: ${pendingDistressReason}`);
        }
      }, 3200);
    }

    return () => {
      if (threePromptTimerRef.current) window.clearTimeout(threePromptTimerRef.current);
    };
  }, [threePromptStage]);

  const confirmSafeFromPrompt = () => {
    if (threePromptTimerRef.current) window.clearTimeout(threePromptTimerRef.current);
    setThreePromptStage(0);
    setPendingDistressReason('');
  };

  const dispatchSos = async (
    trigger: IncidentTrigger,
    note?: string,
    agencyOverride?: EmergencyAgency
  ) => {
    const city = state.citizenProfile.city || 'Lahore';
    const created = await onTriggerSos({
      trigger,
      silentMode,
      lat: citizenCoords.lat,
      lng: citizenCoords.lng,
      city,
      area: state.citizenProfile.area,
      street: state.citizenProfile.street,
      fullAddress: state.citizenProfile.fullAddress,
      areaLabel: `${state.citizenProfile.street}, ${state.citizenProfile.area}`,
      transcriptOrAudioNote: note,
      agencyOverride,
      batteryPercent,
    });
    if (created) {
      setLastIncidentId(created.id);
    }
    if (!silentMode) {
      speak(t.voicePromptSosSent);
    }
  };

  const initiateSosCountdown = () => {
    if (sosCountdown !== null) return;
    let remaining = state.citizenProfile.cancelWindowSeconds || 3;
    setSosCountdown(remaining);
    sosTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (sosTimerRef.current) window.clearInterval(sosTimerRef.current);
        setSosCountdown(null);
        dispatchSos(silentMode ? 'silent_sos' : 'sos_button', silentMode ? 'Silent SOS activated from mobile app' : 'Primary SOS panic button triggered');
      } else {
        setSosCountdown(remaining);
      }
    }, 1000);
  };

  const cancelSosCountdown = () => {
    if (sosTimerRef.current) window.clearInterval(sosTimerRef.current);
    setSosCountdown(null);
  };

  const sendSosImmediately = () => {
    if (sosTimerRef.current) window.clearInterval(sosTimerRef.current);
    setSosCountdown(null);
    dispatchSos(silentMode ? 'silent_sos' : 'sos_button', 'Immediate SOS override (cancel window bypassed)');
  };

  const handleSendOtp = async () => {
    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: otpPhone }),
    });
    const data = await res.json();
    if (res.ok) {
      setOtpSentBanner(`OTP dispatched via SMS gateway (Test code: ${data.demoOtp})`);
    }
  };

  const handleVerifyOtp = async () => {
    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: otpPhone, otp: otpCode }),
    });
    if (res.ok) {
      setOtpSentBanner('Phone verified & session secured.');
      setOtpCode('');
    } else {
      setOtpSentBanner('Invalid OTP — enter 4829 to verify.');
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    const nextPriority = Math.min(3, state.citizenProfile.contacts.length + 1) as 1 | 2 | 3;
    const newContact: TrustedContact = {
      id: `tc-${Date.now()}`,
      name: newContactName.trim(),
      relation: newContactRelation,
      phone: newContactPhone.trim(),
      priority: nextPriority,
      canViewMedical: true,
    };
    await onUpdateProfile({ contacts: [...state.citizenProfile.contacts, newContact] });
    setNewContactName('');
    setNewContactPhone('');
  };

  const handleRemoveContact = async (id: string) => {
    await onUpdateProfile({
      contacts: state.citizenProfile.contacts.filter((c) => c.id !== id),
    });
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDesc.trim()) return;
    const created = await onSubmitCommunityReport({
      category: reportCategory,
      city: state.citizenProfile.city,
      area: reportArea.trim() || state.citizenProfile.area,
      street: reportStreet.trim() || state.citizenProfile.street,
      fullAddress: state.citizenProfile.fullAddress,
      areaLabel: `${reportStreet.trim() || state.citizenProfile.street}, ${reportArea.trim() || state.citizenProfile.area}`,
      lat: citizenCoords.lat + (Math.random() - 0.5) * 0.01,
      lng: citizenCoords.lng + (Math.random() - 0.5) * 0.01,
      description: reportDesc.trim(),
      anonymous: reportAnon,
      shareProfileWithTeam,
    });
    setReportDesc('');
    setReportStatusMsg(
      created.routedStationName
        ? `Report ${created.id} sent to GuardAI Team & routed to ${created.routedStationName}.`
        : `Report ${created.id} sent to GuardAI Working Team for assistance.`
    );
  };

  const simulateMoveAndPing = async (deviation: boolean) => {
    const nextLat = Number((citizenCoords.lat + (deviation ? 0.0085 : 0.0021)).toFixed(6));
    const nextLng = Number((citizenCoords.lng + (deviation ? -0.0092 : 0.0018)).toFixed(6));
    setCitizenCoords({ lat: nextLat, lng: nextLng });

    if (deviation) {
      await dispatchSos(
        'route_deviation',
        `Monitored journey deviated 1.4km from expected corridor toward ${journeyDestination}.`
      );
    } else if (lastIncident && lastIncident.status !== 'resolved') {
      await onPingLocation(lastIncident.id, nextLat, nextLng, batteryPercent);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
      {/* Left: Interactive Citizen Smartphone Simulator (390px ergonomic touch layout) */}
      <div className="xl:col-span-5 flex justify-center">
        <div
          dir={t.dir}
          className="w-full max-w-[410px] border-2 border-slate-900 dark:border-slate-700 rounded-[2rem] bg-white dark:bg-slate-950 overflow-hidden shadow-lg flex flex-col min-h-[760px] relative"
        >
          {/* Quick-Exit Decoy Screen */}
          {quickExitMode ? (
            <div className="flex-1 flex flex-col justify-between p-6 bg-slate-50 dark:bg-slate-950">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold">
                    <Calculator className="w-5 h-5" />
                    <span>Daily Utility &amp; Weather</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickExitMode(false)}
                    onDoubleClick={() => setQuickExitMode(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Hold/Tap to return
                  </button>
                </div>
                <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                  <div className="text-xs text-slate-500">{state.citizenProfile.city} Forecast</div>
                  <div className="text-3xl font-bold mt-1 font-mono tabular-nums">26°C · Clear</div>
                  <div className="text-xs text-slate-500 mt-1">Humidity 42% · Wind 9 km/h NW</div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center font-mono text-sm">
                  {['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '=', '+'].map(
                    (key) => (
                      <div
                        key={key}
                        className="py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-semibold"
                      >
                        {key}
                      </div>
                    )
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickExitMode(false)}
                className="w-full py-3 text-xs font-medium text-slate-500 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer"
              >
                Restore Guardian AI Screen (Active alerts continue safely)
              </button>
            </div>
          ) : (
            <>
              {/* Fake Incoming Call Overlay */}
              {fakeCallActive && (
                <div className="absolute inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between p-8">
                  <div className="text-center mt-10 space-y-2">
                    <div className="text-xs text-emerald-400 font-medium">Incoming Mobile Call</div>
                    <div className="text-3xl font-bold">Ammi (Home)</div>
                    <div className="text-sm text-slate-400 font-mono">+92 300 4120001</div>
                    {fakeCallAnswered && (
                      <div className="mt-4 text-xs text-emerald-300 font-mono tabular-nums">
                        Connected · 00:14 — &ldquo;Beta, I am right outside the gate now.&rdquo;
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-around pb-8">
                    <button
                      type="button"
                      onClick={() => {
                        setFakeCallActive(false);
                        setFakeCallAnswered(false);
                      }}
                      className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center cursor-pointer"
                      aria-label="Decline call"
                    >
                      <PhoneOff className="w-7 h-7" />
                    </button>
                    {!fakeCallAnswered && (
                      <button
                        type="button"
                        onClick={() => setFakeCallAnswered(true)}
                        className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center cursor-pointer"
                        aria-label="Answer call"
                      >
                        <PhoneIncoming className="w-7 h-7" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 3-Prompt Audio Safety Confirmation Overlay */}
              {threePromptStage > 0 && (
                <div className="absolute inset-0 z-40 bg-red-950/95 text-white flex flex-col justify-between p-6">
                  <div className="space-y-3 mt-4">
                    <div className="text-xs font-mono font-bold text-red-200">
                      SAFETY CHECK PROMPT {threePromptStage} OF 3
                    </div>
                    <h3 className="text-2xl font-bold leading-tight">{t.audioPromptTitle}</h3>
                    <p className="text-sm text-red-100 leading-relaxed">{t.audioPromptBody}</p>
                    <div className="p-3 bg-black/30 rounded-xl text-xs font-mono text-red-200">
                      Detected: {pendingDistressReason}
                    </div>
                  </div>
                  <div className="space-y-3 pb-4">
                    <button
                      type="button"
                      onClick={confirmSafeFromPrompt}
                      className="w-full min-h-[56px] rounded-xl bg-white text-slate-900 font-bold text-base cursor-pointer"
                    >
                      {t.imSafeBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setThreePromptStage(0);
                        dispatchSos('audio_distress', `User confirmed emergency during check ${threePromptStage}: ${pendingDistressReason}`);
                      }}
                      className="w-full min-h-[48px] rounded-xl bg-red-600 text-white font-semibold text-sm border border-red-400 cursor-pointer"
                    >
                      {t.needHelpBtn}
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile Top App Bar */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {t.appTitle}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {state.citizenProfile.city} · {isOffline ? t.offlineLabel : t.onlineLabel}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setVoiceGuidance((v) => !v)}
                    title="Voice guidance"
                    className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border text-xs cursor-pointer ${
                      voiceGuidance
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {voiceGuidance ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickExitMode(true)}
                    className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    {t.quickExit}
                  </button>
                </div>
              </div>

              {/* Language & Accessibility Micro Strip */}
              <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1">
                  {(['en', 'ur', 'ps'] as LanguageCode[]).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLang(code)}
                      className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                        lang === code
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {code === 'en' ? 'EN' : code === 'ur' ? 'اردو' : 'پښتو'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setLargeButtons((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border cursor-pointer ${
                    largeButtons
                      ? 'border-slate-900 bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {largeButtons ? 'Large UI: ON' : 'Large UI'}
                </button>
              </div>

              {/* Scrollable Mobile Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Explicit Offline vs Received Status Banner */}
                {offlineQueue.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                    <strong>{t.queuedOnPhone}</strong> ({offlineQueue.length} pending SMS/data packet)
                  </div>
                )}
                {offlineQueue.length === 0 && lastIncident && lastIncident.status !== 'resolved' && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
                    <span>
                      <strong>{t.receivedByTeam}</strong> ({lastIncident.id})
                    </span>
                    <span className="font-mono text-[11px]">{lastIncident.status.replace('_', ' ')}</span>
                  </div>
                )}

                {phoneTab === 'sos' && (
                  <div className="space-y-4">
                    {/* SOS Countdown / Primary Panic Button */}
                    {sosCountdown !== null ? (
                      <div className="p-5 rounded-2xl bg-red-600 text-white text-center space-y-3">
                        <div className="text-xs font-medium">Sending Emergency Alert in</div>
                        <div className="text-5xl font-bold font-mono tabular-nums">{sosCountdown}</div>
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <button
                            type="button"
                            onClick={cancelSosCountdown}
                            className="min-h-[48px] rounded-xl bg-white text-slate-900 font-semibold text-xs cursor-pointer"
                          >
                            {t.cancelSos}
                          </button>
                          <button
                            type="button"
                            onClick={sendSosImmediately}
                            className="min-h-[48px] rounded-xl bg-red-900 text-white font-semibold text-xs border border-red-400 cursor-pointer"
                          >
                            {t.sendNow}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={initiateSosCountdown}
                        className={`w-full ${
                          largeButtons ? 'min-h-[168px]' : 'min-h-[136px]'
                        } rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white flex flex-col items-center justify-center gap-1.5 shadow-md transition-transform cursor-pointer px-4`}
                      >
                        <AlertOctagon className="w-10 h-10" />
                        <span className="text-xl font-extrabold tracking-tight">{t.sosButton}</span>
                        <span className="text-xs text-red-100">{t.sosSub}</span>
                      </button>
                    )}

                    {/* Silent Mode & Power Shortcut */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setSilentMode((v) => !v)}
                        className={`min-h-[52px] px-3 py-2 rounded-xl border text-xs font-medium text-left flex items-center justify-between cursor-pointer ${
                          silentMode
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span>{t.silentSos}</span>
                        <span className="font-mono text-[11px]">{silentMode ? 'ON' : 'OFF'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFakeCallActive(true)}
                        className="min-h-[52px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                      >
                        <span>{t.fakeCall}</span>
                        <PhoneIncoming className="w-4 h-4 text-emerald-600" />
                      </button>
                    </div>

                    {/* Hardware Shortcut & Wearable Panic */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5">
                          <Watch className="w-4 h-4 text-slate-500" />
                          Shortcuts &amp; Wearables
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          HR {heartRate} bpm · {wearableConnected ? 'BT Linked' : 'Disconnected'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            dispatchSos(
                              'silent_sos',
                              'Power-button 3x discreet hardware shortcut pressed',
                              'police'
                            )
                          }
                          className="min-h-[44px] px-2.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Power Button ×3
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeartRate(142);
                            startThreePromptVerification(
                              'Wearable fall/impact (3.4G) + elevated HR 142 bpm',
                              'impact_fall'
                            );
                          }}
                          className="min-h-[44px] px-2.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Simulate Fall / BT Panic
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Wearable limitation: heart-rate anomalies are supplementary alerts and cannot diagnose medical events.
                      </p>
                    </div>

                    {/* Consent-based Evidence Upload */}
                    {lastIncident && (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Consent-Based Evidence Upload ({lastIncident.id})
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onUploadEvidence(
                                lastIncident.id,
                                'audio',
                                'User-authorized encrypted audio clip from scene'
                              )
                            }
                            className="flex-1 min-h-[44px] px-3 py-2 text-xs font-medium rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            Upload Geotagged Audio
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {phoneTab === 'audio' && (
                  <div className="space-y-4">
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            {t.audioGuardTitle}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {audioGuardEnabled ? t.audioGuardOn : t.audioGuardOff}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={toggleAudioGuard}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer ${
                            audioGuardEnabled
                              ? 'bg-emerald-700 text-white'
                              : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          }`}
                        >
                          {audioGuardEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                          {audioGuardEnabled ? 'Enabled' : 'Enable'}
                        </button>
                      </div>

                      {/* Acoustic Level Meter */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-slate-500">
                          <span>Ambient Acoustic Level</span>
                          <span className="tabular-nums">{audioGuardEnabled ? `${micLevel} dB` : 'Paused'}</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-150 ${
                              micLevel > 70 ? 'bg-red-600' : 'bg-emerald-600'
                            }`}
                            style={{ width: `${audioGuardEnabled ? micLevel : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Acoustic & Phrase Triggers (Tests 3-Prompt Auto Escalation) */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Test Distress Sound &amp; Voice Detection (Triggers 3 Safety Checks)
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          {
                            label: 'Phrase: "Help me / Mujhe bachao / Leave me"',
                            reason: 'Distress phrase detected ("Help me / Mujhe bachao")',
                            event: 'distress_phrase',
                          },
                          {
                            label: 'Acoustic: Loud Scream Spike (>85 dB)',
                            reason: 'High-frequency distress scream detected',
                            event: 'scream',
                          },
                          {
                            label: 'Acoustic: Glass Shattering & Banging',
                            reason: 'Breaking glass and aggressive banging detected',
                            event: 'glass_shatter',
                          },
                        ].map((item) => (
                          <button
                            key={item.event}
                            type="button"
                            disabled={!audioGuardEnabled}
                            onClick={() => startThreePromptVerification(item.reason, item.event)}
                            className="min-h-[46px] px-3 py-2 text-left text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 cursor-pointer"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                      {!audioGuardEnabled && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Enable the Travel Audio Guard switch above to observe sounds while travelling.
                        </p>
                      )}

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <label className="text-[11px] font-medium text-slate-500 block">
                          Or type/speak emergency voice command:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={liveTranscript}
                            onChange={(e) => setLiveTranscript(e.target.value)}
                            placeholder='e.g. "Stop, leave me alone"'
                            className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!liveTranscript.trim()) return;
                              startThreePromptVerification(liveTranscript.trim(), 'voice_command');
                              setLiveTranscript('');
                            }}
                            className="px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium rounded-xl cursor-pointer"
                          >
                            Test
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {phoneTab === 'journey' && (
                  <div className="space-y-4">
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          Journey Protection
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {journeyActive ? 'MONITORING' : 'STANDBY'}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={journeyDestination}
                        onChange={(e) => setJourneyDestination(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        placeholder="Destination..."
                      />
                      <button
                        type="button"
                        onClick={() => setJourneyActive((v) => !v)}
                        className={`w-full min-h-[48px] rounded-xl text-xs font-semibold cursor-pointer ${
                          journeyActive
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        }`}
                      >
                        {journeyActive ? t.journeySafeArrival : t.journeyStart}
                      </button>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => simulateMoveAndPing(false)}
                          className="min-h-[44px] px-2.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Send GPS Ping
                        </button>
                        <button
                          type="button"
                          onClick={() => simulateMoveAndPing(true)}
                          className="min-h-[44px] px-2.5 py-2 text-xs font-medium rounded-xl border border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                        >
                          Simulate Route Deviation
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBatteryPercent(12);
                          dispatchSos(
                            'unexpected_stop',
                            'Unexpected 8-minute vehicle stop + Low battery warning (12%) sent to contacts.'
                          );
                        }}
                        className="w-full min-h-[44px] px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <BatteryLow className="w-4 h-4 text-amber-600" />
                        Simulate Unexpected Stop &amp; Low Battery (12%)
                      </button>
                    </div>

                    {/* Geofenced Safe Zones */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Geofenced Safe Zones
                      </div>
                      {state.safeZones.map((zone) => (
                        <div
                          key={zone.id}
                          className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-200">{zone.name}</span>
                          <span className="font-mono text-slate-500">{zone.radiusMeters}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {phoneTab === 'report' && (
                  <div className="space-y-4">
                    <form
                      onSubmit={handleReportSubmit}
                      className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3"
                    >
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.reportTitle}</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Urgent assault, domestic abuse, fire, or medical reports automatically alert the nearest Police Station, Fire Brigade, or Hospital with location &amp; incident type only.
                      </p>

                      <select
                        value={reportCategory}
                        onChange={(e) =>
                          setReportCategory(e.target.value as CommunityReport['category'])
                        }
                        className="w-full px-3 py-2.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                      >
                        <option value="assault">Assault / Street Threat (Nearest Police 15)</option>
                        <option value="household_violence">Household Violence / Abuse (Nearest Police 15)</option>
                        <option value="fire_hazard">Fire / Explosion Hazard (Nearest Fire 16)</option>
                        <option value="medical_emergency">Medical Emergency (Nearest Hospital / 1122)</option>
                        <option value="harassment">Harassment / Unsafe Behavior (Moderated)</option>
                        <option value="unsafe_lighting">Unsafe Lighting / Dark Corridor (Moderated)</option>
                      </select>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={reportArea}
                          onChange={(e) => setReportArea(e.target.value)}
                          placeholder="Area / Sector..."
                          className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        />
                        <input
                          type="text"
                          value={reportStreet}
                          onChange={(e) => setReportStreet(e.target.value)}
                          placeholder="Street / Lane..."
                          className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        />
                      </div>

                      <textarea
                        rows={3}
                        value={reportDesc}
                        onChange={(e) => setReportDesc(e.target.value)}
                        placeholder="Describe what is happening so GuardAI & nearest station can help..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                      />

                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 font-medium">
                        <input
                          type="checkbox"
                          checked={shareProfileWithTeam}
                          onChange={(e) => setShareProfileWithTeam(e.target.checked)}
                        />
                        Share my address, phone &amp; profile with GuardAI team so they can help me
                      </label>

                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={reportAnon}
                          onChange={(e) => setReportAnon(e.target.checked)}
                        />
                        Keep anonymous in public community advisories
                      </label>

                      <button
                        type="submit"
                        className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                      >
                        Submit &amp; Alert Nearest Station
                      </button>

                      {reportStatusMsg && (
                        <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-lg">
                          {reportStatusMsg}
                        </div>
                      )}
                    </form>
                  </div>
                )}

                {phoneTab === 'account' && (
                  <div className="space-y-4">
                    {/* Profile & Home Address (Shared with GuardAI Team on Report) */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Citizen Profile &amp; Address
                        </span>
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          {state.citizenProfile.verified ? 'OTP Verified' : 'Unverified'}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={state.citizenProfile.name}
                        onChange={(e) => onUpdateProfile({ name: e.target.value })}
                        placeholder="Full Name"
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={state.citizenProfile.city}
                          onChange={(e) => onUpdateProfile({ city: e.target.value })}
                          className="px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        >
                          {Object.keys(PAKISTAN_CITY_HUBS).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={state.citizenProfile.area}
                          onChange={(e) => onUpdateProfile({ area: e.target.value })}
                          placeholder="Area / Sector"
                          className="px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        />
                      </div>
                      <input
                        type="text"
                        value={state.citizenProfile.street}
                        onChange={(e) => onUpdateProfile({ street: e.target.value })}
                        placeholder="Street / Lane"
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                      />
                      <input
                        type="text"
                        value={state.citizenProfile.fullAddress}
                        onChange={(e) => onUpdateProfile({ fullAddress: e.target.value })}
                        placeholder="Full Residential / Current Address"
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={otpPhone}
                          onChange={(e) => setOtpPhone(e.target.value)}
                          className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          className="px-3 py-2 text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl cursor-pointer"
                        >
                          Send OTP
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="Enter 4-digit OTP (4829)"
                          className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                        >
                          Verify
                        </button>
                      </div>
                      {otpSentBanner && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">{otpSentBanner}</div>
                      )}
                    </div>

                    {/* Optional Medical Notes */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Optional Medical Notes (Consent-Controlled)
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={state.citizenProfile.bloodGroup || ''}
                          onChange={(e) => onUpdateProfile({ bloodGroup: e.target.value })}
                          placeholder="Blood Group"
                          className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        />
                        <input
                          type="text"
                          value={state.citizenProfile.allergies || ''}
                          onChange={(e) => onUpdateProfile({ allergies: e.target.value })}
                          placeholder="Allergies"
                          className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={state.citizenProfile.shareMedicalOnSos}
                          onChange={(e) => onUpdateProfile({ shareMedicalOnSos: e.target.checked })}
                        />
                        Share medical summary only with Rescue 1122 / Hospital on SOS
                      </label>
                    </div>

                    {/* Family Safety Circle */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Trusted Contacts (Priority Circle)
                      </div>
                      <div className="space-y-2">
                        {state.citizenProfile.contacts.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-slate-100 dark:border-slate-800"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white truncate">
                                P{c.priority} · {c.name}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">{c.phone}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveContact(c.id)}
                              className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                              aria-label="Remove contact"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={handleAddContact} className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={newContactName}
                            onChange={(e) => setNewContactName(e.target.value)}
                            placeholder="Contact Name"
                            className="px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                          />
                          <input
                            type="text"
                            value={newContactPhone}
                            onChange={(e) => setNewContactPhone(e.target.value)}
                            placeholder="+92 3XX XXXXXXX"
                            className="px-2.5 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full min-h-[40px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Trusted Contact
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Bottom Tab Navigation (44px+ touch targets) */}
              <div className="grid grid-cols-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {(
                  [
                    { id: 'sos', label: 'SOS', icon: ShieldAlert },
                    { id: 'audio', label: 'Audio', icon: Mic },
                    { id: 'journey', label: 'Journey', icon: Navigation },
                    { id: 'report', label: 'Report', icon: Flame },
                    { id: 'account', label: 'Circle', icon: ShieldCheck },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = phoneTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPhoneTab(tab.id)}
                      className={`min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
                        active
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Desktop Companion Telemetry, Downloadable App Card & Offline Queue */}
      <div className="xl:col-span-7 space-y-6">
        {/* Standalone Downloadable App Card */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Standalone Citizen Mobile App (Installable PWA)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Download GuardAI separately on any smartphone or desktop at <span className="font-mono">/app</span>. All SOS alerts and reports sync live to the Working Team Dashboard.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            <a
              href="/app"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Open /app Window
            </a>
          </div>
        </div>

        {/* Network & Offline Resilience Simulator */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Offline Resilience &amp; SMS Fallback Inspector
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Toggle offline mode to verify local secure storage queueing and automatic delivery when connectivity returns.
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleOffline}
              className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isOffline
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              }`}
            >
              {isOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
              {isOffline ? 'Simulate Reconnect (Flush Queue)' : 'Simulate Network Loss'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Current Delivery State</div>
              <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                {offlineQueue.length > 0
                  ? 'Queued on phone (Local Storage)'
                  : lastIncident
                    ? 'Received by response team'
                    : 'Standby — Ready'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Last-Known GPS &amp; Accuracy</div>
              <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-white mt-0.5">
                {citizenCoords.lat.toFixed(4)}, {citizenCoords.lng.toFixed(4)} (±8m)
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Device Battery Telemetry</div>
              <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-white mt-0.5">
                {batteryPercent}% · Low-bandwidth SMS ready
              </div>
            </div>
          </div>

          {offlineQueue.length > 0 && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1.5">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Queued SMS Fallback Payloads ({offlineQueue.length})
              </div>
              {offlineQueue.map((item) => (
                <div key={item.localId} className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {item.smsPayloadPreview}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trusted Contact Circle View (Privacy-Scoped Acknowledgement) */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Family Safety Circle — Contact View
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Contacts can acknowledge active alerts and track emergency status without accessing unrelated private logs.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {state.citizenProfile.contacts.map((contact) => {
              const hasAcked = lastIncident?.trustedContactAcks.some(
                (a) => a.contactId === contact.id
              );
              return (
                <div key={contact.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Priority {contact.priority} · {contact.name} ({contact.relation})
                    </div>
                    <div className="text-slate-500 font-mono">
                      {contact.phone} · Scope: Incident status &amp; live GPS only
                    </div>
                  </div>
                  {lastIncident && lastIncident.status !== 'resolved' ? (
                    <button
                      type="button"
                      disabled={Boolean(hasAcked)}
                      onClick={() => onContactAck(lastIncident.id, contact.id, contact.name)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer ${
                        hasAcked
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      }`}
                    >
                      {hasAcked ? 'Alert Acknowledged' : 'Acknowledge as Contact'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">No active alert</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Regional Data-Minimization Verification */}
        {lastIncident && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Active Incident Station Routing ({lastIncident.id})
            </h3>
            {lastIncident.regionalDispatches.length === 0 ? (
              <p className="text-xs text-slate-500">
                Incident received by Control Room; awaiting station dispatch.
              </p>
            ) : (
              <div className="space-y-2.5">
                {lastIncident.regionalDispatches.map((d) => (
                  <div
                    key={d.stationId}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                      <span>{d.stationName}</span>
                      <span className="font-mono tabular-nums text-slate-500">{d.distanceKm} km away</span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">
                      Data shared: {d.sharedFields.join(' · ')}
                    </div>
                    <div className="text-slate-500">
                      Data withheld: {d.withheldFields.join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
