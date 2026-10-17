import { TICKETS_PER_PERSON } from "./constants";

export interface SelectionState {
  selected: number[]; // sorted
  lost: number[]; // numbers lost to someone else during a failed claim
  notice: string | null;
}

export type SelectionAction =
  | { type: "toggle"; number: number }
  | { type: "set"; numbers: number[] }
  | { type: "clear" }
  | { type: "serverTaken"; taken: number[] }
  | { type: "conflict"; taken: number[] }
  | { type: "dismissNotice" };

export const initialSelection: SelectionState = { selected: [], lost: [], notice: null };

const sortNums = (nums: number[]) => [...nums].sort((a, b) => a - b);
const list = (nums: number[]) => sortNums(nums).join(", ");

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "toggle": {
      const has = state.selected.includes(action.number);
      if (!has && state.selected.length >= TICKETS_PER_PERSON) return state;
      const selected = has
        ? state.selected.filter((n) => n !== action.number)
        : sortNums([...state.selected, action.number]);
      return { ...state, selected, lost: [], notice: null };
    }
    case "set":
      return { selected: sortNums(action.numbers).slice(0, TICKETS_PER_PERSON), lost: [], notice: null };
    case "clear":
      return initialSelection;
    case "serverTaken": {
      const taken = new Set(action.taken);
      const removed = state.selected.filter((n) => taken.has(n));
      if (removed.length === 0) return state;
      return {
        ...state,
        selected: state.selected.filter((n) => !taken.has(n)),
        lost: sortNums([...new Set([...state.lost, ...removed])]),
        notice:
          removed.length === 1
            ? `El número ${removed[0]} fue tomado por otra persona y se quitó de tu selección. Elige otro para completar los ${TICKETS_PER_PERSON}.`
            : `Los números ${list(removed)} fueron tomados por otras personas y se quitaron de tu selección. Elige otros para completar los ${TICKETS_PER_PERSON}.`,
      };
    }
    case "conflict": {
      const taken = new Set(action.taken);
      return {
        selected: state.selected.filter((n) => !taken.has(n)),
        lost: sortNums(action.taken),
        notice:
          action.taken.length === 1
            ? `El número ${action.taken[0]} ya fue tomado por otra persona. No se registró nada. Reemplázalo por otro y confirma nuevamente.`
            : `Los números ${list(action.taken)} ya fueron tomados por otras personas. No se registró nada. Reemplázalos por otros y confirma nuevamente.`,
      };
    }
    case "dismissNotice":
      return { ...state, notice: null };
  }
}
