import { STRINGS } from "../../shared/strings.js";

/**
 * Central government schemes that gig and informal workers can use.
 * Eligibility rules are simplified from the official pages linked in `link`.
 * The model explains these schemes. It never adds schemes or links of its own.
 *
 * Rule fields (all optional):
 *   minAge, maxAge          inclusive age range
 *   maxMonthlyIncome        rupees per month, inclusive
 *   workTypes               allowed work types, see WORK_TYPES in config.js
 */
export const SCHEMES = Object.freeze([
  {
    id: "eshram",
    name: "e-Shram card",
    benefit: "A free national ID card for unorganised workers. It links you to central schemes and gives accident insurance of up to ₹2 lakh.",
    rules: { minAge: 16, maxAge: 59 },
    documents: ["Aadhaar linked to your mobile number", "Bank account details"],
    link: "https://eshram.gov.in",
  },
  {
    id: "pmsym",
    name: "PM Shram Yogi Maan-dhan (PM-SYM)",
    benefit: "A pension of ₹3,000 per month after age 60. You pay ₹55 to ₹200 per month based on your age. The government pays the same amount.",
    rules: { minAge: 18, maxAge: 40, maxMonthlyIncome: 15000 },
    documents: ["Aadhaar", "Savings bank account with IFSC code"],
    link: "https://maandhan.in",
  },
  {
    id: "pmsby",
    name: "PM Suraksha Bima Yojana (PMSBY)",
    benefit: "Accident insurance of ₹2 lakh for death or full disability, and ₹1 lakh for partial disability. The premium is ₹20 per year.",
    rules: { minAge: 18, maxAge: 70 },
    documents: ["Savings bank account", "Aadhaar"],
    link: "https://jansuraksha.gov.in",
  },
  {
    id: "pmjjby",
    name: "PM Jeevan Jyoti Bima Yojana (PMJJBY)",
    benefit: "Life insurance of ₹2 lakh for any cause of death. The premium is ₹436 per year.",
    rules: { minAge: 18, maxAge: 50 },
    documents: ["Savings bank account", "Aadhaar"],
    link: "https://jansuraksha.gov.in",
  },
  {
    id: "apy",
    name: "Atal Pension Yojana (APY)",
    benefit: "A fixed pension of ₹1,000 to ₹5,000 per month after age 60, based on what you choose to pay each month.",
    rules: { minAge: 18, maxAge: 40 },
    documents: ["Savings bank account", "Aadhaar", "Mobile number"],
    link: "https://www.pfrda.org.in",
  },
  {
    id: "pmjay",
    name: "Ayushman Bharat PM-JAY",
    benefit: "Free hospital treatment of up to ₹5 lakh per family each year at listed hospitals. The government is extending it to platform workers who register on e-Shram.",
    rules: { maxMonthlyIncome: 25000 },
    documents: ["Aadhaar", "Ration card or e-Shram card"],
    link: "https://beneficiary.nha.gov.in",
  },
  {
    id: "onorc",
    name: "One Nation One Ration Card",
    benefit: "Use your ration card at any ration shop in India. This helps if you moved to a new city for work.",
    rules: { maxMonthlyIncome: 25000 },
    documents: ["Your existing ration card", "Aadhaar"],
    link: "https://nfsa.gov.in",
  },
  {
    id: "svanidhi",
    name: "PM SVANidhi",
    benefit: "Small working-capital loans for street vendors with no collateral. You get an interest subsidy and cashback on digital payments.",
    rules: { minAge: 18, workTypes: ["vendor"] },
    documents: ["Aadhaar", "Vending certificate or letter from the town body"],
    link: "https://pmsvanidhi.mohua.gov.in",
  },
  {
    id: "bocw",
    name: "Construction Workers Welfare Board",
    benefit: "Your state board gives accident help, money for your children's education, maternity help, and tools. You must register first.",
    rules: { minAge: 18, maxAge: 60, workTypes: ["construction"] },
    documents: ["Aadhaar", "Proof of 90 days of construction work in the last 12 months", "Bank account"],
    link: "https://labour.gov.in",
  },
]);

/**
 * Laws that protect gig and platform workers.
 * `states: null` means the law applies in all of India.
 */
export const LAWS = Object.freeze([
  {
    id: "code-social-security",
    name: "Code on Social Security, 2020",
    states: null,
    summary: "The first central law that names gig workers and platform workers. It lets the government make social security schemes for them, paid for partly by the platforms.",
    link: "https://labour.gov.in/labour-codes",
  },
  {
    id: "rajasthan-gig-act",
    name: "Rajasthan Platform Based Gig Workers (Registration and Welfare) Act, 2023",
    states: ["Rajasthan"],
    summary: "Gig workers in Rajasthan can register with a welfare board and get a unique ID. Platforms pay a welfare fee into a fund for workers. Workers can file grievances.",
    link: "https://labour.rajasthan.gov.in",
  },
  {
    id: "karnataka-gig-act",
    name: "Karnataka Platform-based Gig Workers (Social Security and Welfare) Act, 2025",
    states: ["Karnataka"],
    summary: "Platforms in Karnataka pay a welfare fee for workers. Workers can register, raise grievances, and must get notice with reasons before the platform removes them.",
    link: "https://labour.karnataka.gov.in",
  },
]);

/** Phone numbers a worker can call. All are free, national numbers. */
export const HELPLINES = Object.freeze([
  { id: "emergency", label: "Police, fire, ambulance", number: "112" },
  { id: "cyber", label: "Cyber crime and online fraud", number: "1930" },
  { id: "women", label: "Women helpline", number: "181" },
  { id: "legal-aid", label: "Free legal aid (NALSA)", number: "15100" },
  { id: "eshram", label: "e-Shram helpline", number: "14434" },
]);

/**
 * Where to send a complaint. The model picks one key.
 * The text lives in shared/strings.js, so the interface can translate it.
 */
const TARGET_KEYS = ["platform_support", "labour_department", "police", "cyber_crime", "consumer_forum"];
export const COMPLAINT_TARGETS = Object.freeze(Object.fromEntries(TARGET_KEYS.map((key) => [key, STRINGS[`to_${key}`]])));

/** The escalation order when nobody replies. `id` names the strings ladder_<id>_who and ladder_<id>_how. */
export const ESCALATION_LADDER = Object.freeze(
  [
    { id: "platform", waitDays: 7 },
    { id: "labour", waitDays: 15 },
    { id: "legal", waitDays: null },
  ].map((step) => ({ ...step, who: STRINGS[`ladder_${step.id}_who`], how: STRINGS[`ladder_${step.id}_how`] })),
);
