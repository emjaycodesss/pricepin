/**
 * Submit spot reports and read counts for badges (e.g. "Reported Closed" when 3+ permanently_closed).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ReportReasonValue } from '../lib/reportReasons';
import { PERMANENTLY_CLOSED_REASON } from '../lib/reportReasons';

/** Submit a report for a food spot. Sends food_spot_id, report_reason, timestamp to admin. */
export async function submitSpotReport(
  foodSpotId: string,
  reportReason: ReportReasonValue
): Promise<void> {
  const { error } = await supabase.from('spot_reports').insert({
    food_spot_id: foodSpotId,
    report_reason: reportReason,
  });
  if (error) throw error;
}

/** Count of reports for a given reason for a spot (e.g. permanently_closed for badge). */
export async function getReportCountByReason(
  foodSpotId: string,
  reason: ReportReasonValue
): Promise<number> {
  const { count, error } = await supabase
    .from('spot_reports')
    .select('*', { count: 'exact', head: true })
    .eq('food_spot_id', foodSpotId)
    .eq('report_reason', reason);
  if (error) throw error;
  return count ?? 0;
}

/** Hook: submit report and invalidate counts. */
export function useSubmitSpotReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ foodSpotId, reportReason }: { foodSpotId: string; reportReason: ReportReasonValue }) =>
      submitSpotReport(foodSpotId, reportReason),
    onSuccess: (_, { foodSpotId }) => {
      queryClient.invalidateQueries({ queryKey: ['spot_reports_count', foodSpotId] });
    },
  });
}

/** Hook: count of permanently_closed reports for this spot (for "Reported Closed" badge). */
export function usePermanentlyClosedReportCount(foodSpotId: string | null) {
  const { data: count } = useQuery({
    queryKey: ['spot_reports_count', foodSpotId, PERMANENTLY_CLOSED_REASON],
    queryFn: () => getReportCountByReason(foodSpotId!, PERMANENTLY_CLOSED_REASON),
    enabled: Boolean(foodSpotId),
    staleTime: 60 * 1000,
  });
  return count ?? 0;
}
