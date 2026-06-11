// Shared vocabulary for complaints / escalations, used by the consumer,
// farmer and moderator APIs so the categories never drift apart.

export const COMPLAINT_TYPES = [
  'delivery_delay',
  'quality_complaint',
  'payment_issue',
  'other',
] as const

export type ComplaintType = (typeof COMPLAINT_TYPES)[number]

export function normalizeComplaintType(raw: unknown): ComplaintType {
  const v = String(raw ?? 'other')
  return (COMPLAINT_TYPES as readonly string[]).includes(v) ? (v as ComplaintType) : 'other'
}

export const COMPLAINT_TYPE_LABEL: Record<ComplaintType, string> = {
  delivery_delay: 'Delivery delay',
  quality_complaint: 'Quality complaint',
  payment_issue: 'Payment issue',
  other: 'Other',
}
