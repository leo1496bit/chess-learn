import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/forms";
import { createSupabaseServerClient } from "@/lib/db/server";

/** Retour des liens envoyés par e-mail (confirmation d'inscription, réinitialisation) : échange le code contre une session. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=1", url.origin));
}
