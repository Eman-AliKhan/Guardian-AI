import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { CitizenProfile } from '../types/guardian';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function normalizeCnic(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function isValidCnic(cnic: string): boolean {
  return /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(cnic.trim());
}

function clampString(value: string | undefined, maxLen: number, fallback = ''): string {
  return (value ?? fallback).trim().slice(0, maxLen);
}

const ALLOWED_BLOOD_GROUPS = new Set([
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'Unknown',
]);

const ALLOWED_GENDERS = new Set(['Female', 'Male', 'Other', 'Prefer not to say']);

export async function signInWithGoogleCitizen(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signOutCitizen(): Promise<void> {
  await signOut(auth);
}

export async function loadCitizenFromFirestore(
  uid: string
): Promise<Partial<CitizenProfile> | null> {
  const publicPath = `citizens/${uid}`;
  const privatePath = `citizens/${uid}/private/pii`;
  try {
    const pubSnap = await getDoc(doc(db, 'citizens', uid));
    if (!pubSnap.exists()) return null;
    const pub = pubSnap.data();

    let pii: Record<string, unknown> = {};
    try {
      const piiSnap = await getDoc(doc(db, 'citizens', uid, 'private', 'pii'));
      if (piiSnap.exists()) {
        pii = piiSnap.data();
      }
    } catch (piiErr) {
      handleFirestoreError(piiErr, OperationType.GET, privatePath);
    }

    return {
      firebaseUid: uid,
      name: typeof pub.name === 'string' ? pub.name : undefined,
      city: typeof pub.city === 'string' ? pub.city : undefined,
      area: typeof pub.area === 'string' ? pub.area : undefined,
      verified: Boolean(pub.verified),
      language:
        pub.language === 'ur' || pub.language === 'ps' || pub.language === 'en'
          ? pub.language
          : 'en',
      silentSosDefault: Boolean(pub.silentSosDefault),
      cancelWindowSeconds:
        typeof pub.cancelWindowSeconds === 'number' ? pub.cancelWindowSeconds : 3,
      cnic: typeof pii.cnic === 'string' ? pii.cnic : '',
      phone: typeof pii.phone === 'string' ? pii.phone : '',
      street: typeof pii.street === 'string' ? pii.street : '',
      fullAddress: typeof pii.fullAddress === 'string' ? pii.fullAddress : '',
      bloodGroup: typeof pii.bloodGroup === 'string' ? pii.bloodGroup : 'O+',
      allergies: typeof pii.allergies === 'string' ? pii.allergies : '',
      medicalConditions: typeof pii.medicalConditions === 'string' ? pii.medicalConditions : '',
      emergencyNotes: typeof pii.emergencyNotes === 'string' ? pii.emergencyNotes : '',
      dateOfBirth: typeof pii.dateOfBirth === 'string' ? pii.dateOfBirth : '',
      gender:
        typeof pii.gender === 'string' && ALLOWED_GENDERS.has(pii.gender)
          ? (pii.gender as CitizenProfile['gender'])
          : 'Prefer not to say',
      shareMedicalOnSos: Boolean(pii.shareMedicalOnSos),
      profileCompleted: true,
      loggedIn: true,
      authMethod: 'google_firebase',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
  }
}

export async function saveCitizenToFirestore(
  uid: string,
  profile: CitizenProfile
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error('Must be signed in with matching Firebase account to persist to Firestore.');
  }

  const publicRef = doc(db, 'citizens', uid);
  const privateRef = doc(db, 'citizens', uid, 'private', 'pii');
  const publicPath = `citizens/${uid}`;
  const privatePath = `citizens/${uid}/private/pii`;

  const safeName = clampString(profile.name, 120, 'Citizen User');
  const safeCity = clampString(profile.city, 64, 'Lahore');
  const safeArea = clampString(profile.area, 120, 'Gulberg III');
  const safeStreet = clampString(profile.street, 160, 'Main Boulevard');
  const safeAddress = clampString(
    profile.fullAddress,
    300,
    `${safeStreet}, ${safeArea}, ${safeCity}`
  );
  const formattedCnic = normalizeCnic(profile.cnic || '');
  const safeCnic = isValidCnic(formattedCnic) ? formattedCnic : '35202-0000000-0';
  const safePhone = clampString(profile.phone, 24, '+92 300 0000000');
  const safeBlood = ALLOWED_BLOOD_GROUPS.has(profile.bloodGroup || '')
    ? (profile.bloodGroup as string)
    : 'Unknown';
  const safeGender = ALLOWED_GENDERS.has(profile.gender || '')
    ? (profile.gender as string)
    : 'Prefer not to say';
  const contactsSummary = (profile.contacts || [])
    .slice(0, 5)
    .map((c) => clampString(`${c.name} (${c.relation}): ${c.phone}`, 120))
    .filter((s) => s.length > 0);

  let publicExists = false;
  try {
    const snap = await getDoc(publicRef);
    publicExists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
  }

  try {
    if (!publicExists) {
      await setDoc(publicRef, {
        ownerId: uid,
        name: safeName.length >= 2 ? safeName : 'Citizen User',
        city: safeCity.length >= 2 ? safeCity : 'Lahore',
        area: safeArea.length >= 2 ? safeArea : 'Gulberg III',
        verified: Boolean(profile.verified),
        language: profile.language || 'en',
        silentSosDefault: Boolean(profile.silentSosDefault),
        cancelWindowSeconds: Math.min(15, Math.max(0, Math.round(profile.cancelWindowSeconds ?? 3))),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(publicRef, {
        name: safeName.length >= 2 ? safeName : 'Citizen User',
        city: safeCity.length >= 2 ? safeCity : 'Lahore',
        area: safeArea.length >= 2 ? safeArea : 'Gulberg III',
        verified: Boolean(profile.verified),
        language: profile.language || 'en',
        silentSosDefault: Boolean(profile.silentSosDefault),
        cancelWindowSeconds: Math.min(15, Math.max(0, Math.round(profile.cancelWindowSeconds ?? 3))),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      publicExists ? OperationType.UPDATE : OperationType.CREATE,
      publicPath
    );
  }

  let privateExists = false;
  try {
    const piiSnap = await getDoc(privateRef);
    privateExists = piiSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  const piiPayload = {
    cnic: safeCnic,
    phone: safePhone.length >= 7 ? safePhone : '+92 300 0000000',
    street: safeStreet.length >= 2 ? safeStreet : 'Main Boulevard',
    fullAddress: safeAddress.length >= 4 ? safeAddress : `${safeStreet}, ${safeArea}, ${safeCity}`,
    bloodGroup: safeBlood,
    allergies: clampString(profile.allergies, 240),
    medicalConditions: clampString(profile.medicalConditions, 240),
    emergencyNotes: clampString(profile.emergencyNotes, 300),
    dateOfBirth: clampString(profile.dateOfBirth, 32),
    gender: safeGender,
    shareMedicalOnSos: Boolean(profile.shareMedicalOnSos),
    contactsSummary,
  };

  try {
    if (!privateExists) {
      await setDoc(privateRef, {
        ownerId: uid,
        ...piiPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(privateRef, {
        ...piiPayload,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      privateExists ? OperationType.UPDATE : OperationType.CREATE,
      privatePath
    );
  }
}
