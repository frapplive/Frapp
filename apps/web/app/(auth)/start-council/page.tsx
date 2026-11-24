import { StartCouncil } from "@/components/councils/start-council";

export const metadata = {
  title: "Start a council",
  description: "Start your school's council in Frapp.",
};

/**
 * Start a council (#5933), on the frame `/welcome` uses. The screen lives in
 * `components/councils/start-council.tsx`.
 */
export default function StartCouncilPage() {
  return <StartCouncil />;
}
