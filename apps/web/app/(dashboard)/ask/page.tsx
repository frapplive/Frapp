import { AskPage } from "@/components/ask/ask-card";

export const metadata = {
  title: "Ask Frapp",
};

/**
 * Ask Frapp's page (Paul's pick of 2026-11-22): the conversation in the main
 * area, chat beside it. `components/ask/ask-card.tsx` says how it is drawn;
 * `ask-host.tsx` owns the conversation and who may have it.
 */
export default function AskRoute() {
  return <AskPage />;
}
