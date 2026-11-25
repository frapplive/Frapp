"use client";

/**
 * What stands where the composer would, in a channel, while the member is
 * timed out (#6006, `spec/behavior/chat/README.md` § Timeouts): until when,
 * and the officer's reason when they gave one. The read-only line's place and
 * type, so a member who can't post reads it the same way whatever the cause.
 * The words are `chatTimeoutNotice`'s (`@repo/chat-core/chat-timeout`), which
 * the phone reads too.
 */
export function ChatTimeoutNotice({
  notice,
  className = "border-t border-border px-4 py-3",
}: {
  notice: { title: string; detail: string | null };
  className?: string;
}) {
  return (
    <div className={className} role="status">
      <p className="text-caption font-medium text-foreground">{notice.title}</p>
      {notice.detail ? (
        <p className="mt-0.5 text-caption text-muted-foreground">
          {notice.detail}
        </p>
      ) : null}
    </div>
  );
}
