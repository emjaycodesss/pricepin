/**
 * Flag/Report Manager: filter by reason, review reports, closed-spot toggle.
 * UX: clear hierarchy, relative dates, reason labels, empty/loading states, smooth filter switch, animations.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { adminUpdateFoodSpot } from '../lib/adminApi';
import { REPORT_GROUPS } from '../lib/reportReasons';
import { AdminLayout } from '../components/AdminLayout';
import { AdminDropdown } from '../components/AdminDropdown';

/** Relative time for quick scanning; full date on hover. */
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

/** Human-readable label for report reason (from REPORT_GROUPS or fallback). */
function getReasonLabel(value: string): string {
  for (const g of REPORT_GROUPS) {
    const r = g.reasons.find((x) => x.value === value);
    if (r) return r.label;
  }
  return value.replace(/_/g, ' ');
}

export function AdminFlags() {
  const [filterReason, setFilterReason] = useState<string>('');
  const [contentVisible, setContentVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  const reportsScrollRef = useRef<HTMLDivElement>(null);
  const prevFilterRef = useRef(filterReason);
  const queryClient = useQueryClient();

  /** Fade-in on mount so refresh doesn't feel abrupt. */
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const reasonOptions = useMemo(() => {
    const all: { value: string; label: string }[] = [{ value: '', label: 'All reasons' }];
    REPORT_GROUPS.flatMap((g) => g.reasons).forEach((r) => {
      all.push({ value: r.value, label: r.label });
    });
    return all;
  }, []);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['admin', 'reports', filterReason],
    queryFn: async () => {
      let q = supabase.from('spot_reports').select('*').order('created_at', { ascending: false });
      if (filterReason) q = q.eq('report_reason', filterReason);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
    placeholderData: keepPreviousData,
  });

  /** Smooth filter switch: brief fade, reset scroll (skip on initial mount). */
  useEffect(() => {
    if (prevFilterRef.current === filterReason) return;
    prevFilterRef.current = filterReason;
    setContentVisible(false);
    reportsScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    const t = setTimeout(() => setContentVisible(true), 120);
    return () => clearTimeout(t);
  }, [filterReason]);

  const spotIds = [...new Set(reports.map((r: { food_spot_id: string }) => r.food_spot_id))];
  const { data: spots = [] } = useQuery({
    queryKey: ['admin', 'spots_for_reports', spotIds],
    queryFn: async () => {
      if (spotIds.length === 0) return [];
      const { data, error } = await supabase.from('food_spots').select('id, name, is_permanently_closed').in('id', spotIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: spotIds.length > 0,
  });

  const setClosed = useMutation({
    mutationFn: async ({ spotId, closed }: { spotId: string; closed: boolean }) => {
      await adminUpdateFoodSpot(spotId, { is_permanently_closed: closed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'spots_for_reports'] });
      queryClient.invalidateQueries({ queryKey: ['food_spots'] });
    },
  });

  const spotMap = new Map(spots.map((s: { id: string; name: string; is_permanently_closed?: boolean }) => [s.id, s]));

  return (
    <AdminLayout>
      <div className="animate-page-in">
      <main
        className={`w-full min-w-0 px-4 tablet:px-12 py-4 tablet:py-6 space-y-4 tablet:space-y-5 transition-opacity duration-300 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`}
      >
        <section className="w-full tablet:max-w-xs p-0" aria-label="Filter reports">
          <AdminDropdown
            id="filter-reason"
            label="Filter by reason"
            value={filterReason}
            options={reasonOptions}
            onChange={setFilterReason}
            placeholder="All reasons"
            compact
          />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white overflow-hidden w-full" aria-labelledby="flags-heading">
          <div className="px-3 tablet:px-6 py-2.5 tablet:py-3 border-b border-gray-200 flex flex-col tablet:flex-row tablet:items-center justify-between gap-2">
            <h2 id="flags-heading" className="text-sm tablet:text-base font-semibold text-gray-900">Reports</h2>
            <p className="text-[11px] tablet:text-xs text-gray-500">
              Duplicate merge: use Review, then merge into the canonical spot and delete the duplicate.
            </p>
          </div>
          <div
            ref={reportsScrollRef}
            className="overflow-x-auto overflow-y-auto max-h-[min(65vh,420px)] tablet:max-h-[min(70vh,520px)] -webkit-overflow-scrolling-touch"
          >
            <div
              className={`transition-opacity duration-150 ease-out ${contentVisible ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={!contentVisible}
            >
            {isLoading && !reports.length ? (
              <div className="flex items-center justify-center py-16 px-4">
                <p className="text-sm text-gray-500">Loading reports…</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <p className="text-sm font-medium text-gray-900">No reports</p>
                <p className="text-sm text-gray-500 mt-1">
                  {filterReason ? 'Try another reason or clear the filter.' : 'Reports from users will appear here.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-xs tablet:text-sm border-collapse min-w-[300px]" key={filterReason}>
                <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2.5 px-3 tablet:px-6 font-medium text-gray-600">Spot</th>
                    <th className="text-left py-2.5 px-2 tablet:px-4 font-medium text-gray-600 hidden tablet:table-cell">Reason</th>
                    <th className="text-left py-2.5 px-3 tablet:px-6 font-medium text-gray-600">Reported</th>
                    <th className="text-right py-2.5 px-3 tablet:px-6 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reports.map((r: { id: string; food_spot_id: string; report_reason: string; created_at: string }) => {
                    const spot = spotMap.get(r.food_spot_id);
                    const closed = spot?.is_permanently_closed ?? false;
                    const reasonLabel = getReasonLabel(r.report_reason);
                    return (
                      <tr
                        key={r.id}
                        className={`bg-white hover:bg-gray-50/80 ${closed ? 'opacity-90' : ''}`}
                      >
                        <td className="py-2.5 px-3 tablet:px-6 min-w-0">
                          <span className="font-medium text-gray-900 truncate block">{spot?.name ?? r.food_spot_id.slice(0, 8) + '…'}</span>
                          {closed && (
                            <span className="mt-0.5 inline-flex items-center rounded bg-gray-200 px-1.5 py-0.5 text-[10px] tablet:text-xs font-medium text-gray-600">
                              Closed
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 tablet:px-4 hidden tablet:table-cell">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            {reasonLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 tablet:px-6 text-gray-500 whitespace-nowrap" title={new Date(r.created_at).toLocaleString()}>
                          {formatRelative(r.created_at)}
                        </td>
                        <td className="py-2.5 px-3 tablet:px-6 text-right">
                          <span className="flex gap-1.5 tablet:gap-2 justify-end flex-wrap items-center">
                            <Link
                              to={`/admin-price-pin/verify/${r.food_spot_id}`}
                              className="inline-flex items-center min-h-[44px] tablet:min-h-0 rounded-md px-2.5 py-2 tablet:py-1.5 text-xs tablet:text-sm font-medium text-[#EA000B] hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 touch-manipulation"
                            >
                              Review
                            </Link>
                            {r.report_reason === 'permanently_closed' && (
                              <button
                                type="button"
                                onClick={() => setClosed.mutate({ spotId: r.food_spot_id, closed: !closed })}
                                className={`inline-flex items-center min-h-[44px] tablet:min-h-0 rounded-md px-2.5 py-2 tablet:py-1.5 text-xs font-medium touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 ${closed ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}
                              >
                                {closed ? 'Reopen' : 'Mark closed'}
                              </button>
                            )}
                          </span>
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
