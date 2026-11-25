"use client";

import dynamic from "next/dynamic";

/**
 * Where a confirmation email's "Withdraw or delete my info" link lands
 * (#5977, `ifc-recruitment.md` § The PNM's own view). No account. The token
 * rides the URL fragment, which the browser never sends, so it reaches no
 * server log and no analytics path; the page posts it in a body. Rendered
 * in the browser only, since only the browser has the fragment.
 */
const WithdrawPage = dynamic(
  () =>
    import("@/components/interest-form/withdraw-page").then(
      (module) => module.WithdrawPage,
    ),
  { ssr: false },
);

export default function Page() {
  return <WithdrawPage />;
}
