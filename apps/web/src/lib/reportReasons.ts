/**
 * Report an Issue: reason values sent to admin dashboard.
 * Grouped for UI as in the snapshot (Place gone/moved, Information wrong, Problem with photos).
 */

export const REPORT_REASON = {
  permanently_closed: 'permanently_closed',
  moved_wrong_location: 'moved_wrong_location',
  prices_outdated: 'prices_outdated',
  duplicate_spot: 'duplicate_spot',
  wrong_name_or_category: 'wrong_name_or_category',
  blurry_photo: 'blurry_photo',
  inappropriate_spam: 'inappropriate_spam',
} as const;

export type ReportReasonKey = keyof typeof REPORT_REASON;
export type ReportReasonValue = (typeof REPORT_REASON)[ReportReasonKey];

export const REPORT_GROUPS: {
  title: string;
  reasons: { value: ReportReasonValue; label: string }[];
}[] = [
  {
    title: 'Place is gone or moved',
    reasons: [
      { value: REPORT_REASON.permanently_closed, label: 'Permanently Closed' },
      { value: REPORT_REASON.moved_wrong_location, label: 'Moved / Wrong Location' },
    ],
  },
  {
    title: 'Information is wrong',
    reasons: [
      { value: REPORT_REASON.prices_outdated, label: 'Prices are Outdated' },
      { value: REPORT_REASON.duplicate_spot, label: 'Duplicate of another spot' },
      { value: REPORT_REASON.wrong_name_or_category, label: 'Wrong Name or Category' },
    ],
  },
  {
    title: 'Problem with photos',
    reasons: [
      { value: REPORT_REASON.blurry_photo, label: 'Blurry or unreadable photo' },
      { value: REPORT_REASON.inappropriate_spam, label: 'Inappropriate/Spam content' },
    ],
  },
];

export const PRICES_OUTDATED_REASON = REPORT_REASON.prices_outdated;
export const PERMANENTLY_CLOSED_REASON = REPORT_REASON.permanently_closed;
