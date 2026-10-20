export const TOTAL_TICKETS = 1068;
export const TICKETS_PER_PERSON = 12;
/** Eligible SINATPSI members (closed roster); each participates at most once. */
export const TOTAL_MEMBERS = 88;
export const TOTAL_PARTICIPANTS = TOTAL_MEMBERS;
/** Failed DNI attempts allowed per member / per client IP within the window. */
export const DNI_MAX_ATTEMPTS_PER_MEMBER = 5;
export const DNI_MAX_ATTEMPTS_PER_IP = 30;
export const DNI_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
/** Lifetime of the member session issued after a correct DNI. */
export const MEMBER_SESSION_SECONDS = 15 * 60;
export const TICKET_PRICE_PEN = 10;
export const DRAW_DATE_ISO = "2026-10-30";
export const DRAW_DATE_LABEL = "30 de octubre de 2026";
export const PRIZES = [
  { place: "1er premio", name: "Televisor" },
  { place: "2do premio", name: "Freidora de aire" },
  { place: "3er premio", name: "Juego de ollas" },
] as const;
