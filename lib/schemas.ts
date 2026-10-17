import { z } from "zod";
import { cleanName } from "./name";
import { TICKETS_PER_PERSON, TOTAL_TICKETS } from "./constants";

const nameField = (label: string) =>
  z
    .string({ error: `${label} es obligatorio.` })
    .transform(cleanName)
    .pipe(
      z
        .string()
        .min(2, `${label} debe tener al menos 2 caracteres.`)
        .max(60, `${label} no puede superar los 60 caracteres.`),
    );

export const identitySchema = z.object({
  firstName: nameField("Los nombres"),
  lastName: nameField("Los apellidos"),
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

export const claimSchema = identitySchema.extend({ numbers: numbersSchema });

export const claimRequestSchema = claimSchema.extend({
  accessCode: z.string().min(1, "Ingresa el código de acceso.").max(200),
});

export type ClaimInput = z.infer<typeof claimSchema>;
