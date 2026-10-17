/**
 * Actions Saathi can take for a signed-in rider.
 * The Live voice session and the text route both call `runTool`, so a spoken
 * "I will reach in 20 minutes" and a typed one change the same data.
 */
import { summarizeLog } from "../../shared/pay.js";

const SCREENS = ["home", "money", "help", "ask", "benefits", "complaint"];

/** Function declarations in the shape the Gemini API expects. */
export const TOOL_DECLARATIONS = [
  { name: "start_riding", description: "The rider is starting a ride. Saathi will answer their calls.", parameters: { type: "OBJECT", properties: {} } },
  { name: "stop_riding", description: "The rider has stopped or reached. Saathi can read messages now.", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "set_eta",
    description: "Change how many minutes the rider needs to reach the customer. Callers hear this.",
    parameters: { type: "OBJECT", properties: { minutes: { type: "NUMBER", description: "Minutes from now, 0 to 240" } }, required: ["minutes"] },
  },
  {
    name: "set_order",
    description: "Set the current delivery: the app or platform, the customer's area, and minutes to reach.",
    parameters: {
      type: "OBJECT",
      properties: {
        platform: { type: "STRING", description: "For example Swiggy, Zomato, Amazon" },
        customer_area: { type: "STRING", description: "Area or landmark, not a full address" },
        eta_minutes: { type: "NUMBER" },
      },
    },
  },
  { name: "clear_order", description: "The order is delivered or cancelled. Clear the current order.", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "get_messages",
    description: "Get the messages from calls Saathi answered that the rider has not heard yet. Read them out, then they count as heard.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "log_earnings",
    description: "Save today's work day: money earned, hours worked, and costs in rupees.",
    parameters: {
      type: "OBJECT",
      properties: {
        earnings: { type: "NUMBER", description: "Rupees earned" },
        hours: { type: "NUMBER", description: "Hours worked" },
        fuel: { type: "NUMBER", description: "Fuel cost in rupees" },
        other: { type: "NUMBER", description: "Other costs in rupees" },
      },
      required: ["earnings", "hours"],
    },
  },
  { name: "get_earnings_summary", description: "Get the rider's earnings for the last 7 days.", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "open_screen",
    description: "Open a screen in the app for the rider: home, money (earnings), help, ask (explain a photo), benefits (government schemes), complaint (write a complaint).",
    parameters: { type: "OBJECT", properties: { screen: { type: "STRING", enum: SCREENS } }, required: ["screen"] },
  },
];

const clampMinutes = (value) => Math.max(0, Math.min(240, Math.round(Number(value) || 0)));
const money = (value) => Math.max(0, Math.min(1_000_000, Math.round(Number(value) || 0)));

/**
 * Run one tool for `user`. Returns { result, uiEvent }.
 * `result` goes back to the model. `uiEvent` tells the browser what changed.
 */
export function runTool({ name, args = {} }, { user, copilot, earnings }) {
  const userId = user.id;
  switch (name) {
    case "start_riding": {
      const rider = copilot.updateRider(userId, { status: "riding" });
      return { result: { ok: true, status: rider.status }, uiEvent: { type: "rider" } };
    }
    case "stop_riding": {
      const rider = copilot.updateRider(userId, { status: "stopped" });
      return { result: { ok: true, status: rider.status, unheard_messages: copilot.unheardMessages(userId).length }, uiEvent: { type: "rider" } };
    }
    case "set_eta": {
      const rider = copilot.getRider(userId);
      const order = { platform: rider.order?.platform ?? user.platform ?? "", customerArea: rider.order?.customerArea ?? "", etaMinutes: clampMinutes(args.minutes) };
      copilot.updateRider(userId, { order });
      return { result: { ok: true, eta_minutes: order.etaMinutes }, uiEvent: { type: "rider" } };
    }
    case "set_order": {
      const rider = copilot.getRider(userId);
      const order = {
        platform: String(args.platform ?? rider.order?.platform ?? user.platform ?? "").slice(0, 40),
        customerArea: String(args.customer_area ?? rider.order?.customerArea ?? "").slice(0, 80),
        etaMinutes: args.eta_minutes === undefined ? rider.order?.etaMinutes ?? null : clampMinutes(args.eta_minutes),
      };
      copilot.updateRider(userId, { order });
      return { result: { ok: true, order }, uiEvent: { type: "rider" } };
    }
    case "clear_order": {
      copilot.updateRider(userId, { order: null });
      return { result: { ok: true }, uiEvent: { type: "rider" } };
    }
    case "get_messages": {
      const unheard = copilot.unheardMessages(userId);
      copilot.markHeard(userId, unheard.map((message) => message.id));
      const messages = unheard.reverse().map(({ callerType, callerName, purpose, details, urgency, scamSuspected, callBack, spoken }) =>
        ({ callerType, callerName, purpose, details, urgency, scamSuspected, callBack, spoken }));
      return { result: { count: messages.length, messages }, uiEvent: { type: "messages" } };
    }
    case "log_earnings": {
      const entry = earnings.add(userId, { earnings: money(args.earnings), hours: Math.max(0, Math.min(24, Number(args.hours) || 0)), fuel: money(args.fuel), other: money(args.other), platform: user.platform ?? "" });
      return { result: { ok: true, net_rupees: entry.net }, uiEvent: { type: "earnings" } };
    }
    case "get_earnings_summary": {
      const summary = summarizeLog(earnings.list(userId));
      return { result: { days: summary.days, days_logged: summary.count, total_rupees: summary.total, hours: summary.hours, per_hour_rupees: summary.perHour }, uiEvent: null };
    }
    case "open_screen": {
      const screen = SCREENS.includes(args.screen) ? args.screen : "home";
      return { result: { ok: true, screen }, uiEvent: { type: "navigate", screen } };
    }
    default:
      return { result: { error: `Unknown tool ${name}` }, uiEvent: null };
  }
}
