import { AskPage } from "@/components/ask/ask-page";

// The root layout appends " · Frapp" (#2147), so the tab reads
// "Ask · Frapp"; "Ask Frapp" here would name the product twice.
export const metadata = {
  title: "Ask",
};

/**
 * Ask Frapp's page (Paul's pick of 2026-11-22): the conversation in the main
 * area, chat beside it. `components/ask/ask-page.tsx` says how it is drawn;
 * `ask-host.tsx` owns the conversation and who may have it.
 */
export default function AskRoute() {
  return <AskPage />;
}
