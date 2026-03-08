/**
 * Admin Overview: at-a-glance stats and priority queue for review.
 * Nav: Overview, Flag/Report Manager, Menu Version History.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AdminLayout } from '../components/AdminLayout';

/** Format date as relative (e.g. "2h ago") or short absolute for older. */
function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function useAdminStats() {
  const { data: spots } = useQuery({
    queryKey: ['admin', 'spots_count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('food_spots').select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: menuUpdates } = useQuery({
    queryKey: ['admin', 'menu_updates_count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('menu_updates').select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: pendingFlags } = useQuery({
    queryKey: ['admin', 'spot_reports_count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('spot_reports').select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  const { data: newToday } = useQuery({
    queryKey: ['admin', 'spots_new_today', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_spots')
        .select('id')
        .gte('created_at', `${today}T00:00:00Z`)
        .lt('created_at', `${today}T23:59:59.999Z`);
      if (error) throw error;
      return (data ?? []).length;
    },
  });

  return {
    totalSpots: spots ?? 0,
    totalMenuUpdates: menuUpdates ?? 0,
    pendingFlags: pendingFlags ?? 0,
    newSpotsToday: newToday ?? 0,
  };
}

type QueueSort = 'flags' | 'recent' | 'new';

/** Report = one row per report. Update = one row per session (batch); id is a representative menu_update_id for the Verify link. */
type QueueItem =
  | { kind: 'report'; food_spot_id: string; report_reason: string; created_at: string; id: string }
  | { kind: 'update'; food_spot_id: string; uploaded_at: string; id: string; photoCount: number };

/** Activity type for display: Flagged | New spot | Menu update. */
type ActivityType = 'flagged' | 'new_spot' | 'menu_update';

/** New-spot window: if spot was created within this many ms before the session upload, treat as "New spot". */
const NEW_SPOT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Derive activity type for queue row: Flagged, New spot, or Menu update. */
function getActivityType(
  item: QueueItem,
  spotCreatedAt: string | undefined
): ActivityType {
  if (item.kind === 'report') return 'flagged';
  const uploadTime = new Date(item.uploaded_at).getTime();
  const createdTime = spotCreatedAt ? new Date(spotCreatedAt).getTime() : 0;
  if (createdTime && uploadTime - createdTime <= NEW_SPOT_WINDOW_MS && createdTime <= uploadTime) {
    return 'new_spot';
  }
  return 'menu_update';
}

/** Human-readable activity type label; new spot + menu = user added spot and updated menu in same session. */
function getActivityTypeLabel(
  activityType: ActivityType,
  _item: QueueItem,
  reportReason?: string
): string {
  if (activityType === 'flagged') {
    return reportReason ? `Flagged: ${reportReason.replace(/_/g, ' ')}` : 'Flagged';
  }
  if (activityType === 'new_spot') return 'New spot + menu';
  return 'Menu update';
}

export function AdminDashboard() {
  const [sort, setSort] = useState<QueueSort>('flags');
  const [contentVisible, setContentVisible] = useState(true);
  const queueScrollRef = useRef<HTMLDivElement>(null);
  const prevSortRef = useRef(sort);
  const stats = useAdminStats();

  /** On category change: reset scroll and brief fade so the switch feels smooth (skip on initial mount). */
  useEffect(() => {
    if (prevSortRef.current === sort) return;
    prevSortRef.current = sort;
    setContentVisible(false);
    queueScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    const t = setTimeout(() => setContentVisible(true), 120);
    return () => clearTimeout(t);
  }, [sort]);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['admin', 'priority_queue'],
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data: reports } = await supabase
        .from('spot_reports')
        .select('food_spot_id, report_reason, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      const { data: updates } = await supabase
        .from('menu_updates')
        .select('id, food_spot_id, uploaded_at, batch_id')
        .order('uploaded_at', { ascending: false })
        .limit(200);
      const spotIds = new Set<string>();
      (reports ?? []).forEach((r: { food_spot_id: string }) => spotIds.add(r.food_spot_id));
      (updates ?? []).forEach((u: { food_spot_id: string }) => spotIds.add(u.food_spot_id));
      const ids = [...spotIds];
      const { data: spots } = await supabase
        .from('food_spots')
        .select('id, name, created_at, address, floor_level, menu_admin_verified_at')
        .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      const counts = new Map<string, number>();
      (reports ?? []).forEach((r: { food_spot_id: string }) => {
        counts.set(r.food_spot_id, (counts.get(r.food_spot_id) ?? 0) + 1);
      });
      return { reports: reports ?? [], spots: spots ?? [], updates: updates ?? [], counts };
    },
    staleTime: 30 * 1000,
  });

  /** Single sorted list: filter by mode then sort. Updates are grouped by batch_id (session) so one queue row per session.
   * Exclude items for spots that have already been verified (menu_admin_verified_at set) so they drop off the queue after Verify. */
  const queueItems = useMemo((): QueueItem[] => {
    if (!raw) return [];
    const spotMap = new Map(raw.spots.map((s: { id: string; name: string; created_at: string; address?: string | null; floor_level?: string | null; menu_admin_verified_at?: string | null }) => [s.id, s]));
    const isSpotVerified = (spotId: string) => {
      const v = spotMap.get(spotId)?.menu_admin_verified_at;
      return v != null && String(v).trim() !== '';
    };
    const getSpotCreated = (spotId: string) => spotMap.get(spotId)?.created_at ?? '';
    const getDate = (i: QueueItem) => (i.kind === 'report' ? i.created_at : i.uploaded_at);
    const NEW_SPOTS_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const items: QueueItem[] = [];
    raw.reports.forEach((r: { food_spot_id: string; report_reason: string; created_at: string }) => {
      if (isSpotVerified(r.food_spot_id)) return;
      items.push({ kind: 'report', ...r, id: `r-${r.food_spot_id}-${r.created_at}` });
    });

    /**
     * Group menu_updates by session so one queue row per session.
     * - When batch_id is set: group by batch_id (same upload session from Update Menu).
     * - When batch_id is null (legacy or pre-batch data): group by (food_spot_id, 15-min time bucket)
     *   so updates from the same spot within 15 minutes become one row and open one verify page.
     * Exclude sessions for spots that are already verified.
     */
    const SESSION_WINDOW_MS = 15 * 60 * 1000;
    const updatesRaw = raw.updates as { id: string; food_spot_id: string; uploaded_at: string; batch_id?: string | null }[];
    const bySession = new Map<string, typeof updatesRaw>();
    for (const u of updatesRaw) {
      if (isSpotVerified(u.food_spot_id)) continue;
      let sessionKey: string;
      if (u.batch_id != null && String(u.batch_id).length > 0) {
        sessionKey = String(u.batch_id);
      } else {
        const t = new Date(u.uploaded_at).getTime();
        const bucket = Math.floor(t / SESSION_WINDOW_MS) * SESSION_WINDOW_MS;
        sessionKey = `${u.food_spot_id}-${bucket}`;
      }
      if (!bySession.has(sessionKey)) bySession.set(sessionKey, []);
      bySession.get(sessionKey)!.push(u);
    }
    bySession.forEach((group) => {
      const sorted = [...group].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
      const latest = sorted[0];
      items.push({
        kind: 'update',
        food_spot_id: latest.food_spot_id,
        uploaded_at: latest.uploaded_at,
        id: latest.id,
        photoCount: group.length,
      });
    });

    /** Filter by current sort mode so each tab shows the intended subset. */
    let filtered: QueueItem[];
    if (sort === 'flags') {
      filtered = items.filter((i) => (raw.counts.get(i.food_spot_id) ?? 0) >= 1);
    } else if (sort === 'recent') {
      filtered = [...items];
    } else {
      filtered = items.filter((i) => {
        const created = getSpotCreated(i.food_spot_id);
        if (!created) return false;
        return now - new Date(created).getTime() <= NEW_SPOTS_DAYS_MS;
      });
    }

    if (sort === 'flags') {
      filtered.sort((a, b) => {
        const ca = raw.counts.get(a.food_spot_id) ?? 0;
        const cb = raw.counts.get(b.food_spot_id) ?? 0;
        if (cb !== ca) return cb - ca;
        return new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime();
      });
    } else if (sort === 'recent') {
      filtered.sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime());
    } else {
      filtered.sort((a, b) => {
        const ta = new Date(getSpotCreated(a.food_spot_id)).getTime();
        const tb = new Date(getSpotCreated(b.food_spot_id)).getTime();
        return tb - ta;
      });
    }
    return filtered.slice(0, 50);
  }, [raw, sort]);

  return (
    <AdminLayout>
      <div className="animate-page-in">
      <main className="w-full min-w-0 px-4 tablet:px-12 py-4 tablet:py-6 space-y-4 tablet:space-y-5">
        {/* Stats: 2 cols mobile, 4 tablet+; compact on small screens */}
        <section className="grid grid-cols-2 tablet:grid-cols-4 gap-2 tablet:gap-3" aria-label="Key metrics">
          <div className="rounded-lg tablet:rounded-xl border border-gray-200 bg-white flex items-center gap-2 tablet:gap-4 py-3 px-3 tablet:py-5 tablet:px-4 min-h-[72px] tablet:min-h-[88px] min-w-0">
              <span className="flex h-9 w-9 tablet:h-11 tablet:w-11 shrink-0 items-center justify-center rounded-lg tablet:rounded-xl bg-gray-100 text-gray-500" aria-hidden>
                <svg className="h-4 w-4 tablet:h-5 tablet:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </span>
              <div className="min-w-0 overflow-hidden">
                <p className="text-[10px] tablet:text-xs font-medium text-gray-500 uppercase tracking-wider truncate">Total Spots</p>
                <p className="text-lg tablet:text-2xl font-semibold text-gray-900 tabular-nums mt-0.5 truncate">{stats.totalSpots}</p>
              </div>
          </div>
          <div className="rounded-lg tablet:rounded-xl border border-gray-200 bg-white flex items-center gap-2 tablet:gap-4 py-3 px-3 tablet:py-5 tablet:px-4 min-h-[72px] tablet:min-h-[88px] min-w-0">
              <span className="flex h-9 w-9 tablet:h-11 tablet:w-11 shrink-0 items-center justify-center rounded-lg tablet:rounded-xl bg-gray-100 text-gray-500" aria-hidden>
                <svg className="h-4 w-4 tablet:h-5 tablet:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </span>
              <div className="min-w-0 overflow-hidden">
                <p className="text-[10px] tablet:text-xs font-medium text-gray-500 uppercase tracking-wider truncate">Menu Updates</p>
                <p className="text-lg tablet:text-2xl font-semibold text-gray-900 tabular-nums mt-0.5 truncate">{stats.totalMenuUpdates}</p>
              </div>
          </div>
          <div className="rounded-lg tablet:rounded-xl border border-gray-200 bg-white flex items-center gap-2 tablet:gap-4 py-3 px-3 tablet:py-5 tablet:px-4 min-h-[72px] tablet:min-h-[88px] min-w-0">
              <span className="flex h-9 w-9 tablet:h-11 tablet:w-11 shrink-0 items-center justify-center rounded-lg tablet:rounded-xl bg-gray-100 text-gray-500" aria-hidden>
                <svg className="h-4 w-4 tablet:h-5 tablet:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
              </span>
              <div className="min-w-0 overflow-hidden">
                <p className="text-[10px] tablet:text-xs font-medium text-gray-500 uppercase tracking-wider truncate">Pending Flags</p>
                <p className="text-lg tablet:text-2xl font-semibold text-gray-900 tabular-nums mt-0.5 truncate">{stats.pendingFlags}</p>
              </div>
          </div>
          <div className="rounded-lg tablet:rounded-xl border border-gray-200 bg-white flex items-center gap-2 tablet:gap-4 py-3 px-3 tablet:py-5 tablet:px-4 min-h-[72px] tablet:min-h-[88px] min-w-0">
              <span className="flex h-9 w-9 tablet:h-11 tablet:w-11 shrink-0 items-center justify-center rounded-lg tablet:rounded-xl bg-gray-100 text-gray-500" aria-hidden>
                <Sparkles className="h-4 w-4 tablet:h-5 tablet:w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 overflow-hidden">
                <p className="text-[10px] tablet:text-xs font-medium text-gray-500 uppercase tracking-wider truncate">New Today</p>
                <p className="text-lg tablet:text-2xl font-semibold text-gray-900 tabular-nums mt-0.5 truncate">{stats.newSpotsToday}</p>
              </div>
          </div>
        </section>

        {/* Priority Queue: full-width table, sticky header, responsive padding and height */}
        <section className="rounded-lg border border-gray-200 bg-white overflow-hidden w-full" aria-labelledby="queue-heading">
          <div className="px-3 tablet:px-6 py-2.5 tablet:py-3 border-b border-gray-200 flex flex-col tablet:flex-row tablet:items-center justify-between gap-2 tablet:gap-3">
            <h2 id="queue-heading" className="text-sm tablet:text-base font-semibold text-gray-900">Priority queue</h2>
            <div className="flex flex-wrap gap-1.5 tablet:gap-2" role="tablist" aria-label="Sort queue by">
              {(['flags', 'recent', 'new'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={sort === s}
                  onClick={() => setSort(s)}
                  className={`rounded-lg min-h-[44px] tablet:min-h-0 px-3 py-2.5 tablet:py-1.5 text-xs tablet:text-sm font-medium transition-colors touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 ${
                    sort === s ? 'bg-[#EA000B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                  }`}
                >
                  {s === 'flags' ? 'High-flagged' : s === 'recent' ? 'Recent activity' : 'New spots'}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={queueScrollRef}
            className="overflow-x-auto overflow-y-auto max-h-[min(65vh,420px)] tablet:max-h-[min(70vh,480px)] scroll-smooth -webkit-overflow-scrolling-touch"
            style={{ scrollBehavior: 'auto' }}
          >
            <div
              className={`transition-opacity duration-150 ease-out ${contentVisible ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={!contentVisible}
            >
            {isLoading ? (
              <div className="flex items-center justify-center py-12 px-4">
                <p className="text-sm text-gray-500">Loading queue…</p>
              </div>
            ) : queueItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <p className="text-sm font-medium text-gray-900">No items in queue</p>
                <p className="text-sm text-gray-500 mt-1">Nothing needs review for this view.</p>
                <Link to="/admin-price-pin/flags" className="mt-4 text-sm font-medium text-[#EA000B] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 rounded">
                  Open Flag / Report Manager
                </Link>
              </div>
            ) : (
              <table className="w-full text-xs tablet:text-sm border-collapse min-w-[320px]" key={sort}>
                <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2.5 px-3 tablet:px-6 font-medium text-gray-600 w-24 tablet:w-32 max-w-[140px] tablet:max-w-[160px]">Food Spot</th>
                    <th className="text-left py-2.5 px-2 tablet:px-4 font-medium text-gray-600 hidden tablet:table-cell min-w-0">Location</th>
                    <th className="text-left py-2.5 px-2 tablet:px-4 font-medium text-gray-600 hidden tablet:table-cell">Type</th>
                    <th className="text-left py-2.5 px-3 tablet:px-6 font-medium text-gray-600">When</th>
                    <th className="text-right py-2.5 px-3 tablet:px-6 font-medium text-gray-600 w-16 tablet:w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {queueItems.map((item) => {
                    const spot = raw?.spots.find((s: { id: string; name?: string; created_at?: string; address?: string | null; floor_level?: string | null }) => s.id === item.food_spot_id);
                    const name = spot?.name ?? item.food_spot_id.slice(0, 8) + '…';
                    const count = raw?.counts.get(item.food_spot_id) ?? 0;
                    const date = item.kind === 'report' ? item.created_at : item.uploaded_at;
                    const activityType = getActivityType(item, spot?.created_at);
                    const typeLabel = getActivityTypeLabel(activityType, item, item.kind === 'report' ? item.report_reason : undefined);
                    const locationParts = [spot?.address, spot?.floor_level].filter(Boolean) as string[];
                    const locationText = locationParts.length > 0 ? locationParts.join(' · ') : '—';
                    return (
                      <tr
                        key={item.id}
                        className="bg-white hover:bg-gray-50/80"
                      >
                        <td className="py-2.5 px-3 tablet:px-6 w-24 tablet:w-32 max-w-[140px] tablet:max-w-[160px] min-w-0">
                          <span className="font-medium text-gray-900 truncate block" title={name}>{name}</span>
                          <span className="mt-0.5 block text-[11px] text-gray-500 truncate tablet:hidden" title={locationText}>
                            {locationText}
                          </span>
                          {count >= 3 && (
                            <span className="mt-0.5 inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] tablet:text-xs font-medium text-amber-800">
                              3+ reports
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 tablet:px-4 text-gray-600 hidden tablet:table-cell min-w-0 truncate" title={locationText}>
                          {locationText}
                        </td>
                        <td className="py-2.5 px-2 tablet:px-4 text-gray-600 hidden tablet:table-cell">{typeLabel}</td>
                        <td className="py-2.5 px-3 tablet:px-6 text-gray-500 whitespace-nowrap" title={new Date(date).toLocaleString()}>
                          {formatRelativeDate(date)}
                        </td>
                        <td className="py-2.5 px-3 tablet:px-6 text-right">
                          <Link
                            to={item.kind === 'update' ? `/admin-price-pin/verify/update/${item.id}` : `/admin-price-pin/verify/${item.food_spot_id}`}
                            className="inline-flex items-center min-h-[44px] tablet:min-h-0 font-medium text-[#EA000B] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 rounded touch-manipulation py-1"
                          >
                            {item.kind === 'report' ? 'Review' : 'Verify'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </section>
      </main>
      </div>
    </AdminLayout>
  );
}
