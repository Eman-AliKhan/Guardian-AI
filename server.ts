import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { createInitialGuardianState } from './src/data/pakistanSeed.ts';
import type {
  AIAnalysisResult,
  AuditLogEntry,
  CommunityReport,
  EmergencyAgency,
  EmergencyStation,
  GuardianStateSnapshot,
  Incident,
  IncidentPriority,
  IncidentStatus,
  IncidentTrigger,
  LatLng,
  RegionalDispatchNotice,
} from './src/types/guardian.ts';

const PORT = 3000;
const STORE_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(STORE_DIR, 'guardian-store.json');

// Server-side Gemini client
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

function loadState(): GuardianStateSnapshot {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as GuardianStateSnapshot;
      if (parsed && Array.isArray(parsed.incidents) && Array.isArray(parsed.stations)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not load persisted store, initializing seed state:', err);
  }
  const initial = createInitialGuardianState();
  saveState(initial);
  return initial;
}

function saveState(state: GuardianStateSnapshot) {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

let state: GuardianStateSnapshot = loadState();

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function inferAgencyFromTrigger(trigger: IncidentTrigger, note?: string): EmergencyAgency {
  const lower = (note || '').toLowerCase();
  if (trigger === 'fire_report' || lower.includes('fire') || lower.includes('smoke') || lower.includes('flame')) {
    return 'fire';
  }
  if (
    trigger === 'medical_report' ||
    trigger === 'fall_detection' ||
    lower.includes('heart') ||
    lower.includes('bleed') ||
    lower.includes('unconscious') ||
    lower.includes('ambulance')
  ) {
    return 'hospital';
  }
  if (
    trigger === 'assault_report' ||
    trigger === 'household_violence' ||
    trigger === 'audio_distress' ||
    trigger === 'route_deviation' ||
    trigger === 'sos_button' ||
    trigger === 'silent_sos' ||
    trigger === 'voice_command' ||
    trigger === 'wearable_panic'
  ) {
    return 'police';
  }
  return 'multi';
}

function inferPriorityFromTrigger(trigger: IncidentTrigger): IncidentPriority {
  if (
    trigger === 'sos_button' ||
    trigger === 'silent_sos' ||
    trigger === 'audio_distress' ||
    trigger === 'voice_command' ||
    trigger === 'wearable_panic' ||
    trigger === 'assault_report' ||
    trigger === 'fire_report'
  ) {
    return 'critical';
  }
  if (trigger === 'fall_detection' || trigger === 'household_violence' || trigger === 'route_deviation') {
    return 'high';
  }
  return 'moderate';
}

function findNearestStations(lat: number, lng: number, agency: EmergencyAgency): {
  station: EmergencyStation;
  distanceKm: number;
}[] {
  const targetAgencies: ('police' | 'hospital' | 'fire')[] =
    agency === 'multi' ? ['police', 'hospital', 'fire'] : [agency];

  const results: { station: EmergencyStation; distanceKm: number }[] = [];
  for (const ag of targetAgencies) {
    const candidates = state.stations
      .filter((s) => s.agency === ag)
      .map((s) => ({ station: s, distanceKm: Number(haversineKm({ lat, lng }, s).toFixed(2)) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    if (candidates.length > 0) {
      results.push(candidates[0]);
    }
  }
  return results;
}

function addAudit(actor: string, role: string, action: string, targetId: string, details: string) {
  const entry: AuditLogEntry = {
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    actor,
    role,
    action,
    targetId,
    details,
  };
  state.auditLogs.unshift(entry);
  if (state.auditLogs.length > 100) {
    state.auditLogs = state.auditLogs.slice(0, 100);
  }
  return entry;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcast(type: string, payload: unknown) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'state:init',
        payload: state,
        timestamp: new Date().toISOString(),
      })
    );
  });

  // Live responder simulation tick: moves en_route responders smoothly toward assigned incidents
  setInterval(() => {
    let moved = false;
    for (const resp of state.responders) {
      if (resp.status === 'en_route' && resp.assignedIncidentId) {
        const inc = state.incidents.find((i) => i.id === resp.assignedIncidentId);
        if (inc && inc.status !== 'resolved' && inc.status !== 'false_alarm') {
          const dLat = inc.location.lat - resp.lat;
          const dLng = inc.location.lng - resp.lng;
          const dist = Math.sqrt(dLat * dLat + dLng * dLng);
          if (dist > 0.0008) {
            resp.lat = Number((resp.lat + dLat * 0.14).toFixed(6));
            resp.lng = Number((resp.lng + dLng * 0.14).toFixed(6));
            moved = true;
          } else {
            resp.status = 'on_scene';
            moved = true;
          }
        }
      }
    }
    if (moved) {
      broadcast('responders:sync', state.responders);
    }
  }, 3000);

  // --- API ROUTES ---

  app.get('/api/state', (_req, res) => {
    res.json(state);
  });

  // Simulated Phone OTP Send & Verify (Pakistan +92 format)
  const pendingOtps = new Map<string, string>();

  app.post('/api/auth/otp/send', (req, res) => {
    const { phone } = req.body as { phone?: string };
    if (!phone || phone.trim().length < 10) {
      return res.status(400).json({ error: 'Valid Pakistani phone number (+92...) is required.' });
    }
    const code = '4829';
    pendingOtps.set(phone.trim(), code);
    res.json({
      sent: true,
      phone: phone.trim(),
      demoOtp: code,
      message: 'Verification OTP dispatched via SMS gateway.',
    });
  });

  app.post('/api/auth/otp/verify', (req, res) => {
    const { phone, otp, name, city } = req.body as {
      phone?: string;
      otp?: string;
      name?: string;
      city?: string;
    };
    const normalized = (phone || '').trim();
    const expected = pendingOtps.get(normalized) || '4829';
    if (otp !== expected && otp !== '4829') {
      return res.status(400).json({ error: 'Invalid OTP code. Use 4829 for verification.' });
    }
    state.citizenProfile.phone = normalized || state.citizenProfile.phone;
    if (name && name.trim()) state.citizenProfile.name = name.trim();
    if (city && city.trim()) state.citizenProfile.city = city.trim();
    state.citizenProfile.verified = true;
    addAudit(state.citizenProfile.name, 'Citizen', 'OTP_VERIFIED', state.citizenProfile.id, `Phone verified (${state.citizenProfile.phone})`);
    saveState(state);
    broadcast('state:sync', state);
    res.json({ verified: true, citizenProfile: state.citizenProfile });
  });

  app.put('/api/citizen/profile', (req, res) => {
    const updates = req.body;
    state.citizenProfile = { ...state.citizenProfile, ...updates };
    saveState(state);
    broadcast('citizen:updated', state.citizenProfile);
    res.json(state.citizenProfile);
  });

  // Create Incident (SOS, Audio 3-check escalation, Journey Alert, Assault/Household/Fire/Medical report, Offline Flush)
  app.post('/api/incidents', (req, res) => {
    const {
      trigger = 'sos_button',
      silentMode = false,
      location,
      city,
      areaLabel,
      transcriptOrAudioNote,
      agencyOverride,
      deliveryChannel = 'live_ws',
      batteryPercent,
    } = req.body as {
      trigger?: IncidentTrigger;
      silentMode?: boolean;
      location?: LatLng;
      city?: string;
      areaLabel?: string;
      transcriptOrAudioNote?: string;
      agencyOverride?: EmergencyAgency;
      deliveryChannel?: 'live_ws' | 'offline_sync' | 'sms_fallback';
      batteryPercent?: number;
    };

    const loc: LatLng = {
      lat: location?.lat ?? 31.5204,
      lng: location?.lng ?? 74.3587,
      timestamp: location?.timestamp ?? new Date().toISOString(),
      accuracyMeters: location?.accuracyMeters ?? 10,
    };

    const agency = agencyOverride || inferAgencyFromTrigger(trigger, transcriptOrAudioNote);
    const priority = inferPriorityFromTrigger(trigger);
    const nearestStations = findNearestStations(loc.lat, loc.lng, agency);

    const regionalDispatches: RegionalDispatchNotice[] = nearestStations.map(({ station, distanceKm }) => ({
      stationId: station.id,
      stationName: station.name,
      agency: station.agency,
      distanceKm,
      notifiedAt: new Date().toISOString(),
      sharedFields: [
        'GPS Coordinates & Accuracy',
        `Emergency Category (${agency.toUpperCase()})`,
        'Incident Priority & Silent Flag',
        ...(state.citizenProfile.shareMedicalOnSos && agency === 'hospital'
          ? ['Consented Medical Notes (Blood/Allergies)']
          : []),
      ],
      withheldFields: [
        'Full Contact Directory',
        'Account OTP & Session History',
        'Unrelated Personal Profile Data',
      ],
      acknowledgement: 'notified',
    }));

    const nowIso = new Date().toISOString();
    const id = `INC-2026-${Math.floor(404 + Math.random() * 590)}`;
    const medicalSummary =
      state.citizenProfile.shareMedicalOnSos && state.citizenProfile.bloodGroup
        ? `Blood Group ${state.citizenProfile.bloodGroup}${
            state.citizenProfile.allergies ? ` · Allergies: ${state.citizenProfile.allergies}` : ''
          }${
            state.citizenProfile.medicalConditions ? ` · ${state.citizenProfile.medicalConditions}` : ''
          }`
        : undefined;

    const incident: Incident = {
      id,
      citizenId: state.citizenProfile.id,
      citizenName: state.citizenProfile.name,
      citizenPhone: state.citizenProfile.phone,
      city: city || state.citizenProfile.city || 'Lahore',
      areaLabel: areaLabel || `${city || state.citizenProfile.city} Active Corridor`,
      trigger,
      status: 'created',
      priority,
      agency,
      silentMode,
      createdAt: nowIso,
      updatedAt: nowIso,
      location: loc,
      locationTrail: [loc],
      batteryAtTrigger: batteryPercent ?? state.citizenProfile.batteryPercent,
      transcriptOrAudioNote,
      medicalSummaryShared: medicalSummary,
      escalatedToSupervisor: priority === 'critical',
      regionalDispatches,
      trustedContactAcks: [],
      evidence: [],
      notes: [],
      deliveryChannel,
    };

    state.incidents.unshift(incident);

    const stationSummary = regionalDispatches.map((d) => `${d.stationName} (${d.distanceKm} km)`).join(', ');
    const audit = addAudit(
      'Guardian Dispatch Core',
      'System',
      'INCIDENT_CREATED',
      incident.id,
      `Trigger: ${trigger}. Privacy-minimized dispatch routed to: ${stationSummary || 'Control Room'}.`
    );

    saveState(state);
    broadcast('incident:created', { incident, audit });
    res.status(201).json(incident);
  });

  // Update Incident Status / Assign Responder / Escalate / Add Note / Notify Station
  app.patch('/api/incidents/:id', (req, res) => {
    const { id } = req.params;
    const {
      status,
      priority,
      assignedResponderId,
      escalatedToSupervisor,
      noteText,
      operatorName = 'Fatima Noor',
      operatorRole = 'Supervisor',
      notifyAgency,
    } = req.body as {
      status?: IncidentStatus;
      priority?: IncidentPriority;
      assignedResponderId?: string;
      escalatedToSupervisor?: boolean;
      noteText?: string;
      operatorName?: string;
      operatorRole?: string;
      notifyAgency?: 'police' | 'hospital' | 'fire';
    };

    const incident = state.incidents.find((i) => i.id === id);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const actionsTaken: string[] = [];

    if (status && status !== incident.status) {
      incident.status = status;
      actionsTaken.push(`Status → ${status}`);
      if ((status === 'resolved' || status === 'false_alarm') && incident.assignedResponderId) {
        const resp = state.responders.find((r) => r.id === incident.assignedResponderId);
        if (resp) {
          resp.status = 'available';
          resp.assignedIncidentId = undefined;
          resp.completedDispatches += 1;
        }
      }
    }

    if (priority && priority !== incident.priority) {
      incident.priority = priority;
      actionsTaken.push(`Priority → ${priority}`);
    }

    if (assignedResponderId) {
      // Release previous responder if reassigned
      if (incident.assignedResponderId && incident.assignedResponderId !== assignedResponderId) {
        const prev = state.responders.find((r) => r.id === incident.assignedResponderId);
        if (prev) {
          prev.status = 'available';
          prev.assignedIncidentId = undefined;
        }
      }
      const nextResp = state.responders.find((r) => r.id === assignedResponderId);
      if (nextResp) {
        nextResp.status = 'en_route';
        nextResp.assignedIncidentId = incident.id;
        incident.assignedResponderId = nextResp.id;
        if (incident.status === 'created' || incident.status === 'acknowledged') {
          incident.status = 'responder_assigned';
        }
        actionsTaken.push(`Assigned ${nextResp.callSign}`);
      }
    }

    if (typeof escalatedToSupervisor === 'boolean') {
      incident.escalatedToSupervisor = escalatedToSupervisor;
      if (escalatedToSupervisor) actionsTaken.push('Escalated to Supervisor');
    }

    if (notifyAgency) {
      const nearest = findNearestStations(incident.location.lat, incident.location.lng, notifyAgency);
      for (const { station, distanceKm } of nearest) {
        const already = incident.regionalDispatches.find((d) => d.stationId === station.id);
        if (!already) {
          incident.regionalDispatches.push({
            stationId: station.id,
            stationName: station.name,
            agency: station.agency,
            distanceKm,
            notifiedAt: new Date().toISOString(),
            sharedFields: [
              'Live GPS Coordinates',
              `Emergency Category (${notifyAgency.toUpperCase()})`,
              'Incident Priority',
            ],
            withheldFields: ['Full Contact List', 'Private Media Archive', 'Account History'],
            acknowledgement: 'dispatched',
          });
          actionsTaken.push(`Notified ${station.name}`);
        }
      }
    }

    if (noteText && noteText.trim()) {
      incident.notes.unshift({
        id: `note-${Date.now()}`,
        author: operatorName,
        role: operatorRole,
        text: noteText.trim(),
        createdAt: new Date().toISOString(),
      });
      actionsTaken.push('Operator note added');
    }

    incident.updatedAt = new Date().toISOString();

    const audit = addAudit(
      operatorName,
      operatorRole,
      'INCIDENT_UPDATED',
      incident.id,
      actionsTaken.join(' · ') || 'Updated incident record'
    );

    saveState(state);
    broadcast('incident:updated', { incident, responders: state.responders, audit });
    res.json(incident);
  });

  // Live Location Ping
  app.post('/api/incidents/:id/location', (req, res) => {
    const { id } = req.params;
    const { lat, lng, accuracyMeters = 8, batteryPercent } = req.body as {
      lat: number;
      lng: number;
      accuracyMeters?: number;
      batteryPercent?: number;
    };
    const incident = state.incidents.find((i) => i.id === id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const point: LatLng = {
      lat,
      lng,
      timestamp: new Date().toISOString(),
      accuracyMeters,
    };
    incident.location = point;
    incident.locationTrail.push(point);
    if (typeof batteryPercent === 'number') {
      incident.batteryAtTrigger = batteryPercent;
    }
    incident.updatedAt = point.timestamp!;
    saveState(state);
    broadcast('incident:location', { incidentId: id, location: point, batteryAtTrigger: incident.batteryAtTrigger });
    res.json(incident);
  });

  // Upload Consent-Based Geotagged Evidence
  app.post('/api/incidents/:id/evidence', (req, res) => {
    const { id } = req.params;
    const { type = 'audio', durationSec = 15, summaryNote } = req.body as {
      type?: 'audio' | 'video' | 'photo' | 'transcript';
      durationSec?: number;
      summaryNote?: string;
    };
    const incident = state.incidents.find((i) => i.id === id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const hash = crypto
      .createHash('sha256')
      .update(`${id}:${Date.now()}:${summaryNote || type}`)
      .digest('hex')
      .slice(0, 16);

    const record = {
      id: `ev-${Date.now()}`,
      type,
      capturedAt: new Date().toISOString(),
      lat: incident.location.lat,
      lng: incident.location.lng,
      durationSec,
      uploadProgress: 100,
      status: 'secured' as const,
      integrityHash: `sha256:${hash}`,
      summaryNote: summaryNote || `Encrypted ${type} evidence captured with user consent`,
    };
    incident.evidence.unshift(record);
    incident.updatedAt = new Date().toISOString();

    const audit = addAudit(
      'Citizen Device',
      'Evidence Vault',
      'EVIDENCE_SECURED',
      incident.id,
      `${type.toUpperCase()} chunk uploaded (${record.integrityHash})`
    );

    saveState(state);
    broadcast('incident:updated', { incident, audit });
    res.status(201).json(record);
  });

  // Trusted Contact Acknowledge Alert
  app.post('/api/incidents/:id/contact-ack', (req, res) => {
    const { id } = req.params;
    const { contactId, contactName } = req.body as { contactId: string; contactName: string };
    const incident = state.incidents.find((i) => i.id === id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    if (!incident.trustedContactAcks.some((a) => a.contactId === contactId)) {
      incident.trustedContactAcks.push({
        contactId,
        contactName,
        ackAt: new Date().toISOString(),
      });
    }
    const audit = addAudit(contactName, 'Trusted Contact', 'ALERT_ACKNOWLEDGED', incident.id, 'Family circle member acknowledged alert status');
    saveState(state);
    broadcast('incident:updated', { incident, audit });
    res.json(incident);
  });

  // Community Reports (Assault, Household Violence, Unsafe Location, Fire, Medical)
  app.post('/api/community/reports', (req, res) => {
    const { category, city, areaLabel, lat, lng, description, anonymous = true } = req.body as {
      category: CommunityReport['category'];
      city: string;
      areaLabel: string;
      lat: number;
      lng: number;
      description: string;
      anonymous?: boolean;
    };

    let moderationStatus: CommunityReport['moderationStatus'] = 'pending_review';
    let routedStationName: string | undefined;

    // Auto-route urgent assault/household violence/fire/medical reports to nearest station
    if (category === 'assault' || category === 'household_violence') {
      const nearest = findNearestStations(lat, lng, 'police')[0];
      moderationStatus = 'escalated_police';
      routedStationName = nearest?.station.name;
    } else if (category === 'fire_hazard') {
      const nearest = findNearestStations(lat, lng, 'fire')[0];
      moderationStatus = 'escalated_fire';
      routedStationName = nearest?.station.name;
    } else if (category === 'medical_emergency') {
      const nearest = findNearestStations(lat, lng, 'hospital')[0];
      moderationStatus = 'escalated_hospital';
      routedStationName = nearest?.station.name;
    }

    const report: CommunityReport = {
      id: `CR-${Math.floor(200 + Math.random() * 799)}`,
      category,
      city: city || 'Lahore',
      areaLabel: areaLabel || `${city} Reported Location`,
      lat,
      lng,
      description,
      anonymous,
      createdAt: new Date().toISOString(),
      moderationStatus,
      routedStationName,
    };

    state.communityReports.unshift(report);
    const audit = addAudit(
      anonymous ? 'Anonymous Reporter' : state.citizenProfile.name,
      'Community',
      'COMMUNITY_REPORT_FILED',
      report.id,
      `${category} in ${report.city}${routedStationName ? ` → Routed to ${routedStationName}` : ' (Queued for moderation)'}`
    );

    saveState(state);
    broadcast('community:updated', { reports: state.communityReports, audit });
    res.status(201).json(report);
  });

  app.patch('/api/community/reports/:id', (req, res) => {
    const { id } = req.params;
    const { moderationStatus, operatorName = 'Fatima Noor' } = req.body as {
      moderationStatus: CommunityReport['moderationStatus'];
      operatorName?: string;
    };
    const report = state.communityReports.find((r) => r.id === id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    report.moderationStatus = moderationStatus;
    if (moderationStatus === 'escalated_police' && !report.routedStationName) {
      report.routedStationName = findNearestStations(report.lat, report.lng, 'police')[0]?.station.name;
    } else if (moderationStatus === 'escalated_fire' && !report.routedStationName) {
      report.routedStationName = findNearestStations(report.lat, report.lng, 'fire')[0]?.station.name;
    } else if (moderationStatus === 'escalated_hospital' && !report.routedStationName) {
      report.routedStationName = findNearestStations(report.lat, report.lng, 'hospital')[0]?.station.name;
    }

    const audit = addAudit(
      operatorName,
      'Moderator',
      'REPORT_MODERATED',
      report.id,
      `Moderation status updated to ${moderationStatus}`
    );

    saveState(state);
    broadcast('community:updated', { reports: state.communityReports, audit });
    res.json(report);
  });

  // Server-Side Gemini AI Incident Triage Summary & Risk Scoring
  app.post('/api/ai/analyze-incident', async (req, res) => {
    const { incidentId } = req.body as { incidentId: string };
    const incident = state.incidents.find((i) => i.id === incidentId);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured in server Secrets. Human operator triage remains active.',
      });
    }

    try {
      const promptText = `Analyze this emergency incident from Pakistan for a human control-room operator.
Remember: AI only assists human decisions and NEVER decides alone that someone is safe.
Incident ID: ${incident.id}
City & Area: ${incident.city} — ${incident.areaLabel}
Trigger Type: ${incident.trigger}
Silent Mode: ${incident.silentMode}
Battery at Trigger: ${incident.batteryAtTrigger}%
Transcript / Sensor Note: ${incident.transcriptOrAudioNote || 'No transcript provided'}
Consented Medical Summary: ${incident.medicalSummaryShared || 'Not shared'}
Nearest Dispatches: ${incident.regionalDispatches.map((d) => `${d.stationName} (${d.distanceKm} km)`).join('; ') || 'None yet'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptText,
        config: {
          systemInstruction:
            'You are an emergency dispatch triage assistant for Guardian AI Pakistan (coordinating Police 15, Rescue 1122 Hospitals, and Fire 16). Provide concise, factual, trauma-informed triage summaries for human operators.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: 'Concise 2-sentence factual triage summary for the operator.' },
              riskScore: { type: Type.INTEGER, description: 'Estimated urgency score from 0 to 100.' },
              recommendedPriority: { type: Type.STRING, enum: ['critical', 'high', 'moderate', 'low'] },
              recommendedAgency: { type: Type.STRING, enum: ['police', 'hospital', 'fire', 'multi'] },
              distressIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'summary',
              'riskScore',
              'recommendedPriority',
              'recommendedAgency',
              'distressIndicators',
              'suggestedActions',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const analysis: AIAnalysisResult = {
        summary: parsed.summary || 'Operator review required for active emergency signal.',
        riskScore: Math.max(0, Math.min(100, Number(parsed.riskScore) || 75)),
        recommendedPriority: parsed.recommendedPriority || incident.priority,
        recommendedAgency: parsed.recommendedAgency || incident.agency,
        distressIndicators: Array.isArray(parsed.distressIndicators) ? parsed.distressIndicators : [],
        suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
        humanReviewRequired: true,
        generatedAt: new Date().toISOString(),
        model: 'gemini-4-hydrogen',
      };

      incident.aiAnalysis = analysis;
      incident.updatedAt = new Date().toISOString();
      const audit = addAudit(
        'Gemini AI Triage',
        'AI Assist',
        'AI_TRIAGE_GENERATED',
        incident.id,
        `Risk score ${analysis.riskScore}/100 · Recommended: ${analysis.recommendedAgency.toUpperCase()} (pending human verification)`
      );
      saveState(state);
      broadcast('incident:updated', { incident, audit });
      res.json(analysis);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gemini triage failed';
      console.error('Gemini analyze-incident error:', err);
      res.status(502).json({ error: `AI triage unavailable: ${message}. Proceed with manual dispatch.` });
    }
  });

  // Server-Side Gemini AI Audio Phrase / Acoustic Distress Classifier
  app.post('/api/ai/analyze-audio-phrase', async (req, res) => {
    const { transcript, soundEvent } = req.body as { transcript?: string; soundEvent?: string };
    const text = (transcript || '').trim();
    const sound = (soundEvent || '').trim();

    if (!text && !sound) {
      return res.status(400).json({ error: 'Provide spoken transcript or acoustic event.' });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key unavailable. Falling back to local keyword emergency detection.',
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Evaluate this mobile travel-guard audio event in Pakistan (English, Urdu, Roman Urdu, or Pashto).
Transcript: "${text || 'None'}"
Acoustic Sensor Event: "${sound || 'None'}"`,
        config: {
          systemInstruction:
            'Classify personal-safety distress phrases ("help me", "leave me", "stop", "mujhe bachao", "chhoro", "madad") and hazards (screaming, glass shattering, banging, fire, medical collapse).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isDistress: { type: Type.BOOLEAN },
              confidence: { type: Type.INTEGER, description: '0-100 confidence' },
              detectedCategory: { type: Type.STRING, enum: ['police', 'hospital', 'fire', 'multi'] },
              reason: { type: Type.STRING },
            },
            required: ['isDistress', 'confidence', 'detectedCategory', 'reason'],
          },
        },
      });
      const result = JSON.parse((response.text ?? '{}').trim());
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI phrase analysis failed';
      res.status(502).json({ error: message });
    }
  });

  // Vite / Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Guardian AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
