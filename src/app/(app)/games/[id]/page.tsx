import { PageHeader } from "@/components/page-header";

export default async function Page({ params }: PageProps<"/games/[id]">) {
  const { id } = await params;
  return <PageHeader title="Analyse de la partie" description={`Partie ${id} — en construction.`} />;
}
