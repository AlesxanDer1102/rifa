import type { Metadata } from "next";
import { AvailabilityBoard } from "@/components/AvailabilityBoard";

export const metadata: Metadata = {
  title: "Disponibilidad | Rifa Pro Navidad 2026 | SINATPSI",
};

export default function AvailabilityPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
      <AvailabilityBoard />
    </main>
  );
}
