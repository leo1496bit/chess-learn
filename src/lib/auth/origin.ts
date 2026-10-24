import "server-only";
import { headers } from "next/headers";

/** Origine du site pour les liens envoyés par e-mail (confirmation, réinitialisation). */
export async function siteOrigin(): Promise<string> {
  return (await headers()).get("origin") ?? "http://localhost:3001";
}
