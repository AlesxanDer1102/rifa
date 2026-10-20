import { z } from "zod";
import { DNI_PATTERN } from "./dni";
import { TICKETS_PER_PERSON, TOTAL_TICKETS } from "./constants";

export const dniLoginSchema = z.object({
  memberId: z.uuid({ error: "Selecciona tu nombre." }),
  dni: z.string({ error: "Ingresa tu DNI." }).regex(DNI_PATTERN, "El DNI debe tener 8 dígitos."),
});

export const numbersSchema = z
  .array(
    z
      .number({ error: "Número inválido." })
      .int("Los números deben ser enteros.")
      .min(1, `Los números deben estar entre 1 y ${TOTAL_TICKETS}.`)
      .max(TOTAL_TICKETS, `Los números deben estar entre 1 y ${TOTAL_TICKETS}.`),
  )
  .length(TICKETS_PER_PERSON, `Debes elegir exactamente ${TICKETS_PER_PERSON} números.`)
  .refine((nums) => new Set(nums).size === nums.length, "Los números no pueden repetirse.");

export const claimSchema = z.object({
  memberId: z.uuid({ error: "Sesión inválida." }),
  numbers: numbersSchema,
});

export type ClaimInput = z.infer<typeof claimSchema>;
