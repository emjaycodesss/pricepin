/**
 * Report an Issue: grouped options (Place gone/moved, Information wrong, Problem with photos).
 * Smart redirect when "Prices are Outdated" is selected.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { REPORT_GROUPS, PRICES_OUTDATED_REASON } from '../lib/reportReasons';
import type { ReportReasonValue } from '../lib/reportReasons';
import { useSubmitSpotReport } from '../hooks/useSpotReports';

interface ReportIssueModalProps {
  foodSpotId: string;
  foodSpotName?: string;
  onClose: () => void;
  /** After successful submit, optional (e.g. navigate to update menu). */
  onSubmitted?: () => void;
}

export function ReportIssueModal({
  foodSpotId,
  foodSpotName,
  onClose,
  onSubmitted,
}: ReportIssueModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReasonValue | null>(null);
  const submitReport = useSubmitSpotReport();
  const isPricesOutdated = selectedReason === PRICES_OUTDATED_REASON;

  const handleSubmit = async () => {
    if (!selectedReason) return;
    try {
      await submitReport.mutateAsync({ foodSpotId, reportReason: selectedReason });
      onSubmitted?.();
      onClose();
    } catch {
      // Error state could be shown
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-issue-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="report-issue-title" className="text-lg font-semibold text-gray-900 p-4 pb-2">
          Report an Issue
        </h2>
        {foodSpotName && (
          <p className="text-sm text-gray-500 px-4 pb-3">Spot: {foodSpotName}</p>
        )}

        <div className="px-4 pb-4 space-y-4">
          {REPORT_GROUPS.map((group) => (
            <fieldset key={group.title} className="space-y-2">
              <legend className="text-sm font-medium text-gray-700">{group.title}</legend>
              <div className="space-y-1.5 pl-0">
                {group.reasons.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-3 cursor-pointer rounded-lg py-2 px-3 hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="report_reason"
                      value={value}
                      checked={selectedReason === value}
                      onChange={() => setSelectedReason(value)}
                      className="h-4 w-4 border-gray-300 text-[#EA000B] focus:ring-[#EA000B]"
                    />
                    <span className="text-sm text-gray-900">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          {isPricesOutdated && (
            <div className="rounded-xl bg-[#EA000B]/08 border border-[#EA000B]/20 p-3">
              <p className="text-sm text-gray-800">
                Want to fix it now? You can update the menu yourself!
              </p>
              <Link
                to={`/update-menu/${foodSpotId}`}
                className="mt-2 inline-block text-sm font-semibold text-[#EA000B] hover:underline"
                onClick={() => { onClose(); onSubmitted?.(); }}
              >
                Update menu →
              </Link>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedReason || submitReport.isPending}
            className="flex-1 rounded-xl bg-[#EA000B] py-2.5 text-sm font-semibold text-white hover:bg-[#c20009] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2"
          >
            {submitReport.isPending ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
