import { StartForm } from "./StartForm";
import { isMockMode } from "@/lib/ai/adapter";

export default async function StartPage({
  params,
}: {
  params: Promise<{ designerSlug: string }>;
}) {
  const { designerSlug } = await params;
  return <StartForm designerSlug={designerSlug} isMockMode={isMockMode()} />;
}
