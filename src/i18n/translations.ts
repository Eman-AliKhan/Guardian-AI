import { LanguageCode } from '../types/guardian';

export interface MobileTranslation {
  dir: 'ltr' | 'rtl';
  appTitle: string;
  subtitle: string;
  sosButton: string;
  sosSub: string;
  silentSos: string;
  sendNow: string;
  cancelSos: string;
  audioGuardTitle: string;
  audioGuardOn: string;
  audioGuardOff: string;
  audioPromptTitle: string;
  audioPromptBody: string;
  imSafeBtn: string;
  needHelpBtn: string;
  fakeCall: string;
  quickExit: string;
  journeyStart: string;
  journeySafeArrival: string;
  reportTitle: string;
  offlineLabel: string;
  onlineLabel: string;
  queuedOnPhone: string;
  receivedByTeam: string;
  voicePromptAudioOn: string;
  voicePromptThreeCheck: string;
  voicePromptSosSent: string;
}

export const MOBILE_TRANSLATIONS: Record<LanguageCode, MobileTranslation> = {
  en: {
    dir: 'ltr',
    appTitle: 'Guardian AI Citizen',
    subtitle: 'Personal Safety & Travel Guard',
    sosButton: 'HOLD OR TAP SOS',
    sosSub: '3s cancel window · Nearest Police/1122',
    silentSos: 'Silent SOS (No sound)',
    sendNow: 'Send Immediately',
    cancelSos: 'Cancel (Safe)',
    audioGuardTitle: 'Travel Audio & Voice Guard',
    audioGuardOn: 'Active — Observing distress sounds & phrases',
    audioGuardOff: 'Disabled — Tap to enable while travelling',
    audioPromptTitle: 'Are you in an emergency?',
    audioPromptBody: 'Distress sound detected. Tap "I am safe" within 3 alerts or control room will be notified automatically.',
    imSafeBtn: 'I am NOT in emergency (Safe)',
    needHelpBtn: 'Escalate Now',
    fakeCall: 'Fake Call',
    quickExit: 'Quick Exit',
    journeyStart: 'Start Monitored Journey',
    journeySafeArrival: 'Confirm Safe Arrival',
    reportTitle: 'Report Assault, Abuse, Fire or Medical',
    offlineLabel: 'Offline Mode (SMS + Local Queue)',
    onlineLabel: 'Live Network Connected',
    queuedOnPhone: 'Queued on phone — awaiting network / SMS fallback',
    receivedByTeam: 'Received by response team',
    voicePromptAudioOn: 'Travel audio safety monitor enabled. Scream, glass shatter, and distress phrases are now observed.',
    voicePromptThreeCheck: 'Warning. Distress detected. Click you are not in emergency if you are safe, otherwise help will be alerted.',
    voicePromptSosSent: 'Emergency alert received by Guardian AI control room and nearest emergency station.',
  },
  ur: {
    dir: 'rtl',
    appTitle: 'گارڈین اے آئی',
    subtitle: 'ذاتی تحفظ اور ہنگامی مدد',
    sosButton: 'ہنگامی مدد (SOS)',
    sosSub: 'فوری پولیس 15 اور ریسکیو 1122 الرٹ',
    silentSos: 'خاموش ایمرجنسی الرٹ (بغیر آواز)',
    sendNow: 'فوری بھیجیں',
    cancelSos: 'منسوخ کریں (میں محفوظ ہوں)',
    audioGuardTitle: 'سفر کے دوران آڈیو اور آواز نگرانی',
    audioGuardOn: 'فعال — چیخ، شیشہ ٹوٹنے اور مدد کی آوازوں کی نگرانی جاری ہے',
    audioGuardOff: 'بند — سفر کے دوران آن کرنے کے لیے دبائیں',
    audioPromptTitle: 'کیا آپ خطرے میں ہیں؟',
    audioPromptBody: 'خطرے کی آواز محسوس ہوئی ہے۔ اگر آپ محفوظ ہیں تو "میں محفوظ ہوں" پر کلک کریں، ورنہ 3 انتباہ کے بعد کنٹرول روم کو اطلاع مل جائے گی۔',
    imSafeBtn: 'میں ایمرجنسی میں نہیں ہوں (محفوظ)',
    needHelpBtn: 'فوری مدد بھیجیں',
    fakeCall: 'جعلی کال',
    quickExit: 'فوری بند کریں',
    journeyStart: 'محفوظ سفر شروع کریں',
    journeySafeArrival: 'بخیر و عافیت پہنچنے کی تصدیق',
    reportTitle: 'تشدد، گھریلو بدسلوکی، آگ یا طبی ایمرجنسی رپورٹ کریں',
    offlineLabel: 'آف لائن موڈ (ایس ایم ایس بیک اپ)',
    onlineLabel: 'لائیو نیٹ ورک منسلک ہے',
    queuedOnPhone: 'فون میں محفوظ (قطار میں) — نیٹ ورک کا انتظار',
    receivedByTeam: 'ریسکیو ٹیم کو موصول ہو گیا',
    voicePromptAudioOn: 'سفر کے دوران آڈیو تحفظ آن کر دیا گیا ہے۔',
    voicePromptThreeCheck: 'انتباہ! خطرے کی آواز سنی گئی ہے۔ اگر آپ محفوظ ہیں تو بٹن دبائیں۔',
    voicePromptSosSent: 'آپ کا ہنگامی پیغام کنٹرول روم اور قریبی اسٹیشن کو بھیج دیا گیا ہے۔',
  },
  ps: {
    dir: 'ltr',
    appTitle: 'ګارډین اے آی',
    subtitle: 'شخصي خوندیتوب او بیړنۍ مرسته',
    sosButton: 'بیړنۍ مرسته (SOS)',
    sosSub: 'نږدې پولیسو 15 او ریسکیو 1122 ته خبر ورکول',
    silentSos: 'چوپه بیړنۍ اړیکه (بې غږه)',
    sendNow: 'سمدلاسه ولیږئ',
    cancelSos: 'لغوه کړئ (زه خوندي یم)',
    audioGuardTitle: 'د سفر غږیزه څارنه',
    audioGuardOn: 'فعال — د مرستې غږ او ماتېدو غږونه څارل کیږي',
    audioGuardOff: 'بند — د سفر پر مهال د فعالولو لپاره کلیک وکړئ',
    audioPromptTitle: 'آیا تاسو په خطر کې یاست؟',
    audioPromptBody: 'د خطر غږ واورېدل شو. که خوندي یاست، "زه خوندي یم" کلیک وکړئ که نه نو درې ځله وروسته به کنټرول خونې ته خبر ورکړل شي.',
    imSafeBtn: 'زه په خطر کې نه یم (خوندي)',
    needHelpBtn: 'سمدستي مرسته وغواړئ',
    fakeCall: 'جعلي زنګ',
    quickExit: 'چټک وتل',
    journeyStart: 'خوندي سفر پیل کړئ',
    journeySafeArrival: 'د خوندي رسېدو تصدیق',
    reportTitle: 'تاوتریخوالی، کورنی ظلم، اور یا طبي بیړني حالت راپور کړئ',
    offlineLabel: 'آفلاین حالت (د ایس ایم ایس بیک اپ)',
    onlineLabel: 'ژوندی شبکه وصل ده',
    queuedOnPhone: 'په تلیفون کې خوندي شوی — د شبکې انتظار',
    receivedByTeam: 'د مرستې ټیم ته ورسېد',
    voicePromptAudioOn: 'د سفر غږیز خوندیتوب فعال شو.',
    voicePromptThreeCheck: 'خبرداری! د خطر غږ واورېدل شو. که خوندي یاست کلیک وکړئ.',
    voicePromptSosSent: 'ستاسو بیړنی پیغام کنټرول خونې او نږدې مرکز ته ورسېد.',
  },
};
