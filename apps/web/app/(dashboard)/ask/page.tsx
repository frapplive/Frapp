import { AskPage } from "@/components/ask/ask-page";

// The feature's name holds the product's, so the root layout's " · Frapp"
// template (#2147) would name it twice: `absolute` keeps the tab to
// "Ask Frapp", the same words as the page's heading.
export const metadata = {
  title: { absolute: "Ask Frapp" },
};

/**
 * Ask Frapp's page (Paul's pick of 2026-11-22): the conversation in the main
 * area, chat beside it. `components/ask/ask-page.tsx` says how it is drawn;
 * `ask-host.tsx` owns the conversation and who may have it.
 */
export default function AskRoute() {
  return <AskPage />;
}
