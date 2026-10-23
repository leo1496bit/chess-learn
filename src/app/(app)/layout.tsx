import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/db/server";
import { hasSettings } from "@/lib/db/settings";
import { AppNav, MobileNav } from "@/components/app-nav";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, supabase } = await requireUser();
  if (!(await hasSettings(supabase))) redirect("/welcome");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar px-3 py-5 lg:flex">
        <Wordmark />
        <AppNav className="mt-8" />
        <form action={signOut} className="mt-auto space-y-2 px-3">
          <p className="truncate text-xs text-muted-foreground" title={user.email}>
            {user.email}
          </p>
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Se déconnecter
          </button>
        </form>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Wordmark />
        <MobileNav email={user.email ?? ""} />
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3 font-semibold tracking-tight text-primary">
      <span aria-hidden className="text-xl leading-none">
        ♞
      </span>
      chess-learn
    </Link>
  );
}
