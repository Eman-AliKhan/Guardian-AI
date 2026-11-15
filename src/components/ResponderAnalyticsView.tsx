import React, { useState } from 'react';
import { Building2, Clock, Flame, HeartPulse, Shield, ShieldCheck } from 'lucide-react';
import type { GuardianStateSnapshot, ResponderUnit } from '../types/guardian';

interface ResponderAnalyticsViewProps {
  state: GuardianStateSnapshot;
}

export const ResponderAnalyticsView: React.FC<ResponderAnalyticsViewProps> = ({ state }) => {
  const [cityFilter, setCityFilter] = useState<string>('All');
  const [agencyFilter, setAgencyFilter] = useState<string>('all');

  const filteredResponders = state.responders.filter((r) => {
    if (cityFilter !== 'All' && r.city !== cityFilter) return false;
    if (agencyFilter !== 'all' && r.agency !== agencyFilter) return false;
    return true;
  });

  const filteredStations = state.stations.filter((s) => {
    if (cityFilter !== 'All' && s.city !== cityFilter) return false;
    if (agencyFilter !== 'all' && s.agency !== agencyFilter) return false;
    return true;
  });

  const avgResponse =
    state.responders.reduce((acc, r) => acc + r.avgResponseMinutes, 0) /
    Math.max(1, state.responders.length);
  const totalDispatches = state.responders.reduce((acc, r) => acc + r.completedDispatches, 0);
  const resolvedCount = state.incidents.filter((i) => i.status === 'resolved').length;
  const falseAlarmCount = state.incidents.filter((i) => i.status === 'false_alarm').length;

  const statusText = (s: ResponderUnit['status']) => {
    if (s === 'available') return 'Available';
    if (s === 'en_route') return 'En Route';
    if (s === 'on_scene') return 'On Scene';
    return 'Off Duty';
  };

  return (
    <div className="space-y-8">
      {/* Performance Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Mean Dispatch Response</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {avgResponse.toFixed(1)} min
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Verified Dispatches</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {totalDispatches}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Resolved Incidents</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {resolvedCount}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Confirmed False Alarms</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {falseAlarmCount}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          {['All', 'Lahore', 'Islamabad', 'Karachi', 'Peshawar'].map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => setCityFilter(city)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                cityFilter === city
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {city}
            </button>
          ))}
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
              {ag === 'hospital' ? 'Hospital / 1122' : ag}
            </button>
          ))}
        </div>
      </div>

      {/* Verified Responder Fleet Table */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Verified Responder Network &amp; Live Availability
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Call Sign &amp; Unit</th>
                <th className="py-3 px-4 font-semibold">Agency</th>
                <th className="py-3 px-4 font-semibold">City</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Avg Response</th>
                <th className="py-3 px-4 font-semibold text-right">Completed</th>
                <th className="py-3 px-4 font-semibold">Verification ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredResponders.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-white">{r.callSign}</div>
                    <div className="text-slate-500">{r.name}</div>
                  </td>
                  <td className="py-3 px-4 capitalize text-slate-700 dark:text-slate-300">{r.agency}</td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{r.city}</td>
                  <td className="py-3 px-4 font-medium">
                    <span
                      className={
                        r.status === 'available'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : r.status === 'en_route'
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-amber-700 dark:text-amber-400'
                      }
                    >
                      {statusText(r.status)}
                    </span>
                    {r.assignedIncidentId && (
                      <span className="ml-1.5 font-mono text-slate-400">({r.assignedIncidentId})</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                    {r.avgResponseMinutes.toFixed(1)} min
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                    {r.completedDispatches}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">{r.verifiedBadge}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regional Control Rooms & Station Coordination Points */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Regional Emergency Coordination Points (Police 15 · Hospitals / 1122 · Fire 16)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Stations do not hold citizen databases; they receive only minimized incident coordinates &amp; threat classification upon active emergency routing.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:gap-px bg-slate-200 dark:bg-slate-800">
          {filteredStations.map((st) => (
            <div key={st.id} className="bg-white dark:bg-slate-900 p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  {st.agency === 'police' ? (
                    <Shield className="w-3.5 h-3.5 text-blue-700" />
                  ) : st.agency === 'hospital' ? (
                    <HeartPulse className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Flame className="w-3.5 h-3.5 text-orange-600" />
                  )}
                  {st.agency.toUpperCase()}
                </span>
                <span className="text-slate-500">{st.city}</span>
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{st.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {st.district} · Hotline: <span className="font-mono text-slate-700 dark:text-slate-200">{st.phone}</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-400">
                {st.lat.toFixed(4)}, {st.lng.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
