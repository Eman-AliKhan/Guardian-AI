import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { AgencyForumsView } from './components/AgencyForumsView';
import { ControlRoomView } from './components/ControlRoomView';
import { GovernanceArchitectureView } from './components/GovernanceArchitectureView';
import { MobileCompanionView } from './components/MobileCompanionView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ResponderAnalyticsView } from './components/ResponderAnalyticsView';
import { createInitialGuardianState } from './data/pakistanSeed';
import type {
  AgencyForumPost,
  CitizenProfile,
  CommunityReport,
  EmergencyAgency,
  GuardianStateSnapshot,
  Incident,
  IncidentStatus,
  IncidentTrigger,
  OfflineQueuedSOS,
  RegisteredCitizenRecord,
} from './types/guardian';

type TeamWorkspaceView = 'control-room' | 'forums' | 'responders' | 'governance';

const OFFLINE_QUEUE_KEY = 'guardian_ai_offline_queue_v1';

function mergeForumPosts(existing: AgencyForumPost[], incoming?: AgencyForumPost[]): AgencyForumPost[] {
  if (!incoming || incoming.length === 0) return existing;
  const seen = new Set(existing.map((p) => p.id));
  const uniqueIncoming = incoming.filter((p) => !seen.has(p.id));
  return [...uniqueIncoming, ...existing].slice(0, 100);
}

export default function App() {
  const [isCitizenAppRoute, setIsCitizenAppRoute] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.location.pathname.startsWith('/app') : false
  );
  const [view, setView] = useState<TeamWorkspaceView>('control-room');
  const [darkMode, setDarkMode] = useState(false);
  const [state, setState] = useState<GuardianStateSnapshot>(() => createInitialGuardianState());
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>('INC-2026-401');
  const [activeCity, setActiveCity] = useState<string>('Lahore');
  const [wsConnected, setWsConnected] = useState(false);

  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedSOS[]>(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? (JSON.parse(raw) as OfflineQueuedSOS[]) : [];
    } catch {
      return [];
    }
  });

  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setIsCitizenAppRoute(window.location.pathname.startsWith('/app'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToMode = useCallback((citizenMode: boolean) => {
    const targetPath = citizenMode ? '/app' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setIsCitizenAppRoute(citizenMode);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue));
    } catch {
      // Ignore storage quota issues
    }
  }, [offlineQueue]);

  // Fetch initial snapshot & connect real WebSocket stream
  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = (await res.json()) as GuardianStateSnapshot;
        setState(data);
      }
    } catch (err) {
      console.error('Failed to fetch initial state:', err);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();

    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'state:init' || msg.type === 'state:sync') {
            setState(msg.payload);
          } else if (msg.type === 'incident:created') {
            const { incident, audit, forumPosts } = msg.payload as {
              incident: Incident;
              audit?: GuardianStateSnapshot['auditLogs'][number];
              forumPosts?: AgencyForumPost[];
            };
            setState((prev) => {
              const exists = prev.incidents.some((i) => i.id === incident.id);
              return {
                ...prev,
                incidents: exists ? prev.incidents : [incident, ...prev.incidents],
                agencyForumPosts: mergeForumPosts(prev.agencyForumPosts, forumPosts),
                auditLogs: audit ? [audit, ...prev.auditLogs].slice(0, 100) : prev.auditLogs,
              };
            });
          } else if (msg.type === 'incident:updated') {
            const { incident, responders, audit, forumPosts } = msg.payload as {
              incident: Incident;
              responders?: GuardianStateSnapshot['responders'];
              audit?: GuardianStateSnapshot['auditLogs'][number];
              forumPosts?: AgencyForumPost[];
            };
            setState((prev) => ({
              ...prev,
              incidents: prev.incidents.map((i) => (i.id === incident.id ? incident : i)),
              responders: responders || prev.responders,
              agencyForumPosts: mergeForumPosts(prev.agencyForumPosts, forumPosts),
              auditLogs: audit ? [audit, ...prev.auditLogs].slice(0, 100) : prev.auditLogs,
            }));
          } else if (msg.type === 'incident:location') {
            const { incidentId, location, batteryAtTrigger } = msg.payload;
            setState((prev) => ({
              ...prev,
              incidents: prev.incidents.map((i) =>
                i.id === incidentId
                  ? {
                      ...i,
                      location,
                      batteryAtTrigger,
                      locationTrail: [...i.locationTrail, location],
                    }
                  : i
              ),
            }));
          } else if (msg.type === 'responders:sync') {
            setState((prev) => ({ ...prev, responders: msg.payload }));
          } else if (msg.type === 'community:updated') {
            const { reports, audit, forumPosts } = msg.payload as {
              reports: CommunityReport[];
              audit?: GuardianStateSnapshot['auditLogs'][number];
              forumPosts?: AgencyForumPost[];
            };
            setState((prev) => ({
              ...prev,
              communityReports: reports,
              agencyForumPosts: mergeForumPosts(prev.agencyForumPosts, forumPosts),
              auditLogs: audit ? [audit, ...prev.auditLogs].slice(0, 100) : prev.auditLogs,
            }));
          } else if (msg.type === 'forum:posted') {
            const { post, audit } = msg.payload as {
              post: AgencyForumPost;
              audit?: GuardianStateSnapshot['auditLogs'][number];
            };
            setState((prev) => ({
              ...prev,
              agencyForumPosts: mergeForumPosts(prev.agencyForumPosts, [post]),
              auditLogs: audit ? [audit, ...prev.auditLogs].slice(0, 100) : prev.auditLogs,
            }));
          } else if (msg.type === 'citizen:updated') {
            setState((prev) => ({ ...prev, citizenProfile: msg.payload }));
          } else if (msg.type === 'citizens:sync') {
            const { registeredCitizens, audit } = msg.payload as {
              registeredCitizens: RegisteredCitizenRecord[];
              audit?: GuardianStateSnapshot['auditLogs'][number];
            };
            setState((prev) => ({
              ...prev,
              registeredCitizens,
              auditLogs: audit ? [audit, ...prev.auditLogs].slice(0, 100) : prev.auditLogs,
            }));
          }
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [fetchSnapshot]);

  // Flush offline SOS queue automatically when back online
  const flushOfflineQueue = useCallback(async () => {
    if (offlineQueue.length === 0) return;
    const pending = [...offlineQueue];
    for (const item of pending) {
      try {
        const res = await fetch('/api/incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger: item.trigger,
            silentMode: item.silentMode,
            location: item.location,
            city: state.citizenProfile.city,
            area: state.citizenProfile.area,
            street: state.citizenProfile.street,
            fullAddress: state.citizenProfile.fullAddress,
            areaLabel: `${state.citizenProfile.street}, ${state.citizenProfile.area} (Offline-Recovered)`,
            transcriptOrAudioNote: `${item.transcriptOrAudioNote || 'Offline SOS'} (Synced from phone queue)`,
            deliveryChannel: 'offline_sync',
            batteryPercent: item.batteryPercent,
          }),
        });
        if (res.ok) {
          const created = (await res.json()) as Incident;
          setSelectedIncidentId(created.id);
          setOfflineQueue((prev) => prev.filter((q) => q.localId !== item.localId));
        }
      } catch {
        // Keep remaining items queued until network stabilizes
      }
    }
  }, [
    offlineQueue,
    state.citizenProfile.city,
    state.citizenProfile.area,
    state.citizenProfile.street,
    state.citizenProfile.fullAddress,
  ]);

  const handleToggleOffline = () => {
    if (isOffline) {
      setIsOffline(false);
      setTimeout(() => {
        flushOfflineQueue();
      }, 150);
    } else {
      setIsOffline(true);
    }
  };

  const handleTriggerSos = async (payload: {
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
  }): Promise<Incident | null> => {
    if (isOffline) {
      const queued: OfflineQueuedSOS = {
        localId: `loc-${Date.now()}`,
        createdAt: new Date().toISOString(),
        trigger: payload.trigger,
        silentMode: payload.silentMode,
        location: { lat: payload.lat, lng: payload.lng, timestamp: new Date().toISOString(), accuracyMeters: 12 },
        batteryPercent: payload.batteryPercent,
        transcriptOrAudioNote: payload.transcriptOrAudioNote,
        smsPayloadPreview: `GAI-SOS|${payload.trigger.toUpperCase()}|LAT:${payload.lat.toFixed(4)}|LNG:${payload.lng.toFixed(4)}|BAT:${payload.batteryPercent}%|${payload.silentMode ? 'SILENT' : 'AUDIBLE'}`,
        state: 'queued_on_phone',
      };
      setOfflineQueue((prev) => [queued, ...prev]);
      return null;
    }

    const res = await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: payload.trigger,
        silentMode: payload.silentMode,
        location: { lat: payload.lat, lng: payload.lng, accuracyMeters: 8 },
        city: payload.city,
        area: payload.area,
        street: payload.street,
        fullAddress: payload.fullAddress,
        areaLabel: payload.areaLabel,
        transcriptOrAudioNote: payload.transcriptOrAudioNote,
        agencyOverride: payload.agencyOverride,
        deliveryChannel: 'live_ws',
        batteryPercent: payload.batteryPercent,
      }),
    });
    if (!res.ok) return null;
    const created = (await res.json()) as Incident;
    setSelectedIncidentId(created.id);
    setActiveCity(created.city);
    return created;
  };

  const handleUpdateIncident = async (
    incidentId: string,
    patch: {
      status?: IncidentStatus;
      assignedResponderId?: string;
      escalatedToSupervisor?: boolean;
      noteText?: string;
      notifyAgency?: 'police' | 'hospital' | 'fire';
    }
  ) => {
    await fetch(`/api/incidents/${incidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  };

  const handleRunAiTriage = async (incidentId: string) => {
    setAiLoadingId(incidentId);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/analyze-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAiError(data.error || 'AI analysis failed.');
      }
    } catch {
      setAiError('Unable to reach AI triage service. Continue with manual operator triage.');
    } finally {
      setAiLoadingId(null);
    }
  };

  const handleUploadEvidence = async (
    incidentId: string,
    type: 'audio' | 'photo' | 'video',
    note: string
  ) => {
    await fetch(`/api/incidents/${incidentId}/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, durationSec: 18, summaryNote: note }),
    });
  };

  const handleUpdateProfile = async (updates: Partial<CitizenProfile>) => {
    setState((prev) => ({
      ...prev,
      citizenProfile: { ...prev.citizenProfile, ...updates },
    }));
    const res = await fetch('/api/citizen/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = (await res.json()) as { citizenProfile?: CitizenProfile };
      if (data.citizenProfile) {
        setState((prev) => ({ ...prev, citizenProfile: data.citizenProfile! }));
      }
    }
  };

  const handleRegisterCitizen = async (profile: Partial<CitizenProfile>) => {
    const res = await fetch('/api/citizens/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        citizenProfile: CitizenProfile;
        record: RegisteredCitizenRecord;
      };
      setState((prev) => ({
        ...prev,
        citizenProfile: data.citizenProfile,
        registeredCitizens: [
          data.record,
          ...prev.registeredCitizens.filter((c) => c.id !== data.record.id),
        ],
      }));
    }
  };

  const handleSubmitCommunityReport = async (report: {
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
  }): Promise<CommunityReport> => {
    const res = await fetch('/api/community/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    return (await res.json()) as CommunityReport;
  };

  const handleModerateReport = async (
    reportId: string,
    moderationStatus: CommunityReport['moderationStatus']
  ) => {
    await fetch(`/api/community/reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moderationStatus }),
    });
  };

  const handleContactAck = async (incidentId: string, contactId: string, contactName: string) => {
    await fetch(`/api/incidents/${incidentId}/contact-ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, contactName }),
    });
  };

  const handlePingLocation = async (
    incidentId: string,
    lat: number,
    lng: number,
    batteryPercent: number
  ) => {
    await fetch(`/api/incidents/${incidentId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, batteryPercent }),
    });
  };

  const handlePostForumReply = async (payload: {
    stationId: string;
    message: string;
    author: string;
    role: string;
    statusTag: AgencyForumPost['statusTag'];
  }) => {
    await fetch('/api/forums/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  };

  // --- SEPARATE STANDALONE CITIZEN MOBILE APP VIEW (/app) ---
  if (isCitizenAppRoute) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              GuardAI Citizen
            </span>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              {isOffline || !wsConnected ? (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <WifiOff className="w-3.5 h-3.5" />
                  {isOffline ? 'Offline Queue' : 'Syncing...'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                  <Wifi className="w-3.5 h-3.5" />
                  Connected to GuardAI Team
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <PWAInstallButton compact />
              <button
                type="button"
                onClick={() => navigateToMode(false)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Team Dashboard
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6">
          <MobileCompanionView
            state={state}
            isOffline={isOffline}
            onToggleOffline={handleToggleOffline}
            offlineQueue={offlineQueue}
            onTriggerSos={handleTriggerSos}
            onUploadEvidence={handleUploadEvidence}
            onUpdateProfile={handleUpdateProfile}
            onRegisterCitizen={handleRegisterCitizen}
            onSubmitCommunityReport={handleSubmitCommunityReport}
            onContactAck={handleContactAck}
            onPingLocation={handlePingLocation}
          />
        </main>
      </div>
    );
  }

  // --- SEPARATE GUARDAI WORKING TEAM DASHBOARD (/) ---
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setView('control-room')}
            className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Guardian AI
          </button>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                { id: 'control-room', label: 'Control Room' },
                { id: 'forums', label: 'Agency Forums' },
                { id: 'responders', label: 'Responders' },
                { id: 'governance', label: 'Governance' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  view === item.id
                    ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary action to open separate Citizen App */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigateToMode(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Citizen App (/app)
            </button>
          </div>
        </div>

        {/* Mobile Nav Row (visible < md) */}
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {(
            [
              { id: 'control-room', label: 'Control Room' },
              { id: 'forums', label: 'Agency Forums' },
              { id: 'responders', label: 'Responders' },
              { id: 'governance', label: 'Governance' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                view === item.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Working Team Workspace */}
      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
        {/* Workspace Context Toolbar (Below Top Bar) */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {view === 'control-room' && 'GuardAI Working Team — Emergency Control Room'}
              {view === 'forums' && 'Police Station Forums, Hospitals & Fire System Dispatch'}
              {view === 'responders' && 'Verified Responder Fleet & Regional Stations'}
              {view === 'governance' && 'Security Governance, RBAC & Audit Trail'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {wsConnected ? 'Real-time WebSocket dispatch synced with Citizen /app' : 'Reconnecting live stream...'}
              {' · '}Police 15 · Rescue 1122 · Fire Brigade 16
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href="/app"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Separate Window (/app)
            </a>
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {darkMode ? 'Daylight Mode' : 'Night Shift Mode'}
            </button>
          </div>
        </div>

        {view === 'control-room' && (
          <ControlRoomView
            state={state}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={setSelectedIncidentId}
            activeCity={activeCity}
            onCityChange={setActiveCity}
            onUpdateIncident={handleUpdateIncident}
            onRunAiTriage={handleRunAiTriage}
            onModerateReport={handleModerateReport}
            aiLoadingId={aiLoadingId}
            aiError={aiError}
          />
        )}

        {view === 'forums' && (
          <AgencyForumsView state={state} onPostForumReply={handlePostForumReply} />
        )}

        {view === 'responders' && <ResponderAnalyticsView state={state} />}

        {view === 'governance' && <GovernanceArchitectureView state={state} />}
      </main>
    </div>
  );
}
