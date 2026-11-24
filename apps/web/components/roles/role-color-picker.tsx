"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Ban, Pipette } from "lucide-react";
import { hsvToHex, type Hsv } from "@repo/color";
import {
  isRoleColorSwatch,
  parseRoleColorInput,
  pickRoleColor,
  ROLE_COLOR_PICKER_COPY as COPY,
  ROLE_COLOR_SWATCH_COLUMNS,
  roleColorLabel,
  roleColorPickerStart,
  roleColorPickNote,
} from "@repo/validation";

import { FOCUS_RING_OFFSET } from "@/components/ui/focus";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** The hue bar's track: pure hues every 60 degrees, as every HSV picker draws it. */
const HUE_TRACK = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
  .map((h) => hsvToHex({ h, s: 1, v: 1 }))
  .join(", ")})`;

/**
 * The role and group color control (#3485, #5784, #5966), on the pattern of
 * Discord's role color picker: a live preview of a role chip and a name in
 * chat on the darkest surface, then No color and Custom as two tall tiles, a
 * grid of thirty readable swatches by hue, and the chapter's own custom
 * colors. Custom opens a saturation and brightness square, a hue bar and a
 * hex field (Discord's, Figma's and the macOS picker's anatomy).
 *
 * A color paints text, so a custom pick goes through `pickRoleColor` in
 * `@repo/validation`: one that wouldn't read at AA on every surface is made
 * lighter, and one in red (alerts, mentions) or gold (Frapp's own color) moves
 * to the nearest allowed hue, with one line saying so rather than a refusal.
 * The API accepts the same set (`isPaintableRoleColor`). The phone draws the
 * same control from the same pieces (`apps/mobile/components/roles/
 * role-color-sheet.tsx`).
 *
 * Toggle buttons in a labelled group rather than a radio group: each swatch is
 * one click to pick, and a screen reader hears its name and whether it is the
 * current one.
 */
export function RoleColorPicker({
  labelId,
  value,
  onChange,
  disabled,
  previewName,
  memberName,
  chapterColors = [],
}: {
  /** The id of the visible label that names this control. */
  labelId: string;
  /** A paintable color (`roleColorOrNull`), or `null` for none. */
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  /** The role's or group's name, for the preview's chip. */
  previewName: string;
  /** The viewer's own name, for the preview's line in chat. */
  memberName?: string | null;
  /** The chapter's own custom colors (`useChapterRoleColors`). */
  chapterColors?: readonly string[];
}) {
  const [note, setNote] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const custom = value !== null && !isRoleColorSwatch(value);
  const noteId = useId();

  const pickPreset = (next: string | null) => {
    setNote(null);
    onChange(next);
  };

  return (
    <div className="grid gap-3">
      <ColorPreview
        value={value}
        previewName={previewName}
        memberName={memberName}
      />
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={note ? noteId : undefined}
        className="flex flex-wrap items-stretch gap-1.5"
      >
        <button
          type="button"
          aria-pressed={value === null}
          aria-label={COPY.none}
          title={COPY.none}
          disabled={disabled}
          onClick={() => pickPreset(null)}
          className={cn(
            "grid w-12 place-items-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-card-hover disabled:opacity-50",
            FOCUS_RING_OFFSET,
            value === null &&
              "border-foreground text-foreground ring-1 ring-foreground",
          )}
        >
          <Ban aria-hidden="true" className="size-4" />
        </button>
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-pressed={custom}
              aria-label={custom ? `${COPY.custom} ${value}` : COPY.custom}
              title={COPY.custom}
              disabled={disabled}
              className={cn(
                "grid w-12 place-items-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-card-hover disabled:opacity-50",
                FOCUS_RING_OFFSET,
                custom && "border-transparent ring-2 ring-foreground",
              )}
              // A custom color is chapter data, so it paints as a raw fill.
              style={custom ? { backgroundColor: value } : undefined}
            >
              <Pipette
                aria-hidden="true"
                className={cn("size-4", custom && "text-background")}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3">
            <CustomColor
              value={value}
              onPick={(hex) => {
                const pick = pickRoleColor(hex);
                if (!pick) return;
                setNote(roleColorPickNote(pick));
                onChange(pick.hex);
              }}
              note={note}
            />
          </PopoverContent>
        </Popover>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_COLOR_SWATCH_COLUMNS.map((column) => (
            <div key={column.key} className="grid gap-1.5">
              {column.swatches.map((swatch) => (
                <Swatch
                  key={swatch.hex}
                  label={swatch.label}
                  hex={swatch.hex}
                  selected={value === swatch.hex}
                  disabled={disabled}
                  onPick={() => pickPreset(swatch.hex)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {chapterColors.length > 0 ? (
        <div className="grid gap-1.5">
          <p className="text-caption text-muted-foreground">{COPY.inChapter}</p>
          <div
            role="group"
            aria-label={COPY.inChapter}
            className="flex flex-wrap gap-1.5"
          >
            {chapterColors.map((hex) => (
              <Swatch
                key={hex}
                label={`${COPY.custom} ${hex}`}
                hex={hex}
                selected={value === hex}
                disabled={disabled}
                onPick={() => pickPreset(hex)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {note && !customOpen ? (
        <p id={noteId} className="text-caption text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * How the color reads where it's used: a role chip on a card, and a name in
 * chat on the background, the darkest surface. No color paints the chip's dot
 * hollow and the name in the plain foreground, as the app does.
 */
function ColorPreview({
  value,
  previewName,
  memberName,
}: {
  value: string | null;
  previewName: string;
  memberName?: string | null;
}) {
  const name = previewName.trim() || roleColorLabel(value);
  return (
    <div
      role="group"
      aria-label={COPY.preview}
      className="flex min-w-0 max-w-md flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-background px-3 py-2"
    >
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-caption text-foreground">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            value === null && "border border-muted-foreground",
          )}
          style={value ? { backgroundColor: value } : undefined}
        />
        <span className="truncate">{name}</span>
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-label font-semibold",
          value === null && "text-foreground",
        )}
        style={value ? { color: value } : undefined}
      >
        {memberName?.trim() || name}
      </span>
    </div>
  );
}

/**
 * Custom: the square picks saturation (across) and brightness (up) for the
 * hue the bar sets, and the hex field takes an exact brand color. A dragged
 * thumb stays where it was put and a typed hex moves the thumbs to the color
 * that's saved: the readable color nearest to the pick, which the preview and
 * the line under the field show.
 */
function CustomColor({
  value,
  onPick,
  note,
}: {
  value: string | null;
  onPick: (hex: string) => void;
  note: string | null;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => roleColorPickerStart(value));
  const [hexText, setHexText] = useState(value ?? "");
  const [hexError, setHexError] = useState(false);
  const noteId = useId();
  const hexId = useId();

  // The field follows the saved color while the square or bar moves.
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setHexText(value ?? "");
  }

  const move = (next: Hsv) => {
    setHsv(next);
    setHexError(false);
    onPick(hsvToHex(next));
  };

  const commitHex = () => {
    if (hexText.trim() === (value ?? "")) return;
    const hex = parseRoleColorInput(hexText);
    if (!hex) {
      setHexError(true);
      return;
    }
    setHexError(false);
    // The thumbs go to the color that's saved, which the note explains.
    setHsv(roleColorPickerStart(pickRoleColor(hex)?.hex ?? hex));
    onPick(hex);
  };

  return (
    <div className="grid w-60 gap-3">
      <SaturationSquare hsv={hsv} onMove={move} describedBy={noteId} />
      <HueBar hsv={hsv} onMove={move} />
      <div className="grid gap-1">
        <label htmlFor={hexId} className="text-caption text-muted-foreground">
          {COPY.hex}
        </label>
        <Input
          id={hexId}
          value={hexText}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={hexError || undefined}
          aria-describedby={noteId}
          onChange={(event) => setHexText(event.target.value)}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitHex();
            }
          }}
          className="font-mono uppercase"
        />
      </div>
      <p
        id={noteId}
        aria-live="polite"
        className={cn(
          "text-caption",
          hexError ? "text-destructive" : "text-muted-foreground",
          !hexError && !note && "sr-only",
        )}
      >
        {hexError ? COPY.hexInvalid : note}
      </p>
    </div>
  );
}

/** Where a pointer sits inside an element, as 0–1 across and down. */
function pointerFraction(event: PointerEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    x: clamp((event.clientX - box.left) / Math.max(box.width, 1)),
    y: clamp((event.clientY - box.top) / Math.max(box.height, 1)),
  };
}

/** Pointer handlers that follow a press and drag, captured so a drag can leave the box. */
function useDrag(onAt: (at: { x: number; y: number }) => void) {
  const dragging = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      dragging.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.focus();
      onAt(pointerFraction(event));
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (dragging.current) onAt(pointerFraction(event));
    },
    onPointerUp: () => {
      dragging.current = false;
    },
    onPointerCancel: () => {
      dragging.current = false;
    },
  };
}

const KEY_STEP = 0.02;
const KEY_STEP_BIG = 0.1;

function SaturationSquare({
  hsv,
  onMove,
  describedBy,
}: {
  hsv: Hsv;
  onMove: (next: Hsv) => void;
  describedBy: string;
}) {
  const drag = useDrag(({ x, y }) => onMove({ ...hsv, s: x, v: 1 - y }));
  const percent = (n: number) => Math.round(n * 100);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp(hsv.s - step) },
      ArrowRight: { s: clamp(hsv.s + step) },
      ArrowUp: { v: clamp(hsv.v + step) },
      ArrowDown: { v: clamp(hsv.v - step) },
    };
    const change = moves[event.key];
    if (!change) return;
    event.preventDefault();
    onMove({ ...hsv, ...change });
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={COPY.square}
      aria-describedby={describedBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent(hsv.s)}
      aria-valuetext={`Saturation ${percent(hsv.s)}%, brightness ${percent(hsv.v)}%`}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "relative h-40 w-full cursor-crosshair touch-none rounded-md",
        FOCUS_RING_OFFSET,
      )}
      // A hue the member picks is data, so the square paints it as a raw
      // gradient: white to that hue across, transparent to black upward.
      style={{
        backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex({ h: hsv.h, s: 1, v: 1 })})`,
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/40"
        style={{
          left: `${hsv.s * 100}%`,
          top: `${(1 - hsv.v) * 100}%`,
          backgroundColor: hsvToHex(hsv),
        }}
      />
    </div>
  );
}

function HueBar({ hsv, onMove }: { hsv: Hsv; onMove: (next: Hsv) => void }) {
  const drag = useDrag(({ x }) =>
    onMove({ ...hsv, h: Math.min(x * 360, 359) }),
  );
  const hue = Math.round(hsv.h);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? step
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -step
          : 0;
    if (!delta) return;
    event.preventDefault();
    onMove({ ...hsv, h: (hsv.h + delta + 360) % 360 });
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={COPY.hue}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={hue}
      aria-valuetext={`${hue} degrees`}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "relative h-3 w-full cursor-pointer touch-none rounded-full",
        FOCUS_RING_OFFSET,
      )}
      style={{ backgroundImage: HUE_TRACK }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/40"
        style={{
          left: `${(hsv.h / 360) * 100}%`,
          backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
        }}
      />
    </div>
  );
}

function Swatch({
  label,
  hex,
  selected,
  disabled,
  onPick,
}: {
  label: string;
  hex: string;
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "size-7 rounded-md transition-transform hover:scale-110 disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:scale-100",
        FOCUS_RING_OFFSET,
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
      )}
      // Palette literals: chapter data rendered as a raw swatch, so a token
      // reference would paint nothing.
      style={{ backgroundColor: hex }}
    />
  );
}
