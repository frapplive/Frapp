"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { InterestFormPage } from "@/components/interest-form/interest-form-page";

/**
 * A chapter's interest form (#5977, ADR-27): the target of its QR codes,
 * open to anyone with no account. `?src=` carries the QR code's source
 * label. Reachable signed out: `/f` is not among `proxy.ts`'s gated
 * prefixes, and the page reads only the form's public fields.
 */
function InterestFormRoute() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  return (
    <InterestFormPage slug={params.slug ?? ""} src={searchParams.get("src")} />
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InterestFormRoute />
    </Suspense>
  );
}
