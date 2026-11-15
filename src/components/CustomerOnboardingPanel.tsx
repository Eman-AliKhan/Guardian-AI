import React, { useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Droplets,
  LogIn,
  LogOut,
  MapPin,
  Phone,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from 'lucide-react';
import { PAKISTAN_CITY_HUBS } from '../data/pakistanSeed';
import {
  auth,
  isValidCnic,
  loadCitizenFromFirestore,
  normalizeCnic,
  saveCitizenToFirestore,
  signInWithGoogleCitizen,
  signOutCitizen,
} from '../lib/firebase';
import type { CitizenProfile } from '../types/guardian';
import { PWAInstallButton } from './PWAInstallButton';

interface CustomerOnboardingPanelProps {
  profile: CitizenProfile;
  onRegisterCitizen: (profile: Partial<CitizenProfile>) => Promise<void>;
  onCancelEdit?: () => void;
  isEditingExisting?: boolean;
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const CustomerOnboardingPanel: React.FC<CustomerOnboardingPanelProps> = ({
  profile,
  onRegisterCitizen,
  onCancelEdit,
  isEditingExisting = false,
}) => {
  const [step, setStep] = useState<'login' | 'details'>(
    profile.loggedIn || isEditingExisting ? 'details' : 'login'
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Mobile OTP Login state
  const [loginPhone, setLoginPhone] = useState(profile.phone || '+92 300 4128890');
  const [loginOtp, setLoginOtp] = useState('4829');
  const [otpSent, setOtpSent] = useState(false);

  // Full Customer Details Form state
  const [name, setName] = useState(profile.name || '');
  const [cnic, setCnic] = useState(profile.cnic || '');
  const [phone, setPhone] = useState(profile.phone || '+92 300 ');
  const [email, setEmail] = useState(profile.email || '');
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth || '1997-04-18');
  const [gender, setGender] = useState<CitizenProfile['gender']>(profile.gender || 'Female');
  const [bloodGroup, setBloodGroup] = useState(profile.bloodGroup || 'O+');
  const [allergies, setAllergies] = useState(profile.allergies || '');
  const [medicalConditions, setMedicalConditions] = useState(profile.medicalConditions || '');
  const [emergencyNotes, setEmergencyNotes] = useState(profile.emergencyNotes || '');
  const [city, setCity] = useState(profile.city || 'Lahore');
  const [area, setArea] = useState(profile.area || 'Gulberg III');
  const [street, setStreet] = useState(profile.street || 'Main Boulevard, Street 14');
  const [fullAddress, setFullAddress] = useState(profile.fullAddress || '');
  const [shareMedicalOnSos, setShareMedicalOnSos] = useState(profile.shareMedicalOnSos ?? true);
  const [firebaseUid, setFirebaseUid] = useState(profile.firebaseUid || '');
  const [authMethod, setAuthMethod] = useState<'google_firebase' | 'phone_otp'>(
    profile.authMethod || 'phone_otp'
  );

  // Primary emergency contact
  const firstContact = profile.contacts?.[0];
  const [contactName, setContactName] = useState(firstContact?.name || '');
  const [contactRelation, setContactRelation] = useState(firstContact?.relation || 'Family');
  const [contactPhone, setContactPhone] = useState(firstContact?.phone || '+92 321 ');

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const user = await signInWithGoogleCitizen();
      setFirebaseUid(user.uid);
      setAuthMethod('google_firebase');
      if (user.displayName && !name) setName(user.displayName);
      if (user.email) setEmail(user.email);

      const saved = await loadCitizenFromFirestore(user.uid);
      if (saved) {
        if (saved.name) setName(saved.name);
        if (saved.cnic) setCnic(saved.cnic);
        if (saved.phone) setPhone(saved.phone);
        if (saved.bloodGroup) setBloodGroup(saved.bloodGroup);
        if (saved.allergies) setAllergies(saved.allergies);
        if (saved.medicalConditions) setMedicalConditions(saved.medicalConditions);
        if (saved.emergencyNotes) setEmergencyNotes(saved.emergencyNotes);
        if (saved.dateOfBirth) setDateOfBirth(saved.dateOfBirth);
        if (saved.gender) setGender(saved.gender);
        if (saved.city) setCity(saved.city);
        if (saved.area) setArea(saved.area);
        if (saved.street) setStreet(saved.street);
        if (saved.fullAddress) setFullAddress(saved.fullAddress);
      }
      setStep('details');
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Google sign-in popup was closed or blocked. You can also sign in with Mobile OTP below.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setAuthError(null);
    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: loginPhone }),
    });
    if (!res.ok) {
      setAuthError('Enter a valid Pakistani phone number (+92 3XX XXXXXXX).');
      return;
    }
    setOtpSent(true);
    setPhone(loginPhone);
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, otp: loginOtp }),
      });
      if (!res.ok) {
        const d = await res.json();
        setAuthError(d.error || 'Invalid OTP. Use 4829 for demo login.');
        return;
      }
      setPhone(loginPhone);
      setAuthMethod('phone_otp');
      setStep('details');
    } catch {
      setAuthError('Network error verifying phone OTP.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (auth.currentUser) {
      await signOutCitizen();
    }
    setFirebaseUid('');
    await onRegisterCitizen({ loggedIn: false, profileCompleted: false });
    setStep('login');
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSaveSuccess(null);

    if (name.trim().length < 2) {
      setAuthError('Please enter your full name.');
      return;
    }
    const formattedCnic = normalizeCnic(cnic);
    if (!isValidCnic(formattedCnic)) {
      setAuthError('Please enter a valid 13-digit CNIC (format: 35202-1234567-1).');
      return;
    }
    if (phone.trim().length < 10) {
      setAuthError('Please enter a valid mobile number.');
      return;
    }

    const computedAddress =
      fullAddress.trim() || `${street.trim()}, ${area.trim()}, ${city.trim()}`;

    const updatedContacts = [...(profile.contacts || [])];
    if (contactName.trim() && contactPhone.trim()) {
      const primary = {
        id: firstContact?.id || `tc-${Date.now()}`,
        name: contactName.trim(),
        relation: contactRelation.trim() || 'Family',
        phone: contactPhone.trim(),
        priority: 1 as const,
        canViewMedical: true,
      };
      if (updatedContacts.length > 0) {
        updatedContacts[0] = primary;
      } else {
        updatedContacts.push(primary);
      }
    }

    const nextProfile: CitizenProfile = {
      ...profile,
      id: firebaseUid ? `cit-${firebaseUid.slice(0, 10)}` : profile.id,
      firebaseUid: firebaseUid || profile.firebaseUid,
      authMethod,
      name: name.trim(),
      cnic: formattedCnic,
      phone: phone.trim(),
      email: email.trim() || undefined,
      dateOfBirth,
      gender,
      bloodGroup,
      allergies: allergies.trim(),
      medicalConditions: medicalConditions.trim(),
      emergencyNotes: emergencyNotes.trim(),
      city,
      area: area.trim(),
      street: street.trim(),
      fullAddress: computedAddress,
      shareMedicalOnSos,
      verified: true,
      loggedIn: true,
      profileCompleted: true,
      contacts: updatedContacts,
    };

    setSaveLoading(true);
    try {
      // Persist to Firestore if authenticated via Firebase Google Auth
      if (auth.currentUser && auth.currentUser.uid === (firebaseUid || auth.currentUser.uid)) {
        await saveCitizenToFirestore(auth.currentUser.uid, nextProfile);
      }

      // Sync live to Express + WebSocket Control Room
      await onRegisterCitizen(nextProfile);
      setSaveSuccess('Your CNIC, blood group & profile are now live on the Guardian AI Control Room!');
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Could not sync profile. Please try again.'
      );
    } finally {
      setSaveLoading(false);
    }
  };

  if (step === 'login') {
    return (
      <div className="max-w-lg mx-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-red-600">
              GuardAI Citizen App
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              Sign In &amp; Register Safety Profile
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Download the Citizen App on your device, sign in, and enter your CNIC, blood group, and emergency details so the Guardian AI Control Room can assist you immediately.
            </p>
          </div>
          <Smartphone className="w-6 h-6 text-red-600 shrink-0" />
        </div>

        {/* Download App Strip */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-700 dark:text-slate-200">
            <div className="font-semibold">Step 1: Install GuardAI on Your Phone</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Works offline with SOS queue &amp; instant GPS sync
            </div>
          </div>
          <PWAInstallButton compact />
        </div>

        {authError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            {authError}
          </div>
        )}

        {/* Google Firebase Auth */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Step 2: Customer Login
          </div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            {authLoading ? 'Signing in...' : 'Sign in with Google (Syncs to Cloud)'}
          </button>
        </div>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
          <span className="px-3 text-[11px] text-slate-400 uppercase">or Mobile OTP</span>
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
        </div>

        {/* Phone OTP Login */}
        <form onSubmit={handlePhoneLogin} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
              placeholder="+92 300 4128890"
              className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={handleSendOtp}
              className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              {otpSent ? 'Resend OTP' : 'Send OTP'}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={loginOtp}
              onChange={(e) => setLoginOtp(e.target.value)}
              placeholder="OTP (4829)"
              className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
            <button
              type="submit"
              disabled={authLoading}
              className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl whitespace-nowrap cursor-pointer"
            >
              Verify &amp; Continue
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Demo SMS OTP code: <span className="font-mono font-semibold">4829</span>
          </p>
        </form>
      </div>
    );
  }

  const cnicValid = isValidCnic(normalizeCnic(cnic));

  return (
    <form
      onSubmit={handleSaveDetails}
      className="max-w-2xl mx-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <UserCheck className="w-4 h-4" />
            <span>
              Logged In ({authMethod === 'google_firebase' ? 'Google Verified' : 'Mobile OTP Verified'})
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            Enter CNIC, Blood Group &amp; Emergency Details
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Everything you save here is displayed live on the GuardAI Control Room so operators and Rescue 1122 / Police 15 have your exact identity and medical needs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onCancelEdit && profile.profileCompleted && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Back to App
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Switch User
          </button>
        </div>
      </div>

      {authError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          {authError}
        </div>
      )}

      {saveSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Identity & CNIC */}
      <div className="space-y-3">
        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <CreditCard className="w-4 h-4 text-slate-500" />
          <span>1. Identity &amp; CNIC</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ayesha Khan"
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">
              CNIC Number (13 digits) *{' '}
              <span className={cnicValid ? 'text-emerald-600' : 'text-amber-600'}>
                {cnicValid ? '· Valid' : '· XXXXX-XXXXXXX-X'}
              </span>
            </label>
            <input
              type="text"
              required
              value={cnic}
              onChange={(e) => setCnic(normalizeCnic(e.target.value))}
              placeholder="35202-1234567-1"
              maxLength={15}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Mobile Number *</label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+92 300 4128890"
              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as CitizenProfile['gender'])}
                className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Blood Group & Medical Info */}
      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <Droplets className="w-4 h-4 text-red-600" />
          <span>2. Blood Group &amp; Medical Details</span>
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-500 block mb-1.5">
            Select Blood Group *
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {BLOOD_GROUPS.map((bg) => (
              <button
                key={bg}
                type="button"
                onClick={() => setBloodGroup(bg)}
                className={`py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                  bloodGroup === bg
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100'
                }`}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Allergies</label>
            <input
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. Penicillin, Peanuts, None"
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">
              Medical Conditions / Medications
            </label>
            <input
              type="text"
              value={medicalConditions}
              onChange={(e) => setMedicalConditions(e.target.value)}
              placeholder="e.g. Asthma, Diabetes, Hypertension"
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-slate-500 block mb-1">
            Emergency Instructions for Control Room / Rescue 1122
          </label>
          <input
            type="text"
            value={emergencyNotes}
            onChange={(e) => setEmergencyNotes(e.target.value)}
            placeholder="e.g. Carries asthma inhaler, call father first"
            className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
          />
        </div>
      </div>

      {/* Location & Address */}
      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-slate-500" />
          <span>3. City, Area, Street &amp; Full Address</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">City *</label>
            <select
              value={city}
              onChange={(e) => {
                const nextCity = e.target.value;
                setCity(nextCity);
                const firstArea = PAKISTAN_CITY_HUBS[nextCity]?.areas[0];
                if (firstArea) setArea(firstArea);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            >
              {Object.keys(PAKISTAN_CITY_HUBS).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Area / Sector *</label>
            <input
              type="text"
              required
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Gulberg III"
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Street / Lane *</label>
            <input
              type="text"
              required
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Street 14, Main Boulevard"
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-slate-500 block mb-1">
            Full House / Apartment Address *
          </label>
          <input
            type="text"
            required
            value={fullAddress}
            onChange={(e) => setFullAddress(e.target.value)}
            placeholder="House 24-B, Street 14, Main Boulevard, Gulberg III, Lahore"
            className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
          />
        </div>
      </div>

      {/* Primary Trusted Contact */}
      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <Phone className="w-4 h-4 text-slate-500" />
          <span>4. Primary Emergency Contact</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contact Full Name"
            className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
          />
          <input
            type="text"
            value={contactRelation}
            onChange={(e) => setContactRelation(e.target.value)}
            placeholder="Relation (Parent/Spouse)"
            className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
          />
          <input
            type="text"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+92 321 4401922"
            className="px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800"
          />
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
        <input
          type="checkbox"
          checked={shareMedicalOnSos}
          onChange={(e) => setShareMedicalOnSos(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Consent to share my CNIC, blood group, allergies, medical conditions, and residential address with the GuardAI Control Room and nearest Police 15 / Rescue 1122 / Fire 16 during alerts.
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={saveLoading}
          className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          {saveLoading ? 'Syncing to Control Room...' : 'Save & Sync Live to GuardAI Control Room'}
        </button>
      </div>
    </form>
  );
};
