import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const citizenAppUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/app` : '/app';

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact
            ? 'px-3 py-1.5 text-xs bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90'
            : 'px-4 py-2 text-xs bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{isInstallable ? 'Install GuardAI App' : 'Download Citizen App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Download GuardAI Citizen App
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
                <p>To install GuardAI as a standalone app on iPhone / iPad:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Open <span className="font-mono font-semibold">{citizenAppUrl}</span> in Safari.
                  </li>
                  <li>
                    Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                  </li>
                  <li>
                    Scroll down and select <strong>Add to Home Screen</strong>.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2.5 leading-relaxed">
                <p>
                  GuardAI Citizen App is packaged as an installable Progressive Web App (PWA) with offline SOS queueing and standalone mobile launch:
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Open the standalone Citizen App URL directly in Chrome, Edge, or Android browser:
                  </li>
                  <li>
                    Click the browser address bar <strong>Install GuardAI</strong> icon (or menu → <em>Install app / Add to Home Screen</em>).
                  </li>
                  <li>
                    Keep the <strong>GuardAI Working Team Dashboard</strong> open separately at the main URL to receive live reports.
                  </li>
                </ol>
              </div>
            )}

            <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-mono break-all text-slate-700 dark:text-slate-200">
              {citizenAppUrl}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <a
                href="/app"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Launch Standalone /app
              </a>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
