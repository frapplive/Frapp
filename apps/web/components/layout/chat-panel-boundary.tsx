"use client";

import { Component, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SegmentError } from "@/components/shared/segment-error";
import { useChannelListSlot } from "@/components/layout/channel-list-slot";
import { Button } from "@/components/ui/button";

/**
 * The sidebar's channel list is this panel's own (`channel-list-slot.tsx`), so
 * when the panel is down the list is too. Where the panel can't be seen
 * (closed beside a page, behind Chapter settings) its card would be the only
 * word of it, so the sidebar's slot says so too, with its own Retry, instead
 * of shimmering as if loading.
 */
function SlotError({ retry }: { retry: () => void }) {
  const { slot } = useChannelListSlot();
  if (!slot) return null;
  return createPortal(
    <div
      data-channel-list-body=""
      role="status"
      className="flex flex-col items-start gap-2 px-3 py-3 text-caption text-muted-foreground"
    >
      <span>Channels couldn&apos;t load.</span>
      <Button type="button" variant="secondary" size="sm" onClick={retry}>
        Try again
      </Button>
    </div>,
    slot,
  );
}

/**
 * The chat panel's own error boundary (#3779). Chat used to be the `/chat`
 * route, under `app/(dashboard)/error.tsx`; it is a shell panel now, above
 * every route's boundary, so without this a chat render error would take the
 * whole dashboard to `app/error.tsx`. It draws the same card the segment
 * boundary does, reports the same way (`SegmentError`), and Retry remounts
 * the panel.
 */
export class ChatPanelBoundary extends Component<
  {
    children: ReactNode;
    /**
     * Clears a caught error when it changes. The shell passes the pathname, so
     * moving to another route retries chat, as leaving the `/chat` segment
     * reset its boundary when chat was a page.
     */
    resetKey?: string;
  },
  { error: Error | null; errorKey: string | undefined }
> {
  state: { error: Error | null; errorKey: string | undefined } = {
    error: null,
    errorKey: undefined,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch() {
    this.setState({ errorKey: this.props.resetKey });
  }

  componentDidUpdate() {
    if (this.state.error && this.props.resetKey !== this.state.errorKey) {
      this.setState({ error: null, errorKey: undefined });
    }
  }

  render() {
    if (this.state.error) {
      const retry = () => this.setState({ error: null, errorKey: undefined });
      return (
        <div className="w-full max-w-md p-4">
          <SegmentError error={this.state.error} retry={retry} />
          <SlotError retry={retry} />
        </div>
      );
    }
    return this.props.children;
  }
}
