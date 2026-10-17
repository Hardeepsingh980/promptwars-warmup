import { SCHEMES, LAWS } from "./data/schemes.js";

/**
 * Return the schemes whose rules match the worker profile.
 * A rule that is not set does not exclude anyone.
 */
export function filterSchemes({ age, monthlyIncome, workType }, schemes = SCHEMES) {
  return schemes.filter(({ rules }) => {
    if (rules.minAge !== undefined && age < rules.minAge) return false;
    if (rules.maxAge !== undefined && age > rules.maxAge) return false;
    if (rules.maxMonthlyIncome !== undefined && monthlyIncome > rules.maxMonthlyIncome) return false;
    if (rules.workTypes && !rules.workTypes.includes(workType)) return false;
    return true;
  });
}

/** Return the laws that apply in the given state, national laws first. */
export function lawsFor(state, laws = LAWS) {
  return laws
    .filter((law) => law.states === null || law.states.includes(state))
    .sort((a, b) => Number(a.states !== null) - Number(b.states !== null));
}
