import { cn } from "@/lib/utils";

/**
 * A member's name while the roster that names them is still loading (#6127):
 * a neutral shimmer bar the width of a short name, centred in a line of the
 * caller's height, so the line doesn't reflow when the name lands. Chat draws
 * it in place of `Member 2f4a1c`, which reads as a real identity
 * (`ui-development` rulebook § States: no fake or placeholder identity).
 *
 * Drawn only while `authorAwaitsRoster` (`@repo/hooks`) holds; once the roster
 * has landed or failed, a member it can't name reads the fallback label.
 */
export function NamePlaceholder({
  className,
  barClassName,
}: {
  /** The line box: its height should match the label it stands in for. */
  className?: string;
  /** The bar's own size; defaults to a short name at body caption height. */
  barClassName?: string;
}) {
  return (
    <span
      data-slot="name-placeholder"
      className={cn("inline-flex h-5 items-center align-top", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "skeleton-shimmer inline-block h-[13px] w-24 rounded-[6px]",
          barClassName,
        )}
      />
      <span className="sr-only">Loading name</span>
    </span>
  );
}
