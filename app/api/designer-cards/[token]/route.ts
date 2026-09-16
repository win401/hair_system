import { NextResponse } from "next/server";
import { designerResponseSchema } from "@/lib/validation";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const parsed = designerResponseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("consultation_cards")
    .update({
      status: "designer_responded",
      designer_verdict: parsed.data.verdict,
      designer_notes: parsed.data.notes || null,
      designer_responded_at: new Date().toISOString(),
    })
    .eq("designer_response_token", token)
    .select("slug")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }

  return NextResponse.json({ slug: data.slug });
}
