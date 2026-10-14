import React, { useCallback, useEffect, useState } from 'react';
import { Download, X, Smartphone, Share, MoreVertical, MonitorDown, CheckCircle2 } from 'lucide-react';

const DISMISSED_KEY = 'hysmart:pwa-install-dismissed:v1';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getPlatform() {
  const ua = window.navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [visible, setVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platform] = useState(getPlatform);

  useEffect(() => {
    const dismissed = (() => { try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; } })();
    if (!isStandalone() && !dismissed) setVisible(true);

    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstalled(false);
      setVisible(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setHelpOpen(false);
      setInstallPrompt(null);
      try { localStorage.removeItem(DISMISSED_KEY); } catch {}
    };
    const onDisplayModeChange = () => {
      if (isStandalone()) onInstalled();
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    displayMode?.addEventListener?.('change', onDisplayModeChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      displayMode?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setHelpOpen(false);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt || busy) {
      setHelpOpen(true);
      return;
    }
    setBusy(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setVisible(false);
        setHelpOpen(false);
      }
      setInstallPrompt(null);
    } catch {
      setHelpOpen(true);
    } finally {
      setBusy(false);
    }
  }, [installPrompt, busy]);

  if (installed || !visible) return null;

  return <>
    <aside className="pwa-install-banner" aria-label="Install HySmart Build">
      <div className="pwa-install-mark"><Smartphone size={23} aria-hidden="true" /></div>
      <div className="pwa-install-copy">
        <strong>Install HySmart Build</strong>
        <span>Use it like an app from your home screen.</span>
      </div>
      <button type="button" className="pwa-install-action" onClick={install}>
        <Download size={16} aria-hidden="true" /> {installPrompt ? (busy ? 'Opening…' : 'Install') : 'How to install'}
      </button>
      <button type="button" className="pwa-install-dismiss" onClick={dismiss} aria-label="Dismiss install message" title="Not now"><X size={18}/></button>
    </aside>
    {helpOpen && <div className="pwa-help-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
      <section className="pwa-help-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-help-title">
        <div className="pwa-help-head">
          <div className="pwa-install-mark"><Smartphone size={22}/></div>
          <div><h2 id="pwa-help-title">Install HySmart Build</h2><p>Keep your construction workspace one tap away.</p></div>
          <button type="button" className="pwa-install-dismiss" onClick={() => setHelpOpen(false)} aria-label="Close install instructions"><X size={19}/></button>
        </div>
        {installPrompt ? <div className="pwa-help-step"><CheckCircle2/><p>Your browser supports installation. Tap <strong>Install</strong> below to open its native install prompt.</p></div> : platform === 'ios' ? <ol className="pwa-help-steps">
          <li><span><Share size={18}/></span><div><strong>Tap Share</strong><p>In Safari, tap the Share icon at the bottom of the screen.</p></div></li>
          <li><span><PlusFallback/></span><div><strong>Choose Add to Home Screen</strong><p>You may need to scroll through the Share menu to find this option.</p></div></li>
          <li><span><CheckCircle2 size={18}/></span><div><strong>Tap Add</strong><p>HySmart Build will appear on your home screen and open in its app-style window.</p></div></li>
        </ol> : platform === 'android' ? <ol className="pwa-help-steps">
          <li><span><MoreVertical size={18}/></span><div><strong>Open your browser menu</strong><p>In Chrome, tap the three dots in the top-right corner.</p></div></li>
          <li><span><Download size={18}/></span><div><strong>Tap Install app or Add to Home screen</strong><p>The exact label depends on your browser and device.</p></div></li>
          <li><span><CheckCircle2 size={18}/></span><div><strong>Confirm installation</strong><p>Open HySmart Build from the new home-screen icon.</p></div></li>
        </ol> : <ol className="pwa-help-steps">
          <li><span><MonitorDown size={18}/></span><div><strong>Use a supported browser</strong><p>In Chrome or Edge, look for the install icon in the address bar or choose Install this site as an app from the browser menu.</p></div></li>
          <li><span><CheckCircle2 size={18}/></span><div><strong>Confirm installation</strong><p>The app opens in its own window and can be launched from your apps list.</p></div></li>
        </ol>}
        <p className="pwa-help-note">Installation availability depends on your browser, HTTPS connection, manifest, and service-worker support. Your browser will always ask you to confirm.</p>
        <div className="pwa-help-actions"><button type="button" className="pwa-install-action" onClick={install}><Download size={16}/>{installPrompt ? 'Install app' : 'Check install option'}</button><button type="button" className="pwa-help-secondary" onClick={() => setHelpOpen(false)}>Close</button></div>
      </section>
    </div>}
  </>;
}

function PlusFallback() { return <span aria-hidden="true" style={{fontSize:22,fontWeight:700,lineHeight:1}}>＋</span>; }
