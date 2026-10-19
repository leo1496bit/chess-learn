import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filtersToSearch, PAGE_SIZE, type GameFilters } from "@/app/(app)/games/filters";

export function GamesPagination({ filters, total }: { filters: GameFilters; total: number }) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  if (pageCount <= 1) return null;

  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 border-t pt-4">
      <p className="tabular text-sm text-muted-foreground">
        Parties {first} à {last} sur {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/games${filtersToSearch(filters, { page: page - 1 })}`} rel="prev">
              <ChevronLeft aria-hidden />
              Précédentes
            </Link>
          </Button>
        ) : null}
        <span className="tabular text-sm">
          Page {page} / {pageCount}
        </span>
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/games${filtersToSearch(filters, { page: page + 1 })}`} rel="next">
              Suivantes
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
