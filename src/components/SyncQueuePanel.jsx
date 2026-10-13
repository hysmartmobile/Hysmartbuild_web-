import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, RefreshCw, RotateCcw, X } from 'lucide-react';
import { mutationQueueSummary, updateMutation } from '../lib/offlineQueue';
import { flushOfflineMutations } from '../lib/sync';

function formatDate(value) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
}

export default function SyncQueuePanel() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState({ total: 0, pending: 0, conflicts: 0, failed: 0, items: [] });
  const [busyId, setBusyId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try { setSummary(await mutationQueueSummary()); } catch { /* IndexedDB may be unavailable in restricted browser contexts. */ }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('hysmart-offline-queued', onChange);
    window.addEventListener('hysmart-sync-complete', onChange);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('hysmart-offline-queued', onChange);
      window.removeEventListener('hysmart-sync-complete', onChange);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function retry(item) {
    setBusyId(item.id);
    try {
      await updateMutation(item.id, { state: 'pending', lastError: null });
      await refresh();
      setRefreshing(true);
      await flushOfflineMutations();
    } finally {
      setRefreshing(false);
      setBusyId(null);
      await refresh();
    }
  }

  const label = summary.total ? `Sync queue · ${summary.total}` : 'Sync status';
  return <>
    <button type="button" className="sync-queue-trigger" onClick={() => { setOpen(true); refresh(); }} aria-haspopup="dialog" aria-expanded={open}>
      <Cloud size={15} aria-hidden="true" /> <span>{label}</span>
      {summary.conflicts + summary.failed > 0 && <b className="sync-queue-alert" aria-label={`${summary.conflicts + summary.failed} sync issues`}>{summary.conflicts + summary.failed}</b>}
    </button>
    {open && <div className="sync-queue-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="sync-queue-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-queue-title">
        <header className="sync-queue-header">
          <div><h2 id="sync-queue-title">Offline sync queue</h2><p>Queued changes stay on this device until synchronization completes.</p></div>
          <button type="button" className="iconbtn" onClick={() => setOpen(false)} aria-label="Close sync queue"><X size={18}/></button>
        </header>
        <div className="sync-queue-summary" aria-live="polite">
          <span><b>{summary.pending}</b> pending</span><span><b>{summary.failed}</b> failed</span><span><b>{summary.conflicts}</b> conflicts</span>
          <button type="button" className="btn" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await flushOfflineMutations(); } finally { setRefreshing(false); await refresh(); } }}><RefreshCw size={14}/>{refreshing ? 'Syncing…' : 'Sync now'}</button>
        </div>
        {!summary.items.length ? <div className="sync-queue-empty"><CheckCircle2 size={24}/><b>All changes synchronized</b><p>There are no local changes waiting to sync.</p></div> : <div className="sync-queue-items">
          {summary.items.map(item => <article className="sync-queue-item" key={item.id}>
            <div className="sync-queue-item-head"><div><b>{String(item.operationType || item.entityType || 'Workspace change').replaceAll('_', ' ')}</b><small>{formatDate(item.createdAt)}</small></div><span className={`sync-state ${item.state || 'pending'}`}>{item.state || 'pending'}</span></div>
            {item.entityId && <p className="sync-queue-id">Record: <code>{item.entityId}</code></p>}
            {item.lastError && <p className="sync-queue-error"><AlertTriangle size={14}/>{item.lastError}</p>}
            {item.state === 'conflict' ? <p className="sync-queue-help">This change conflicts with newer server data. Open the related record, review the current server version, and submit the intended changes again. It will not be replayed automatically.</p> : item.state === 'failed' ? <div className="sync-queue-actions"><p className="sync-queue-help">Check the error above, correct the cause if needed, then retry this change.</p><button type="button" className="btn" disabled={busyId === item.id || refreshing} onClick={() => retry(item)}><RotateCcw size={14}/>{busyId === item.id ? 'Retrying…' : 'Retry change'}</button></div> : null}
          </article>)}
        </div>}
        <p className="sync-queue-footnote">Keep this browser profile and its site data until pending evidence uploads finish. Clearing browser data can permanently remove unsynchronized files.</p>
      </section>
    </div>}
  </>;
}
