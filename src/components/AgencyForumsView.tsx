import React, { useMemo, useState } from 'react';
import { Building2, Flame, HeartPulse, MapPin, MessageSquare, Send, Shield } from 'lucide-react';
import { PAKISTAN_CITY_HUBS } from '../data/pakistanSeed';
import type { AgencyForumPost, EmergencyStation, GuardianStateSnapshot } from '../types/guardian';

interface AgencyForumsViewProps {
  state: GuardianStateSnapshot;
  onPostForumReply: (payload: {
    stationId: string;
    message: string;
    author: string;
    role: string;
    statusTag: AgencyForumPost['statusTag'];
  }) => Promise<void>;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const AgencyForumsView: React.FC<AgencyForumsViewProps> = ({ state, onPostForumReply }) => {
  const [selectedCity, setSelectedCity] = useState<string>(state.citizenProfile.city || 'Lahore');
  const [selectedArea, setSelectedArea] = useState<string>(state.citizenProfile.area || '');
  const [streetQuery, setStreetQuery] = useState<string>(state.citizenProfile.street || '');
  const [agencyFilter, setAgencyFilter] = useState<'all' | 'police' | 'hospital' | 'fire'>('all');

  const [selectedStationId, setSelectedStationId] = useState<string>(
    state.stations[0]?.id || 'st-lhr-pol-1'
  );
  const [replyText, setReplyText] = useState('');
  const [replyAuthor, setReplyAuthor] = useState('SHO / Duty Officer');
  const [replyStatus, setReplyStatus] = useState<AgencyForumPost['statusTag']>('acknowledged');

  const cityHub = PAKISTAN_CITY_HUBS[selectedCity] || PAKISTAN_CITY_HUBS.Lahore;

  // City -> Area -> Street Hierarchical Availability Ranking
  const rankedStations = useMemo(() => {
    const normCity = selectedCity.toLowerCase();
    const normArea = selectedArea.trim().toLowerCase();
    const normStreet = streetQuery.trim().toLowerCase();

    return state.stations
      .filter((s) => (agencyFilter === 'all' ? true : s.agency === agencyFilter))
      .map((s) => {
        const sameCity = s.city.toLowerCase() === normCity;
        const sameArea = sameCity && normArea.length > 0 && s.area.toLowerCase().includes(normArea);
        const sameStreet =
          sameArea &&
          normStreet.length > 0 &&
          (s.street.toLowerCase().includes(normStreet) || normStreet.includes(s.street.toLowerCase()));
        const distKm = Number(haversineKm(cityHub, s).toFixed(2));

        let tierLabel = 'Regional';
        let weight = 300;
        if (sameStreet) {
          tierLabel = 'Street Match';
          weight = 0;
        } else if (sameArea) {
          tierLabel = 'Area / Sector Match';
          weight = 100;
        } else if (sameCity) {
          tierLabel = 'City Match';
          weight = 200;
        }

        return { station: s, tierLabel, distKm, weight: weight + distKm };
      })
      .sort((a, b) => a.weight - b.weight);
  }, [state.stations, selectedCity, selectedArea, streetQuery, agencyFilter, cityHub]);

  const activeStation: EmergencyStation | undefined =
    state.stations.find((s) => s.id === selectedStationId) || rankedStations[0]?.station;

  const filteredPosts = state.agencyForumPosts.filter((p) => {
    if (agencyFilter !== 'all' && p.agency !== agencyFilter) return false;
    if (selectedCity && p.city !== selectedCity) return false;
    return true;
  });

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStation || !replyText.trim()) return;
    await onPostForumReply({
      stationId: activeStation.id,
      message: replyText.trim(),
      author: replyAuthor.trim() || 'Duty Officer',
      role: `${activeStation.agency.toUpperCase()} Station Forum`,
      statusTag: replyStatus,
    });
    setReplyText('');
  };

  const renderAgencyBadge = (agency: 'police' | 'hospital' | 'fire') => {
    if (agency === 'fire') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 dark:text-orange-400">
          <Flame className="w-3.5 h-3.5" />
          Fire System 16
        </span>
      );
    }
    if (agency === 'hospital') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <HeartPulse className="w-3.5 h-3.5" />
          Hospital / 1122
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
        <Shield className="w-3.5 h-3.5" />
        Police Forum 15
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* City -> Area -> Street Hierarchical Proximity Search */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Nearby Available Units: City → Area → Street Lookup
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              GuardAI connects directly to nearby Police Station Forums, Hospitals (1122), and Fire Systems in priority order by City, Area/Sector, and Street.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['all', 'police', 'hospital', 'fire'] as const).map((ag) => (
              <button
                key={ag}
                type="button"
                onClick={() => setAgencyFilter(ag)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap cursor-pointer ${
                  agencyFilter === ag
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {ag === 'hospital' ? 'Hospitals' : ag === 'fire' ? 'Fire System' : ag}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">1. City</label>
            <select
              value={selectedCity}
              onChange={(e) => {
                const nextCity = e.target.value;
                setSelectedCity(nextCity);
                setSelectedArea(PAKISTAN_CITY_HUBS[nextCity]?.areas[0] || '');
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
            >
              {Object.keys(PAKISTAN_CITY_HUBS).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">2. Area / Sector</label>
            <input
              type="text"
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              placeholder="e.g. Gulberg III, Sector F-7, Clifton"
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">3. Street / Corridor</label>
            <input
              type="text"
              value={streetQuery}
              onChange={(e) => setStreetQuery(e.target.value)}
              placeholder="e.g. Main Boulevard, Liberty Chowk"
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Two-Column Split: Nearby Available Stations & Live Connected Forums */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Ranked City -> Area -> Street Station Availability */}
        <div className="xl:col-span-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Connected Stations &amp; Live Availability ({rankedStations.length})
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
            {rankedStations.map(({ station, tierLabel, distKm }) => {
              const isSelected = activeStation?.id === station.id;
              return (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => setSelectedStationId(station.id)}
                  className={`w-full text-left p-4 space-y-1.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800/80'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {renderAgencyBadge(station.agency)}
                    <span className="font-mono text-[11px] text-slate-500">
                      {tierLabel} · {distKm} km
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{station.name}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {station.city} → {station.area} → {station.street}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {station.capacityLabel}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{station.forumChannel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Connected Police / Hospital / Fire Station Forums */}
        <div className="xl:col-span-7 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-500" />
                Connected Agency Forums — {selectedCity}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time two-way dispatch forum linking GuardAI Working Team with Police Stations, Hospitals, and Fire Control.
              </p>
            </div>
          </div>

          {/* Post Reply as Station Officer or GuardAI Liaison */}
          {activeStation && (
            <form
              onSubmit={handleSubmitReply}
              className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Posting to: {activeStation.name} ({activeStation.forumChannel})
                </span>
                <select
                  value={replyStatus}
                  onChange={(e) => setReplyStatus(e.target.value as AgencyForumPost['statusTag'])}
                  className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                >
                  <option value="acknowledged">Status: Acknowledged</option>
                  <option value="dispatched">Status: Unit Dispatched</option>
                  <option value="on_scene">Status: Arrived On Scene</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={replyAuthor}
                  onChange={(e) => setReplyAuthor(e.target.value)}
                  placeholder="Officer / Operator Name"
                  className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                />
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Confirm patrol dispatch, ER bed, or fire tender ETA..."
                  className="sm:col-span-2 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Post to Station Forum
                </button>
              </div>
            </form>
          )}

          {/* Forum Feed */}
          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
            {filteredPosts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No forum dispatches yet for {selectedCity}. Trigger an SOS or report from /app to initiate live multi-agency dispatch.
              </div>
            ) : (
              filteredPosts.map((post) => (
                <div key={post.id} className="p-4 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {renderAgencyBadge(post.agency)}
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {post.stationName}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">
                      {post.statusTag.replace('_', ' ').toUpperCase()} ·{' '}
                      {new Date(post.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {post.city} → {post.area} → {post.street} · Posted by{' '}
                    <strong className="text-slate-700 dark:text-slate-200">{post.author}</strong> ({post.role})
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    {post.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
