import React, { useState } from 'react';
import { Lock, Shield, Users } from 'lucide-react';
import type { GuardianStateSnapshot, OperatorAccount } from '../types/guardian';

interface GovernanceArchitectureViewProps {
  state: GuardianStateSnapshot;
}

export const GovernanceArchitectureView: React.FC<GovernanceArchitectureViewProps> = ({ state }) => {
  const [activeOperatorId, setActiveOperatorId] = useState<string>(state.operators[0]?.id || 'op-1');
  const activeOperator: OperatorAccount | undefined = state.operators.find(
    (o) => o.id === activeOperatorId
  );

  return (
    <div className="space-y-8">
      {/* Honest Operational Principles & Guardrails */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Core Safety, Privacy &amp; Reliability Principles
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-xs leading-relaxed">
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-white">1. Reliability Over Complexity</div>
            <p className="text-slate-600 dark:text-slate-300">
              A simple SOS reaching a staffed control room always takes precedence over advanced AI. Offline queues and SMS fallback preserve delivery when mobile data drops.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-white">2. Human-in-the-Loop AI</div>
            <p className="text-slate-600 dark:text-slate-300">
              AI models assist with triage summaries, risk scoring, and acoustic detection, but never decide alone that a user is safe or in danger.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-white">3. Consent &amp; Data Minimization</div>
            <p className="text-slate-600 dark:text-slate-300">
              Audio travel monitoring has an explicit enable/disable toggle. Police 15, Fire 16, and Hospitals receive only necessary GPS &amp; emergency category data.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-white">4. Honest Limitations</div>
            <p className="text-slate-600 dark:text-slate-300">
              No mobile app alone can guarantee physical rescue. Guardian AI acts as a rapid-coordination force multiplier for citizens, trusted circles, and responders.
            </p>
          </div>
        </div>
      </div>

      {/* Operator RBAC & Regional Control Rooms */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              Operator Roles &amp; Regional Access Control
            </h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {state.operators.map((op) => {
              const selected = op.id === activeOperatorId;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setActiveOperatorId(op.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    selected ? 'bg-slate-100 dark:bg-slate-800/80' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">{op.name}</span>
                    <span className="font-mono text-slate-500 uppercase">{op.role.replace('_', ' ')}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{op.region}</div>
                </button>
              );
            })}
          </div>
          {activeOperator && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div className="font-semibold text-slate-900 dark:text-white">
                Active Permissions for {activeOperator.name}
              </div>
              <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                {activeOperator.permissions.join(' · ')}
              </div>
            </div>
          )}
        </div>

        {/* Security & Retention Policy */}
        <div className="lg:col-span-6 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500" />
            Security, Retention &amp; Architecture Controls
          </h3>
          <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span>Transport &amp; Storage Encryption</span>
              <span className="font-mono font-medium text-slate-900 dark:text-white">TLS 1.3 · AES-256-GCM</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span>Session Expiry &amp; OTP Protection</span>
              <span className="font-mono font-medium text-slate-900 dark:text-white">15-min Operator JWT · Rate-limited OTP</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span>Evidence Retention Policy</span>
              <span className="font-mono font-medium text-slate-900 dark:text-white">90 days (legal hold on escalation)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span>Spatial &amp; Real-Time Stack</span>
              <span className="font-mono font-medium text-slate-900 dark:text-white">REST + WebSockets + Geo-Routing</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Anti-Abuse &amp; Fake SOS Guard</span>
              <span className="font-mono font-medium text-slate-900 dark:text-white">3-Prompt Check + Human Audit</span>
            </div>
          </div>
        </div>
      </div>

      {/* Immutable Audit Log */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            System &amp; Operator Audit Trail
          </h3>
          <span className="text-xs font-mono text-slate-500">{state.auditLogs.length} entries</span>
        </div>
        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800 sticky top-0">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Time</th>
                <th className="py-2.5 px-4 font-semibold">Actor</th>
                <th className="py-2.5 px-4 font-semibold">Action</th>
                <th className="py-2.5 px-4 font-semibold">Target</th>
                <th className="py-2.5 px-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {state.auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                    {log.actor} <span className="text-slate-400 font-normal">({log.role})</span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-900 dark:text-white whitespace-nowrap">
                    {log.targetId}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
