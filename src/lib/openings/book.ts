import "server-only";
import bookData from "./book.json";
import type { OpeningBook } from "./identify";

/** Livre d'ouvertures (≈ 1 Mo) : chargé uniquement côté serveur, jamais envoyé au navigateur. */
export const OPENING_BOOK = bookData as unknown as OpeningBook;
