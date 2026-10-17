/** What the model can say an input is about. */
export const INTENTS = Object.freeze([
  "earnings",
  "penalty_or_deduction",
  "account_blocked",
  "payment_delay",
  "document_or_form",
  "scheme_or_benefit",
  "safety",
  "scam_or_fraud",
  "legal_notice",
  "general_question",
]);

/** Next-step actions the app can offer. The front end maps each one to a button. */
export const ACTIONS = Object.freeze({
  logEarnings: "log_earnings",
  complaint: "complaint",
  benefits: "benefits",
  callEmergency: "call_emergency",
  callCyber: "call_cyber",
  callLegalAid: "call_legal_aid",
});

const BY_INTENT = Object.freeze({
  earnings: [ACTIONS.logEarnings],
  penalty_or_deduction: [ACTIONS.complaint],
  account_blocked: [ACTIONS.complaint, ACTIONS.callLegalAid],
  payment_delay: [ACTIONS.complaint],
  document_or_form: [ACTIONS.benefits],
  scheme_or_benefit: [ACTIONS.benefits],
  safety: [ACTIONS.callEmergency],
  scam_or_fraud: [ACTIONS.callCyber, ACTIONS.complaint],
  legal_notice: [ACTIONS.callLegalAid, ACTIONS.complaint],
  general_question: [],
});

const isPositive = (value) => typeof value === "number" && value > 0;

/**
 * Pick the action buttons for an answer.
 * The app also offers to log earnings when it sees a work day: an amount and the hours worked.
 * A stuck or disputed payment alone is not a work day.
 */
export function actionsFor(intent, earnings) {
  const actions = [...(BY_INTENT[intent] ?? [])];
  const isWorkDay = earnings && (isPositive(earnings.gross) || isPositive(earnings.net)) && isPositive(earnings.hours);
  if (isWorkDay && !actions.includes(ACTIONS.logEarnings)) actions.unshift(ACTIONS.logEarnings);
  return actions;
}
