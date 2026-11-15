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
  AgencyForumPost,
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
      if (
        parsed &&
        Array.isArray(parsed.incidents) &&
        Array.isArray(parsed.stations) &&
        Array.isArray(parsed.agencyForumPosts) &&
        typeof parsed.citizenProfile?.fullAddress === 'string'
      ) {
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

function rankStationsHierarchical(
  lat: number,
  lng: number,
  city: string,
  area: string,
  street: string,
  agency: EmergencyAgency
): {
  station: EmergencyStation;
  distanceKm: number;
  proximityTier: 'same_street' | 'same_area' | 'same_city' | 'regional';
  score: number;
}[] {
  const targetAgencies: ('police' | 'hospital' | 'fire')[] =
    agency === 'multi' ? ['police', 'hospital', 'fire'] : [agency];

  const normCity = (city || '').trim().toLowerCase();
  const normArea = (area || '').trim().toLowerCase();
  const normStreet = (street || '').trim().toLowerCase();

  const results: {
    station: EmergencyStation;
    distanceKm: number;
    proximityTier: 'same_street' | 'same_area' | 'same_city' | 'regional';
    score: number;
  }[] = [];

  for (const ag of targetAgencies) {
    const candidates = state.stations
      .filter((s) => s.agency === ag)
      .map((s) => {
        const distanceKm = Number(haversineKm({ lat, lng }, s).toFixed(2));
        const sameCity = s.city.toLowerCase() === normCity;
        const sameArea = sameCity && normArea.length > 1 && s.area.toLowerCase().includes(normArea);
        const sameStreet =
          sameArea &&
          normStreet.length > 2 &&
          (s.street.toLowerCase().includes(normStreet) || normStreet.includes(s.street.toLowerCase()));

        let proximityTier: 'same_street' | 'same_area' | 'same_city' | 'regional' = 'regional';
        if (sameStreet || (sameCity && distanceKm <= 1.0)) proximityTier = 'same_street';
        else if (sameArea || (sameCity && distanceKm <= 3.5)) proximityTier = 'same_area';
        else if (sameCity) proximityTier = 'same_city';

        const tierWeight =
          proximityTier === 'same_street'
            ? 0
            : proximityTier === 'same_area'
              ? 100
              : proximityTier === 'same_city'
                ? 200
                : 500;
        const availabilityPenalty = s.availableUnits > 0 ? 0 : 1000;
        return {
          station: s,
          distanceKm,
          proximityTier,
          score: tierWeight + availabilityPenalty + distanceKm,
        };
      })
      .sort((a, b) => a.score - b.score);

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

function pushForumDispatchPost(
  station: EmergencyStation,
  distanceKm: number,
  proximityTier: string,
  message: string,
  opts: { incidentId?: string; reportId?: string }
): AgencyForumPost {
  const post: AgencyForumPost = {
    id: `fp-${Date.now()}-${Math.floor(Math.random() * 999)}`,
    agency: station.agency,
    stationId: station.id,
    stationName: station.name,
    city: station.city,
    area: station.area,
    street: station.street,
    incidentId: opts.incidentId,
    reportId: opts.reportId,
    author: 'GuardAI Dispatch Core',
    role: `${proximityTier.replace('_', ' ')} (${distanceKm} km)`,
    message,
    statusTag: 'alerted',
    createdAt: new Date().toISOString(),
  };
  state.agencyForumPosts.unshift(post);
  if (state.agencyForumPosts.length > 120) {
    state.agencyForumPosts = state.agencyForumPosts.slice(0, 120);
  }
  return post;
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

  // Hierarchical City -> Area -> Street Station Availability Lookup
  app.get('/api/stations/nearby', (req, res) => {
    const city = String(req.query.city || state.citizenProfile.city || 'Lahore');
    const area = String(req.query.area || state.citizenProfile.area || '');
    const street = String(req.query.street || state.citizenProfile.street || '');
    const lat = Number(req.query.lat || 31.5204);
    const lng = Number(req.query.lng || 74.3587);

    const ranked = (['police', 'hospital', 'fire'] as const).flatMap((ag) =>
      rankStationsHierarchical(lat, lng, city, area, street, ag)
    );
    res.json(ranked);
  });

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
    addAudit(
      state.citizenProfile.name,
      'Citizen',
      'OTP_VERIFIED',
      state.citizenProfile.id,
      `Phone verified (${state.citizenProfile.phone})`
    );
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

  // Create Incident with full Address (City/Area/Street), Phone, Profile & Auto-Posted Forum Dispatch
  app.post('/api/incidents', (req, res) => {
    const {
      trigger = 'sos_button',
      silentMode = false,
      location,
      city,
      area,
      street,
      fullAddress,
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
      area?: string;
      street?: string;
      fullAddress?: string;
      areaLabel?: string;
      transcriptOrAudioNote?: string;
      agencyOverride?: EmergencyAgency;
      deliveryChannel?: 'live_ws' | 'offline_sync' | 'sms_fallback';
      batteryPercent?: number;
    };

    const resolvedCity = city || state.citizenProfile.city || 'Lahore';
    const resolvedArea = area || state.citizenProfile.area || 'Gulberg III';
    const resolvedStreet = street || state.citizenProfile.street || 'Main Boulevard';
    const resolvedAddress =
      fullAddress ||
      state.citizenProfile.fullAddress ||
      `${resolvedStreet}, ${resolvedArea}, ${resolvedCity}`;

    const loc: LatLng = {
      lat: location?.lat ?? 31.5204,
      lng: location?.lng ?? 74.3587,
      timestamp: location?.timestamp ?? new Date().toISOString(),
      accuracyMeters: location?.accuracyMeters ?? 10,
    };

    const agency = agencyOverride || inferAgencyFromTrigger(trigger, transcriptOrAudioNote);
    const priority = inferPriorityFromTrigger(trigger);
    const nearestStations = rankStationsHierarchical(
      loc.lat,
      loc.lng,
      resolvedCity,
      resolvedArea,
      resolvedStreet,
      agency
    );

    const regionalDispatches: RegionalDispatchNotice[] = nearestStations.map(
      ({ station, distanceKm, proximityTier }) => ({
        stationId: station.id,
        stationName: station.name,
        agency: station.agency,
        city: station.city,
        area: station.area,
        street: station.street,
        distanceKm,
        proximityTier,
        notifiedAt: new Date().toISOString(),
        sharedFields: [
          `Address (${resolvedAddress})`,
          `Phone (${state.citizenProfile.phone})`,
          `GPS (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`,
          `Emergency Category (${agency.toUpperCase()})`,
          ...(state.citizenProfile.shareMedicalOnSos && state.citizenProfile.bloodGroup
            ? [`Medical (${state.citizenProfile.bloodGroup})`]
            : []),
        ],
        withheldFields: ['Account OTP & Session History', 'Unrelated Media Archive'],
        acknowledgement: 'notified',
      })
    );

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
      citizenAddress: resolvedAddress,
      city: resolvedCity,
      area: resolvedArea,
      street: resolvedStreet,
      areaLabel: areaLabel || `${resolvedStreet}, ${resolvedArea}`,
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
      trustedContactsSummary: state.citizenProfile.contacts.map((c) => ({
        name: c.name,
        phone: c.phone,
        relation: c.relation,
      })),
      escalatedToSupervisor: priority === 'critical',
      regionalDispatches,
      trustedContactAcks: [],
      evidence: [],
      notes: [],
      deliveryChannel,
    };

    state.incidents.unshift(incident);

    // Post automatically to connected Police / Hospital / Fire Forums
    const forumPosts: AgencyForumPost[] = [];
    for (const match of nearestStations) {
      const post = pushForumDispatchPost(
        match.station,
        match.distanceKm,
        match.proximityTier,
        `[${incident.id}] ${trigger.replace(/_/g, ' ').toUpperCase()} — Citizen: ${
          incident.citizenName
        } (${incident.citizenPhone}) · Address: ${incident.citizenAddress}. ${
          transcriptOrAudioNote || 'Immediate assistance requested.'
        }`,
        { incidentId: incident.id }
      );
      forumPosts.push(post);
    }

    const stationSummary = regionalDispatches
      .map((d) => `${d.stationName} [${d.proximityTier.replace('_', ' ')} · ${d.distanceKm} km]`)
      .join(', ');
    const audit = addAudit(
      'GuardAI Dispatch Core',
      'System',
      'INCIDENT_CREATED',
      incident.id,
      `Trigger: ${trigger}. Citizen ${incident.citizenName} (${incident.citizenPhone}) at ${incident.citizenAddress}. Routed to: ${
        stationSummary || 'Control Room'
      }.`
    );

    saveState(state);
    broadcast('incident:created', { incident, audit, forumPosts });
    res.status(201).json(incident);
  });

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
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const actionsTaken: string[] = [];
    const createdForumPosts: AgencyForumPost[] = [];

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
      const nearest = rankStationsHierarchical(
        incident.location.lat,
        incident.location.lng,
        incident.city,
        incident.area,
        incident.street,
        notifyAgency
      );
      for (const { station, distanceKm, proximityTier } of nearest) {
        const already = incident.regionalDispatches.find((d) => d.stationId === station.id);
        if (!already) {
          incident.regionalDispatches.push({
            stationId: station.id,
            stationName: station.name,
            agency: station.agency,
            city: station.city,
            area: station.area,
            street: station.street,
            distanceKm,
            proximityTier,
            notifiedAt: new Date().toISOString(),
            sharedFields: [
              `Address (${incident.citizenAddress})`,
              `Phone (${incident.citizenPhone})`,
              'Live GPS Coordinates',
              `Emergency Category (${notifyAgency.toUpperCase()})`,
            ],
            withheldFields: ['Account OTP History', 'Unrelated Media Archive'],
            acknowledgement: 'dispatched',
          });
          const post = pushForumDispatchPost(
            station,
            distanceKm,
            proximityTier,
            `[${incident.id}] GuardAI Escalation to ${station.name}: ${incident.citizenName} (${incident.citizenPhone}) at ${incident.citizenAddress}. Please confirm unit dispatch.`,
            { incidentId: incident.id }
          );
          createdForumPosts.push(post);
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
    broadcast('incident:updated', {
      incident,
      responders: state.responders,
      audit,
      forumPosts: createdForumPosts,
    });
    res.json(incident);
  });

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
    broadcast('incident:location', {
      incidentId: id,
      location: point,
      batteryAtTrigger: incident.batteryAtTrigger,
    });
    res.json(incident);
  });

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
    const audit = addAudit(
      contactName,
      'Trusted Contact',
      'ALERT_ACKNOWLEDGED',
      incident.id,
      'Family circle member acknowledged alert status'
    );
    saveState(state);
    broadcast('incident:updated', { incident, audit });
    res.json(incident);
  });

  // Community Reports with Address, Phone, Profile Data & Hierarchical Police/Fire/Hospital Routing
  app.post('/api/community/reports', (req, res) => {
    const {
      category,
      city,
      area,
      street,
      fullAddress,
      areaLabel,
      lat,
      lng,
      description,
      anonymous = false,
      shareProfileWithTeam = true,
    } = req.body as {
      category: CommunityReport['category'];
      city?: string;
      area?: string;
      street?: string;
      fullAddress?: string;
      areaLabel?: string;
      lat: number;
      lng: number;
      description: string;
      anonymous?: boolean;
      shareProfileWithTeam?: boolean;
    };

    const resolvedCity = city || state.citizenProfile.city || 'Lahore';
    const resolvedArea = area || state.citizenProfile.area || 'Gulberg III';
    const resolvedStreet = street || state.citizenProfile.street || 'Main Boulevard';
    const resolvedAddress =
      fullAddress ||
      state.citizenProfile.fullAddress ||
      `${resolvedStreet}, ${resolvedArea}, ${resolvedCity}`;

    let moderationStatus: CommunityReport['moderationStatus'] = 'pending_review';
    let routedStationName: string | undefined;
    const forumPosts: AgencyForumPost[] = [];

    const reportId = `CR-${Math.floor(200 + Math.random() * 799)}`;

    let targetAgency: 'police' | 'fire' | 'hospital' | null = null;
    if (category === 'assault' || category === 'household_violence') {
      moderationStatus = 'escalated_police';
      targetAgency = 'police';
    } else if (category === 'fire_hazard') {
      moderationStatus = 'escalated_fire';
      targetAgency = 'fire';
    } else if (category === 'medical_emergency') {
      moderationStatus = 'escalated_hospital';
      targetAgency = 'hospital';
    }

    if (targetAgency) {
      const match = rankStationsHierarchical(
        lat,
        lng,
        resolvedCity,
        resolvedArea,
        resolvedStreet,
        targetAgency
      )[0];
      if (match) {
        routedStationName = match.station.name;
        const contactInfo = shareProfileWithTeam
          ? `${state.citizenProfile.name} (${state.citizenProfile.phone}) at ${resolvedAddress}`
          : `Anonymous reporter at ${resolvedStreet}, ${resolvedArea}, ${resolvedCity}`;
        const post = pushForumDispatchPost(
          match.station,
          match.distanceKm,
          match.proximityTier,
          `[${reportId}] ${category.replace('_', ' ').toUpperCase()} — ${contactInfo}. Details: ${description}`,
          { reportId }
        );
        forumPosts.push(post);
      }
    }

    const report: CommunityReport = {
      id: reportId,
      category,
      city: resolvedCity,
      area: resolvedArea,
      street: resolvedStreet,
      areaLabel: areaLabel || `${resolvedStreet}, ${resolvedArea}`,
      fullAddress: shareProfileWithTeam ? resolvedAddress : undefined,
      lat,
      lng,
      description,
      anonymous,
      shareProfileWithTeam,
      reporterName: shareProfileWithTeam ? state.citizenProfile.name : undefined,
      reporterPhone: shareProfileWithTeam ? state.citizenProfile.phone : undefined,
      reporterBloodGroup:
        shareProfileWithTeam && state.citizenProfile.shareMedicalOnSos
          ? state.citizenProfile.bloodGroup
          : undefined,
      createdAt: new Date().toISOString(),
      moderationStatus,
      routedStationName,
    };

    state.communityReports.unshift(report);
    const audit = addAudit(
      shareProfileWithTeam ? state.citizenProfile.name : 'Anonymous Reporter',
      'Citizen App',
      'COMMUNITY_REPORT_FILED',
      report.id,
      `${category} at ${resolvedAddress}${routedStationName ? ` → Routed to ${routedStationName}` : ' (Queued for review)'}`
    );

    saveState(state);
    broadcast('community:updated', { reports: state.communityReports, audit, forumPosts });
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
    const forumPosts: AgencyForumPost[] = [];

    const agencyMap: Record<string, 'police' | 'fire' | 'hospital'> = {
      escalated_police: 'police',
      escalated_fire: 'fire',
      escalated_hospital: 'hospital',
    };
    const ag = agencyMap[moderationStatus];
    if (ag) {
      const match = rankStationsHierarchical(
        report.lat,
        report.lng,
        report.city,
        report.area,
        report.street,
        ag
      )[0];
      if (match) {
        report.routedStationName = match.station.name;
        const post = pushForumDispatchPost(
          match.station,
          match.distanceKm,
          match.proximityTier,
          `[${report.id}] GuardAI Team escalated ${report.category.replace('_', ' ')} at ${
            report.fullAddress || report.areaLabel
          }${report.reporterPhone ? ` (Phone: ${report.reporterPhone})` : ''}.`,
          { reportId: report.id }
        );
        forumPosts.push(post);
      }
    }

    const audit = addAudit(
      operatorName,
      'Moderator',
      'REPORT_MODERATED',
      report.id,
      `Moderation status updated to ${moderationStatus}`
    );

    saveState(state);
    broadcast('community:updated', { reports: state.communityReports, audit, forumPosts });
    res.json(report);
  });

  // Police / Hospital / Fire Station Forum Posts
  app.post('/api/forums/posts', (req, res) => {
    const { stationId, message, author, role, statusTag = 'acknowledged', incidentId, reportId } =
      req.body as {
        stationId: string;
        message: string;
        author: string;
        role: string;
        statusTag?: AgencyForumPost['statusTag'];
        incidentId?: string;
        reportId?: string;
      };

    const station = state.stations.find((s) => s.id === stationId);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    const post: AgencyForumPost = {
      id: `fp-${Date.now()}`,
      agency: station.agency,
      stationId: station.id,
      stationName: station.name,
      city: station.city,
      area: station.area,
      street: station.street,
      incidentId,
      reportId,
      author: author || `${station.name} Duty Officer`,
      role: role || `${station.agency.toUpperCase()} Forum Liaison`,
      message: message.trim(),
      statusTag,
      createdAt: new Date().toISOString(),
    };

    state.agencyForumPosts.unshift(post);
    const audit = addAudit(post.author, post.role, 'AGENCY_FORUM_REPLY', station.id, message.trim());
    saveState(state);
    broadcast('forum:posted', { post, audit });
    res.status(201).json(post);
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
Citizen: ${incident.citizenName} (${incident.citizenPhone})
Location: ${incident.citizenAddress} (${incident.city} -> ${incident.area} -> ${incident.street})
Trigger Type: ${incident.trigger}
Silent Mode: ${incident.silentMode}
Battery at Trigger: ${incident.batteryAtTrigger}%
Transcript / Sensor Note: ${incident.transcriptOrAudioNote || 'No transcript provided'}
Consented Medical Summary: ${incident.medicalSummaryShared || 'Not shared'}
Nearest Dispatches: ${incident.regionalDispatches.map((d) => `${d.stationName} (${d.distanceKm} km, ${d.proximityTier})`).join('; ') || 'None yet'}`;

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
