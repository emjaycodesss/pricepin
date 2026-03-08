/**
 * Menu Version History: timeline of updates per spot; Restore to make an old version live again.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { AdminLayout } from '../components/AdminLayout';
import { AdminDropdown } from '../components/AdminDropdown';

export function AdminHistory() {
  const [spotId, setSpotId] = useState('');
  const { data: spots = [] } = useQuery({
    queryKey: ['admin', 'all_spots'],
    queryFn: async () => {
      const { data, error } = await supabase.from('food_spots').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const spotOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: '', label: '—' }];
    spots.forEach((s: { id: string; name: string }) => opts.push({ value: s.id, label: s.name }));
    return opts;
  }, [spots]);

  const { data: updates = [] } = useQuery({
    queryKey: ['admin', 'menu_updates_by_spot', spotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_updates')
        .select('id, uploaded_at, menu_photo_url')
        .eq('food_spot_id', spotId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(spotId),
  });

  return (
    <AdminLayout>
      <div className="animate-page-in">
      <main className="w-full min-w-0 px-4 tablet:px-12 py-4 tablet:py-6 space-y-4 tablet:space-y-5">
        <section className="w-full tablet:max-w-xs p-0" aria-label="Select food spot">
          <AdminDropdown
            id="history-spot"
            label="Select a Food Spot"
            value={spotId}
            options={spotOptions}
            onChange={setSpotId}
            placeholder="—"
            compact
          />
        </section>

        {spotId && (
          <section className="rounded-lg border border-gray-200 bg-white overflow-hidden w-full" aria-labelledby="history-heading">
            <div className="px-3 tablet:px-6 py-2.5 tablet:py-3 border-b border-gray-200">
              <h2 id="history-heading" className="text-sm tablet:text-base font-semibold text-gray-900">Timeline</h2>
            </div>
            <div className="px-3 tablet:px-6 py-2.5 tablet:py-3">
              <ul className="space-y-0 divide-y divide-gray-100">
                {updates.map((u: { id: string; uploaded_at: string }, i: number) => (
                  <li key={u.id} className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-2 py-3 first:pt-0">
                    <span className="text-xs tablet:text-sm text-gray-900">
                      {new Date(u.uploaded_at).toLocaleString('en-PH', { month: 'short', year: 'numeric' })}
                      {i === 0 && <span className="ml-2 text-gray-500">(Current)</span>}
                      {i > 0 && <span className="ml-2 text-gray-500">(Archived)</span>}
                    </span>
                    {i > 0 && (
                      <button
                        type="button"
                        className="self-start tablet:self-auto min-h-[44px] tablet:min-h-0 inline-flex items-center text-xs tablet:text-sm font-medium text-[#EA000B] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 rounded touch-manipulation py-1"
                      >
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {updates.length === 0 && <p className="text-sm text-gray-500 py-2">No menu updates yet.</p>}
            </div>
          </section>
        )}
      </main>
      </div>
    </AdminLayout>
  );
}
