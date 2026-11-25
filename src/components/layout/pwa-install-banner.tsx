'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = '__ws_pwa_banner_dismissed';

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // ignore
    }

    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    if (isIos && isSafari) {
      setIsIosSafari(true);
      setVisible(true);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="lg:hidden print:hidden mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">
          Cài WebSchedule lên điện thoại
        </p>
        {isIosSafari ? (
          <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
            Nhấn <Share className="inline h-3.5 w-3.5 text-primary" /> rồi chọn{' '}
            <strong>Thêm vào MH chính</strong> để mở toàn màn hình như app.
          </p>
        ) : (
          <p className="text-muted-foreground mt-0.5">
            Mở nhanh từ màn hình chính, toàn màn hình như ứng dụng.
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isIosSafari && deferredPrompt && (
          <Button size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={handleInstall}>
            <Download className="h-3.5 w-3.5" />
            Cài app
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Đóng gợi ý cài ứng dụng"
          className="h-7 w-7 text-muted-foreground"
          onClick={dismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
