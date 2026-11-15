import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  FileAudio,
  Flame,
  HeartPulse,
  MapPin,
  PhoneCall,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { TacticalMap } from './TacticalMap';
import type {
  CommunityReport,
  EmergencyAgency,
  GuardianStateSnapshot,
  Incident,
  IncidentStatus,
} from '../types/guardian';

interface ControlRoomViewProps {
  state: GuardianStateSnapshot;
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  activeCity: string;
  onCityChange: (city: string) => void;
  onUpdateIncident: (
    incidentId: string,
    patch: {
      status?: IncidentStatus;
      assignedResponderId?: string;
      escalatedToSupervisor?: boolean;
      noteText?: string;
      notifyAgency?: 'police' | 'hospital' | 'fire';
    }
  ) => Promise<void>;
  onRunAiTriage: (incidentId: string) => Promise<void>;
  onModerateReport: (reportId: string, status: CommunityReport['moderationStatus']) => Promise<void>;
  aiLoadingId: string | null;
  aiError: string | null;
}

const STATUS_META: Record<IncidentStatus, { label: string; colorClass: string }> = {
  created: { label: 'New Alert', colorClass: 'text-red-700 dark:text-red-400' },
  acknowledged: { label: 'Acknowledged', colorClass: 'text-amber-700 dark:text-amber-400' },
  responder_assigned: { label: 'Unit En Route', colorClass: 'text-blue-700 dark:text-blue-400' },
  resolved: { label: 'Resolved', colorClass: 'text-emerald-700 dark:text-emerald-400' },
  false_alarm: { label: 'False Alarm', colorClass: 'text-slate-500 dark:text-slate-400' },
};

const PRIORITY_META: Record<Incident['priority'], { label: string; colorClass: string }> = {
  critical: { label: 'Critical', colorClass: 'text-red-700 dark:text-red-400 font-semibold' },
  high: { label: 'High', colorClass: 'text-amber-700 dark:text-amber-400 font-semibold' },
  moderate: { label: 'Moderate', colorClass: 'text-slate-700 dark:text-slate-300 font-medium' },
  low: { label: 'Low', colorClass: 'text-slate-500 dark:text-slate-400' },
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export const ControlRoomView: React.FC<ControlRoomViewProps> = ({
  state,
  selectedIncidentId,
  onSelectIncident,
  activeCity,
  onCityChange,
  onUpdateIncident,
  onRunAiTriage,
  onModerateReport,
  aiLoadingId,
  aiError,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'police' | 'hospital' | 'fire'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'dispatch' | 'community'>('dispatch');

  const filteredIncidents = useMemo(() => {
    return state.incidents.filter((inc) => {
      if (filterMode === 'active' && (inc.status === 'resolved' || inc.status === 'false_alarm')) {
        return false;
      }
      if (
        (filterMode === 'police' || filterMode === 'hospital' || filterMode === 'fire') &&
        inc.agency !== filterMode &&
        inc.agency !== 'multi'
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          inc.id.toLowerCase().includes(q) ||
          inc.citizenName.toLowerCase().includes(q) ||
          inc.city.toLowerCase().includes(q) ||
          inc.areaLabel.toLowerCase().includes(q) ||
          (inc.transcriptOrAudioNote || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.incidents, filterMode, searchQuery]);

  const selectedIncident =
    state.incidents.find((i) => i.id === selectedIncidentId) || filteredIncidents[0] || null;

  const activeCount = state.incidents.filter(
    (i) => i.status !== 'resolved' && i.status !== 'false_alarm'
  ).length;
  const criticalCount = state.incidents.filter(
    (i) => i.priority === 'critical' && i.status !== 'resolved' && i.status !== 'false_alarm'
  ).length;
  const availableResponders = state.responders.filter((r) => r.status === 'available').length;
  const pendingReports = state.communityReports.filter(
    (r) => r.moderationStatus === 'pending_review'
  ).length;

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !noteInput.trim()) return;
    await onUpdateIncident(selectedIncident.id, { noteText: noteInput.trim() });
    setNoteInput('');
  };

  const renderAgencyIcon = (agency: EmergencyAgency) => {
    if (agency === 'fire') return <Flame className="w-4 h-4 text-orange-600 shrink-0" />;
    if (agency === 'hospital') return <HeartPulse className="w-4 h-4 text-emerald-600 shrink-0" />;
    return <Shield className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />;
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Strip (Clean hairline grid, tabular numerals, zero card clutter) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Incidents</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {activeCount}
            </span>
            <span className="text-xs text-red-700 dark:text-red-400 font-medium">
              {criticalCount} critical
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Available Responders</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {availableResponders}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              of {state.responders.length} verified units
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Connected Stations</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {state.stations.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Police 15 · 1122 · Fire 16
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Community Reports</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {state.communityReports.length}
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              {pendingReports} awaiting review
            </span>
          </div>
        </div>
      </div>

      {/* Mode Switcher: Live Incident Dispatch vs Community Moderation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveSubTab('dispatch')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSubTab === 'dispatch'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Live Dispatch &amp; Map ({state.incidents.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('community')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSubTab === 'community'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Community Safety Moderation ({state.communityReports.length})
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Human operator confirms all dispatches · Privacy-minimized station sharing enforced
        </div>
      </div>

      {activeSubTab === 'community' ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Community Incident &amp; Unsafe Location Reports
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Community reports are moderated advisories and do not independently prove a person or place is dangerous.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {state.communityReports.map((rep) => (
              <div
                key={rep.id}
                className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">{rep.id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">
                      {rep.category.replace('_', ' ')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{rep.city}</span>
                    <span aria-hidden="true">·</span>
                    <span>{rep.anonymous ? 'Anonymous' : 'Verified Citizen'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{formatTime(rep.createdAt)}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {rep.areaLabel}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{rep.description}</p>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Status:{' '}
                    <span className="font-medium text-slate-900 dark:text-slate-200">
                      {rep.moderationStatus.replace(/_/g, ' ')}
                    </span>
                    {rep.routedStationName && (
                      <>
                        {' · '}Routed to <span className="font-medium">{rep.routedStationName}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onModerateReport(rep.id, 'verified_advisory')}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                  >
                    Mark Advisory
                  </button>
                  <button
                    type="button"
                    onClick={() => onModerateReport(rep.id, 'escalated_police')}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 whitespace-nowrap cursor-pointer"
                  >
                    Route to Police 15
                  </button>
                  <button
                    type="button"
                    onClick={() => onModerateReport(rep.id, 'escalated_fire')}
                    className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 whitespace-nowrap cursor-pointer"
                  >
                    Route to Fire 16
                  </button>
                  <button
                    type="button"
                    onClick={() => onModerateReport(rep.id, 'dismissed')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 whitespace-nowrap cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Column: Live Incident Queue */}
          <div className="xl:col-span-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ID, citizen, city, area..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
                />
              </div>
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {(['all', 'active', 'police', 'hospital', 'fire'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                      filterMode === mode
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[780px] overflow-y-auto">
              {filteredIncidents.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No incidents match the current filter.
                </div>
              ) : (
                filteredIncidents.map((inc) => {
                  const isSelected = selectedIncident?.id === inc.id;
                  const statusMeta = STATUS_META[inc.status];
                  const prioMeta = PRIORITY_META[inc.priority];
                  return (
                    <button
                      key={inc.id}
                      type="button"
                      onClick={() => onSelectIncident(inc.id)}
                      className={`w-full text-left p-4 transition-colors cursor-pointer block ${
                        isSelected
                          ? 'bg-slate-100/90 dark:bg-slate-800/80'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {renderAgencyIcon(inc.agency)}
                          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {inc.id}
                          </span>
                          <span className={`text-xs ${prioMeta.colorClass}`}>
                            {prioMeta.label}
                          </span>
                        </div>
                        <span className={`text-xs font-medium whitespace-nowrap ${statusMeta.colorClass}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {inc.citizenName} — {inc.areaLabel}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{inc.city}</span>
                        <span aria-hidden="true">·</span>
                        <span>{inc.trigger.replace(/_/g, ' ')}</span>
                        {inc.silentMode && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">Silent</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatTime(inc.createdAt)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Live Map + Selected Incident Command Detail */}
          <div className="xl:col-span-8 space-y-6">
            <TacticalMap
              incidents={state.incidents}
              responders={state.responders}
              stations={state.stations}
              communityReports={state.communityReports}
              safeZones={state.safeZones}
              selectedIncidentId={selectedIncident?.id ?? null}
              onSelectIncident={onSelectIncident}
              activeCity={activeCity}
              onCityChange={onCityChange}
              showHeatmap={showHeatmap}
              onToggleHeatmap={() => setShowHeatmap((v) => !v)}
              heightClass="h-[420px]"
            />

            {selectedIncident ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {/* Incident Header & Primary Lifecycle Controls */}
                <div className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {selectedIncident.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={PRIORITY_META[selectedIncident.priority].colorClass}>
                        {PRIORITY_META[selectedIncident.priority].label} Priority
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={STATUS_META[selectedIncident.status].colorClass}>
                        {STATUS_META[selectedIncident.status].label}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Channel:{' '}
                        {selectedIncident.deliveryChannel === 'offline_sync'
                          ? 'Offline Sync'
                          : selectedIncident.deliveryChannel === 'sms_fallback'
                            ? 'SMS Fallback'
                            : 'Live WebSocket'}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedIncident.citizenName} ({selectedIncident.citizenPhone})
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {selectedIncident.areaLabel}, {selectedIncident.city}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {selectedIncident.location.lat.toFixed(4)}, {selectedIncident.location.lng.toFixed(4)} (±
                        {selectedIncident.location.accuracyMeters ?? 10}m)
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">
                        Battery: {selectedIncident.batteryAtTrigger}%
                      </span>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${selectedIncident.location.lat},${selectedIncident.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 dark:text-blue-400 hover:underline font-medium"
                      >
                        Open Responder Navigation
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {selectedIncident.status === 'created' && (
                      <button
                        type="button"
                        onClick={() => onUpdateIncident(selectedIncident.id, { status: 'acknowledged' })}
                        className="px-3 py-2 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 whitespace-nowrap cursor-pointer"
                      >
                        Acknowledge
                      </button>
                    )}
                    {selectedIncident.status !== 'resolved' && selectedIncident.status !== 'false_alarm' && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateIncident(selectedIncident.id, { escalatedToSupervisor: true })
                          }
                          disabled={selectedIncident.escalatedToSupervisor}
                          className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                        >
                          {selectedIncident.escalatedToSupervisor ? 'Supervisor Escalated' : 'Escalate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIncident(selectedIncident.id, { status: 'resolved' })}
                          className="px-3 py-2 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 whitespace-nowrap cursor-pointer"
                        >
                          Mark Resolved
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIncident(selectedIncident.id, { status: 'false_alarm' })}
                          className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                        >
                          False Alarm
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Distress Signal & Gemini AI Human-Reviewable Triage */}
                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Sensor &amp; Audio Telemetry
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      {selectedIncident.transcriptOrAudioNote ||
                        'Manual SOS panic trigger received without attached audio transcript.'}
                    </p>
                    {selectedIncident.medicalSummaryShared && (
                      <div className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                        <span className="font-semibold">Consented Medical Note: </span>
                        {selectedIncident.medicalSummaryShared}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Location Trail Points:{' '}
                      <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                        {selectedIncident.locationTrail.length}
                      </span>
                      {' · '}
                      Trusted Contact Acks:{' '}
                      <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                        {selectedIncident.trustedContactAcks.length}
                      </span>
                    </div>
                    {selectedIncident.trustedContactAcks.length > 0 && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        {selectedIncident.trustedContactAcks.map((ack) => (
                          <div key={ack.contactId} className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>
                              {ack.contactName} acknowledged at {formatTime(ack.ackAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Gemini AI Summary */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        AI Incident Triage (Human-Reviewable)
                      </span>
                      <button
                        type="button"
                        onClick={() => onRunAiTriage(selectedIncident.id)}
                        disabled={aiLoadingId === selectedIncident.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-md hover:opacity-90 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {aiLoadingId === selectedIncident.id
                          ? 'Analyzing...'
                          : selectedIncident.aiAnalysis
                            ? 'Refresh AI Summary'
                            : 'Generate AI Triage'}
                      </button>
                    </div>

                    {aiError && (
                      <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                        {aiError}
                      </div>
                    )}

                    {selectedIncident.aiAnalysis ? (
                      <div className="space-y-2.5 text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            Risk Score:{' '}
                            <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                              {selectedIncident.aiAnalysis.riskScore}/100
                            </strong>
                          </span>
                          <span>
                            Suggested Agency:{' '}
                            <strong className="uppercase text-slate-900 dark:text-white">
                              {selectedIncident.aiAnalysis.recommendedAgency}
                            </strong>
                          </span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed">
                          {selectedIncident.aiAnalysis.summary}
                        </p>
                        {selectedIncident.aiAnalysis.suggestedActions.length > 0 && (
                          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-4">
                            {selectedIncident.aiAnalysis.suggestedActions.map((act, idx) => (
                              <li key={idx}>{act}</li>
                            ))}
                          </ul>
                        )}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                          Advisory only — AI never decides alone that a citizen is safe or in danger.
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4">
                        No AI summary generated yet. Click &ldquo;Generate AI Triage&rdquo; for a Gemini-assisted risk breakdown, or dispatch directly below.
                      </div>
                    )}
                  </div>
                </div>

                {/* Responder Assignment & Nearest Regional Station Coordination */}
                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Assign Verified Responder
                    </div>
                    <div className="space-y-2">
                      {state.responders
                        .filter((r) => r.city === selectedIncident.city || r.status === 'available')
                        .slice(0, 4)
                        .map((resp) => {
                          const isAssigned = selectedIncident.assignedResponderId === resp.id;
                          return (
                            <div
                              key={resp.id}
                              className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {resp.callSign} · {resp.name}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {resp.agency} · Avg {resp.avgResponseMinutes} min · {resp.status.replace('_', ' ')}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateIncident(selectedIncident.id, { assignedResponderId: resp.id })
                                }
                                disabled={isAssigned}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                                  isAssigned
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90'
                                }`}
                              >
                                {isAssigned ? 'Assigned' : 'Dispatch Unit'}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Regional Control Room Coordination (Police / Fire / Hospital) */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Nearest Station Coordination (Data-Minimized)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onUpdateIncident(selectedIncident.id, { notifyAgency: 'police' })}
                          className="px-2.5 py-1 text-[11px] font-medium border border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 whitespace-nowrap cursor-pointer"
                        >
                          + Police 15
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIncident(selectedIncident.id, { notifyAgency: 'hospital' })}
                          className="px-2.5 py-1 text-[11px] font-medium border border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40 whitespace-nowrap cursor-pointer"
                        >
                          + Hospital
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIncident(selectedIncident.id, { notifyAgency: 'fire' })}
                          className="px-2.5 py-1 text-[11px] font-medium border border-orange-200 text-orange-700 dark:border-orange-800 dark:text-orange-300 rounded hover:bg-orange-50 dark:hover:bg-orange-950/40 whitespace-nowrap cursor-pointer"
                        >
                          + Fire 16
                        </button>
                      </div>
                    </div>

                    {selectedIncident.regionalDispatches.length === 0 ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-3">
                        No external station notified yet. Use the buttons above to transmit GPS &amp; threat category only to the nearest station.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {selectedIncident.regionalDispatches.map((disp) => (
                          <div
                            key={disp.stationId}
                            className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                              <span className="inline-flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                {disp.stationName}
                              </span>
                              <span className="font-mono tabular-nums text-slate-500">
                                {disp.distanceKm} km · {disp.acknowledgement}
                              </span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-300">
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">Shared:</span>{' '}
                              {disp.sharedFields.join(', ')}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400">
                              <span className="font-medium">Withheld:</span> {disp.withheldFields.join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Evidence Vault & Operator Notes */}
                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2.5">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Consent-Based Evidence Vault ({selectedIncident.evidence.length})
                    </div>
                    {selectedIncident.evidence.length === 0 ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        No audio/video evidence uploaded for this incident.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedIncident.evidence.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-start gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs"
                          >
                            <FileAudio className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-900 dark:text-white">
                                {ev.type.toUpperCase()} · {ev.durationSec ?? 0}s · {ev.status}
                              </div>
                              <div className="text-slate-600 dark:text-slate-300">{ev.summaryNote}</div>
                              <div className="font-mono text-[11px] text-slate-400 mt-0.5 truncate">
                                {ev.integrityHash} · {formatTime(ev.capturedAt)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Operator Log &amp; Notes
                    </div>
                    <form onSubmit={handleNoteSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add dispatch note or callback outcome..."
                        className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium rounded-lg hover:opacity-90 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Log
                      </button>
                    </form>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {selectedIncident.notes.map((n) => (
                        <div key={n.id} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-1.5">
                          <span className="font-semibold text-slate-900 dark:text-white">{n.author}</span>{' '}
                          <span className="text-slate-400">({n.role} · {formatTime(n.createdAt)})</span>
                          <div className="text-slate-600 dark:text-slate-300 mt-0.5">{n.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500 bg-white dark:bg-slate-900">
                Select an incident from the queue or trigger an SOS from the Mobile App tab to inspect live dispatch telemetry.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
