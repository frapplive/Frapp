import { PRIVACY_URL, TERMS_URL } from "@/lib/legal-links";

/**
 * Pages anyone opens with no account (ADR-27): today the chapter interest
 * form at `/f/<form-slug>` (#5977). One phone-width column, since a PNM
 * opens it from a QR code on their own phone; on a laptop it stays a column.
 * No sidebar, no session and no `ChapterGuard`. The links to the Privacy
 * Policy and Terms close every page, as `ifc-recruitment.md` § The public
 * page asks. The group adds no URL segment.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pb-8 pt-8 sm:px-6">
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-[480px] items-center gap-4 px-4 pb-8 text-caption text-muted-foreground sm:px-6">
        <span>Frapp</span>
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </a>
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Terms
        </a>
      </footer>
    </div>
  );
}
