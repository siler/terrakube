import { AuditFieldBase } from "@/modules/types";

export type CreateTokenForm = {
  description: string;
  days: number;
  hours: number;
  minutes: number;
};

export type CreatedToken = {
  token: string;
};

/** The fields TokenGrid shows; user tokens expire in whole days, team tokens add hours and minutes. */
export type GridToken = {
  id: string;
  description: string;
  days: number;
  hours?: number;
  minutes?: number;
  source?: "API" | "CLI_LOGIN";
  lastUsedAt?: string | null;
} & AuditFieldBase;
