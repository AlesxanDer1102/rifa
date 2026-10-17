export interface StoredReceipt {
  firstName: string;
  lastName: string;
  numbers: number[];
  createdAt: string;
}

export const RECEIPT_KEY = "rifa-receipt-v1";

export function saveReceipt(receipt: StoredReceipt): void {
  try {
    localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    window.dispatchEvent(new Event("rifa-receipt-change"));
  } catch {
    // storage unavailable: the receipt is still shown for this session
  }
}

export function readReceiptRaw(): string | null {
  try {
    return localStorage.getItem(RECEIPT_KEY);
  } catch {
    return null;
  }
}

export function parseReceipt(raw: string | null): StoredReceipt | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredReceipt>;
    if (
      typeof value.firstName === "string" &&
      typeof value.lastName === "string" &&
      typeof value.createdAt === "string" &&
      Array.isArray(value.numbers) &&
      value.numbers.every((n) => typeof n === "number")
    ) {
      return value as StoredReceipt;
    }
  } catch {
    // corrupted value: ignore
  }
  return null;
}

export function subscribeReceipt(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("rifa-receipt-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("rifa-receipt-change", callback);
  };
}
