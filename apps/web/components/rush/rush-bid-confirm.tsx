"use client";

import { useEffect, useState } from "react";
import { statusOf } from "@repo/api-sdk";
import {
  useConfirmRushBidByToken,
  useRushBidConfirmationPreview,
  type RushBidConfirmationPreview,
} from "@repo/hooks";
import { formatDay } from "@repo/formatting";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";
import { ErrorState, SkeletonText } from "@/components/shared/async-states";
import { toastFailure } from "@/lib/failure-toast";

/**
 * The PNM's one tap (#5973; Winston's UI design v8 § 3b): where the email
 * "Confirm you accepted FIJI's bid" lands, sent the moment a member records
 * an acceptance (`ifc-recruitment.md` § Bids). Until the PNM's own view at
 * `/me/recruitment` lands with the school layer, this page behind the emailed
 * link is all a PNM has, and it needs no account.
 *
 * The token rides in the link's fragment, which the browser never sends, so
 * no server or log sees it; the page reads it here and posts it. Opening the
 * page reads only (a mail scanner that follows the link confirms nothing);
 * the button confirms. PNM-facing, so it says "bid" and the chapter's name,
 * never the chapter's word for recruitment.
 *
 * Reachable signed out: `/recruitment` isn't one of `proxy.ts`'s gated
 * prefixes.
 */
export function RushBidConfirm() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    // Read once, from the browser, after the first paint: the server never
    // has the fragment.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment exists only in the browser, after hydration
    setToken(hash.length > 0 ? hash : null);
  }, []);

  if (token === undefined) {
    return (
      <AuthScreen title="Your bid">
        <SkeletonText lines={2} />
      </AuthScreen>
    );
  }
  if (token === null) return <LinkGone />;
  return <ConfirmBid token={token} />;
}

function ConfirmBid({ token }: { token: string }) {
  const preview = useRushBidConfirmationPreview(token);
  const confirm = useConfirmRushBidByToken();

  if (preview.isPending) {
    return (
      <AuthScreen title="Your bid">
        <SkeletonText lines={2} />
      </AuthScreen>
    );
  }
  if (preview.isError) {
    if (statusOf(preview.error) === 404) return <LinkGone />;
    return (
      <AuthScreen title="Your bid">
        <ErrorState
          title="Couldn't open your bid"
          description="Check your connection and try again."
          onRetry={() => void preview.refetch()}
        />
      </AuthScreen>
    );
  }
  if (!preview.data) return <LinkGone />;
  return (
    <BidCard
      bid={preview.data}
      pending={confirm.isPending}
      onConfirm={() =>
        confirm.mutate(token, {
          onError: (error) =>
            toastFailure({
              title: "Couldn't confirm",
              error,
              fallback: "Try again in a moment.",
            }),
        })
      }
    />
  );
}

/**
 * The bid, its state first (rulebook § 6): waiting with the one button, then
 * what the tap did, or that there is nothing left to confirm.
 */
export function BidCard({
  bid,
  pending,
  onConfirm,
}: {
  bid: RushBidConfirmationPreview;
  pending: boolean;
  onConfirm: () => void;
}) {
  const title = `${bid.chapter_name}'s bid`;
  const expires = bid.expires_at ? formatDay(bid.expires_at) : null;
  if (bid.status === "confirmed") {
    return (
      <AuthScreen title={title}>
        <p className="text-sm text-foreground">Accepted · confirmed by you</p>
        <p className="text-sm text-muted-foreground">
          {`${bid.chapter_name} will email you an invite to join.`}
        </p>
      </AuthScreen>
    );
  }
  if (bid.status === "closed") {
    return (
      <AuthScreen title={title}>
        <p className="text-sm text-muted-foreground">
          {`This bid is closed, so there's nothing to confirm. If that's not right, ask ${bid.chapter_name}.`}
        </p>
      </AuthScreen>
    );
  }
  return (
    <AuthScreen title={title}>
      <p className="text-sm text-foreground">
        {bid.recorded_by_name
          ? `Recorded by ${bid.recorded_by_name}, waiting to be confirmed`
          : "Waiting to be confirmed"}
      </p>
      <div>
        <Button type="button" disabled={pending} onClick={onConfirm}>
          Confirm I accepted
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {`Didn't accept? Leave it.${expires ? ` The bid expires ${expires}.` : ""}`}
      </p>
    </AuthScreen>
  );
}

const LINK_GONE_LINE =
  "If you already confirmed, you're all set. Otherwise the bid was answered or has expired. Ask the chapter if that's not right.";

function LinkGone() {
  return (
    <AuthScreen title="This link doesn't work any more">
      <p className="text-sm text-muted-foreground">
        {LINK_GONE_LINE}
      </p>
    </AuthScreen>
  );
}
