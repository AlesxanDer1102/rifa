export const TOTAL_TICKETS = 1068;
export const TICKETS_PER_PERSON = 12;
export const TOTAL_PARTICIPANTS = TOTAL_TICKETS / TICKETS_PER_PERSON; // 89
export const TICKET_PRICE_PEN = 10;
export const DRAW_DATE_ISO = "2026-10-30";
export const DRAW_DATE_LABEL = "30 de octubre de 2026";
export const PRIZES = [
  { place: "1er premio", name: "Televisor" },
  { place: "2do premio", name: "Freidora de aire" },
  { place: "3er premio", name: "Juego de ollas" },
] as const;
