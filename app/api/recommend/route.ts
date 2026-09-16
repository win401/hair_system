import { NextResponse } from "next/server";
import { hairSurveySchema } from "@/lib/validation";
import { getStyleRecommender } from "@/lib/recommendation/adapter";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = hairSurveySchema.safeParse(body?.survey);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const result = await getStyleRecommender().recommend(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "recommendation_failed", message: error instanceof Error ? error.message : "unknown_error" },
      { status: 502 }
    );
  }
}
