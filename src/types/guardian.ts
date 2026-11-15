export type IncidentStatus =
  | 'created'
  | 'acknowledged'
  | 'responder_assigned'
  | 'resolved'
  | 'false_alarm';

export type IncidentPriority = 'critical' | 'high' | 'moderate' | 'low';

export type EmergencyAgency = 'police' | 'hospital' | 'fire' | 'multi';

export type IncidentTrigger =
  | 'sos_button'
  | 'silent_sos'
  | 'audio_distress'
  | 'voice_command'
  | 'fall_detection'
  | 'wearable_panic'
  | 'route_deviation'
  | 'unexpected_stop'
  | 'assault_report'
  | 'household_violence'
  | 'fire_report'
  | 'medical_report';

export type LanguageCode = 'en' | 'ur' | 'ps';

export interface LatLng {
  lat: number;
  lng: number;
  timestamp?: string;
  accuracyMeters?: number;
}

export interface TrustedContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  priority: 1 | 2 | 3;
  canViewMedical: boolean;
  acknowledgedAt?: string;
}

export interface CitizenProfile {
  id: string;
  name: string;
  phone: string;
  verified: boolean;
  city: string;
  area: string;
  street: string;
  fullAddress: string;
  language: LanguageCode;
  bloodGroup?: string;
  allergies?: string;
  medicalConditions?: string;
  shareMedicalOnSos: boolean;
  batteryPercent: number;
  silentSosDefault: boolean;
  cancelWindowSeconds: number;
  contacts: TrustedContact[];
}

export interface EmergencyStation {
  id: string;
  name: string;
  agency: 'police' | 'hospital' | 'fire';
  city: string;
  area: string;
  street: string;
  phone: string;
  lat: number;
  lng: number;
  district: string;
  availableUnits: number;
  capacityLabel: string;
  forumChannel: string;
}

export interface ResponderUnit {
  id: string;
  callSign: string;
  name: string;
  agency: 'police' | 'hospital' | 'fire' | 'verified_guard';
  city: string;
  area: string;
  street: string;
  status: 'available' | 'en_route' | 'on_scene' | 'off_duty';
  lat: number;
  lng: number;
  assignedIncidentId?: string;
  avgResponseMinutes: number;
  completedDispatches: number;
  verifiedBadge: string;
}

export interface EvidenceRecord {
  id: string;
  type: 'audio' | 'video' | 'photo' | 'transcript';
  capturedAt: string;
  lat: number;
  lng: number;
  durationSec?: number;
  uploadProgress: number;
  status: 'queued_local' | 'uploading' | 'secured';
  integrityHash: string;
  summaryNote: string;
}

export interface AIAnalysisResult {
  summary: string;
  riskScore: number;
  recommendedPriority: IncidentPriority;
  recommendedAgency: EmergencyAgency;
  distressIndicators: string[];
  suggestedActions: string[];
  humanReviewRequired: true;
  generatedAt: string;
  model: string;
}

export interface RegionalDispatchNotice {
  stationId: string;
  stationName: string;
  agency: 'police' | 'hospital' | 'fire';
  city: string;
  area: string;
  street: string;
  distanceKm: number;
  proximityTier: 'same_street' | 'same_area' | 'same_city' | 'regional';
  notifiedAt: string;
  sharedFields: string[];
  withheldFields: string[];
  acknowledgement: 'dispatched' | 'notified' | 'en_route';
}

export interface OperatorNote {
  id: string;
  author: string;
  role: string;
  text: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  citizenId: string;
  citizenName: string;
  citizenPhone: string;
  citizenAddress: string;
  city: string;
  area: string;
  street: string;
  areaLabel: string;
  trigger: IncidentTrigger;
  status: IncidentStatus;
  priority: IncidentPriority;
  agency: EmergencyAgency;
  silentMode: boolean;
  createdAt: string;
  updatedAt: string;
  location: LatLng;
  locationTrail: LatLng[];
  batteryAtTrigger: number;
  transcriptOrAudioNote?: string;
  medicalSummaryShared?: string;
  trustedContactsSummary?: { name: string; phone: string; relation: string }[];
  assignedResponderId?: string;
  escalatedToSupervisor: boolean;
  regionalDispatches: RegionalDispatchNotice[];
  trustedContactAcks: { contactId: string; contactName: string; ackAt: string }[];
  evidence: EvidenceRecord[];
  notes: OperatorNote[];
  aiAnalysis?: AIAnalysisResult;
  deliveryChannel: 'live_ws' | 'offline_sync' | 'sms_fallback';
}

export interface CommunityReport {
  id: string;
  category:
    | 'assault'
    | 'household_violence'
    | 'harassment'
    | 'unsafe_lighting'
    | 'fire_hazard'
    | 'medical_emergency';
  city: string;
  area: string;
  street: string;
  areaLabel: string;
  fullAddress?: string;
  lat: number;
  lng: number;
  description: string;
  anonymous: boolean;
  shareProfileWithTeam: boolean;
  reporterName?: string;
  reporterPhone?: string;
  reporterBloodGroup?: string;
  createdAt: string;
  moderationStatus:
    | 'pending_review'
    | 'verified_advisory'
    | 'escalated_police'
    | 'escalated_fire'
    | 'escalated_hospital'
    | 'dismissed';
  routedStationName?: string;
}

export interface AgencyForumPost {
  id: string;
  agency: 'police' | 'hospital' | 'fire';
  stationId: string;
  stationName: string;
  city: string;
  area: string;
  street: string;
  incidentId?: string;
  reportId?: string;
  author: string;
  role: string;
  message: string;
  statusTag: 'alerted' | 'acknowledged' | 'dispatched' | 'on_scene';
  createdAt: string;
}

export interface SafeZone {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  active: boolean;
}

export interface OperatorAccount {
  id: string;
  name: string;
  role: 'dispatcher' | 'supervisor' | 'police_liaison' | 'fire_liaison' | 'hospital_triage';
  region: string;
  permissions: string[];
  activeShift: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  targetId: string;
  details: string;
}

export interface OfflineQueuedSOS {
  localId: string;
  createdAt: string;
  trigger: IncidentTrigger;
  silentMode: boolean;
  location: LatLng;
  batteryPercent: number;
  transcriptOrAudioNote?: string;
  smsPayloadPreview: string;
  state: 'queued_on_phone' | 'syncing' | 'received_by_team';
}

export interface GuardianStateSnapshot {
  incidents: Incident[];
  responders: ResponderUnit[];
  stations: EmergencyStation[];
  communityReports: CommunityReport[];
  agencyForumPosts: AgencyForumPost[];
  safeZones: SafeZone[];
  citizenProfile: CitizenProfile;
  operators: OperatorAccount[];
  auditLogs: AuditLogEntry[];
}
