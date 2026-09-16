"use client";

import { useState, type FormEvent } from "react";
import type { DesignerResponseInput } from "@/lib/validation";

const VERDICT_OPTIONS: { value: DesignerResponseInput["verdict"]; label: string }[] = [
  { value: "possible", label: "가능" },
  { value: "conditional", label: "조건부 가능" },
  { value: "difficult", label: "어려움" },
];

export function DesignerResponseForm({
  token,
  initialVerdict,
  initialNotes,
  alreadyResponded,
}: {
  token: string;
  initialVerdict: DesignerResponseInput["verdict"] | null;
  initialNotes: string | null;
  alreadyResponded: boolean;
}) {
  const [verdict, setVerdict] = useState<DesignerResponseInput["verdict"] | "">(
    initialVerdict ?? ""
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(alreadyResponded);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verdict) {
      setError("가능 여부를 선택해 주세요.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/designer-cards/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, notes: notes.trim() || undefined }),
      });
      if (!response.ok) throw new Error("응답을 저장하지 못했어요.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "응답을 저장하지 못했어요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4"
    >
      <h2 className="text-sm font-semibold">시술 가능 여부 응답</h2>
      {submitted && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          응답이 저장됐어요. 필요하면 아래에서 다시 수정하고 저장할 수 있어요.
        </p>
      )}
      <fieldset className="flex flex-col gap-2">
        {VERDICT_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="verdict"
              value={opt.value}
              checked={verdict === opt.value}
              onChange={() => setVerdict(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        메모 (선택)
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          rows={4}
          className="rounded-md border border-neutral-300 p-2 text-sm"
          placeholder="예: 탈색 이력이 있어 색 보정 상담이 먼저 필요해요."
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "저장 중..." : submitted ? "응답 다시 저장" : "응답 저장"}
      </button>
    </form>
  );
}
