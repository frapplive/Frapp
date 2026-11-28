"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { parseHex } from "@repo/color";
import { useChatBackground, useCurrentChapter } from "@repo/hooks";
import {
  CHAT_BACKGROUND_PAINTS,
  CHAT_BACKGROUND_PHOTO_BLUR_PX,
  CHAT_BACKGROUND_PHOTO_SCRIM_ALPHA,
  type ChatBackgroundBuiltInKey,
  type ChatBackgroundLayer,
} from "@repo/theme/chat-backgrounds";
import { chapterMarkFor } from "@/components/layout/crest-tile";
import { useChapterStore } from "@/lib/stores/chapter-store";

/**
 * What sits behind a channel's messages (#3973): its own background, else the
 * chapter default, else plain. Drawn from `@repo/theme/chat-backgrounds` so web
 * and mobile can't drift; every built-in and the photo scrim are measured AA
 * against the thread's text tokens in `chat-background-contrast.spec.ts`.
 *
 * Fills its positioned parent and sits behind it (`-z-10` in an `isolate`
 * parent), so the thread itself needs no change. Until the read resolves, and
 * on any failure, it draws plain: a background is decoration and never holds
 * up the thread.
 */
export function ChatBackground({ channelId }: { channelId: string | null }) {
  const { data } = useChatBackground(channelId);
  const letters = useChapterLetters();

  // An unknown key (a newer API than this bundle) draws plain, never throws.
  const stored = data?.background ?? "plain";
  const key =
    stored === "photo" || stored in CHAT_BACKGROUND_PAINTS ? stored : "plain";
  if (key === "photo") {
    if (!data?.photo_url) return <Layer style={paintStyle("plain", letters)} />;
    return (
      <div
        aria-hidden="true"
        data-chat-background="photo"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background"
      >
        {/* Overscanned so the blur's soft edge never shows at the column's sides. */}
        <div
          className="absolute -inset-12 bg-cover bg-center"
          style={{
            backgroundImage: `url("${data.photo_url}")`,
            filter: `blur(${CHAT_BACKGROUND_PHOTO_BLUR_PX}px)`,
          }}
        />
        <div
          className="absolute inset-0 bg-background"
          style={{ opacity: CHAT_BACKGROUND_PHOTO_SCRIM_ALPHA }}
        />
      </div>
    );
  }
  const snow = snowLayerOf(key);
  return (
    <Layer style={paintStyle(key, letters, { snow: false })} keyName={key}>
      {snow ? <Snowfall layer={snow} /> : null}
    </Layer>
  );
}

function snowLayerOf(
  key: ChatBackgroundBuiltInKey,
): Extract<ChatBackgroundLayer, { kind: "snow" }> | undefined {
  return CHAT_BACKGROUND_PAINTS[key].layers.find(
    (layer): layer is Extract<ChatBackgroundLayer, { kind: "snow" }> =>
      layer.kind === "snow",
  );
}

/**
 * Holiday's snow (#6149), drifting down one tile every `fallSeconds`. Its own
 * layer, one tile taller than the column, moved by `transform` alone, so the
 * browser composites it without repainting the thread. Still under reduced
 * motion (`.chat-snowfall` in `globals.css`).
 */
function Snowfall({
  layer,
}: {
  layer: Extract<ChatBackgroundLayer, { kind: "snow" }>;
}) {
  return (
    <div
      data-chat-snowfall=""
      className="chat-snowfall absolute inset-x-0 bottom-0"
      style={
        {
          top: -layer.tile,
          backgroundImage: snowTile(layer),
          backgroundSize: `${layer.tile}px ${layer.tile}px`,
          "--snowfall-distance": `${layer.tile}px`,
          "--snowfall-duration": `${layer.fallSeconds}s`,
        } as CSSProperties
      }
    />
  );
}

/** The chapter's mark (letters, else initials), for the Letters background. */
export function useChapterLetters(): string {
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const { data: chapter } = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  return useMemo(
    () => (chapter ? chapterMarkFor(chapter).text : ""),
    [chapter],
  );
}

function Layer({
  style,
  keyName = "plain",
  children,
}: {
  style: CSSProperties;
  keyName?: string;
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      data-chat-background={keyName}
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={style}
    >
      {children}
    </div>
  );
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return `rgba(${r},${g},${b},${alpha})`;
}

function lettersTile(
  layer: Extract<ChatBackgroundLayer, { kind: "letters" }>,
  letters: string,
): string {
  const safe = letters.replace(/[<>&"']/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layer.width}" height="${layer.height}">` +
    `<text x="10" y="40" font-family="Georgia,serif" font-size="${layer.fontSize}" fill="${layer.color}" fill-opacity="${layer.alphas[0]}" letter-spacing="2">${safe}</text>` +
    `<text x="85" y="88" font-family="Georgia,serif" font-size="${layer.fontSize}" fill="${layer.color}" fill-opacity="${layer.alphas[1]}" letter-spacing="2">${safe}</text>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function snowTile(
  layer: Extract<ChatBackgroundLayer, { kind: "snow" }>,
): string {
  const flakes = layer.flakes
    .map(
      (f) =>
        `<circle cx="${f.x}" cy="${f.y}" r="${f.r}" fill="${layer.color}" fill-opacity="${layer.alpha}"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layer.tile}" height="${layer.tile}">${flakes}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/**
 * The paint as CSS. CSS stacks the first image on top, so the layers go in
 * reversed. `snow: false` leaves the snow out, for the thread, which draws it
 * as its own moving layer; a swatch keeps it, still.
 */
export function paintStyle(
  key: ChatBackgroundBuiltInKey,
  letters: string,
  { snow = true }: { snow?: boolean } = {},
): CSSProperties {
  const paint = CHAT_BACKGROUND_PAINTS[key];
  const images: string[] = [];
  const sizes: string[] = [];
  for (const layer of paint.layers) {
    switch (layer.kind) {
      case "linear":
        images.push(
          `linear-gradient(${layer.angle}deg, ${layer.stops
            .map((s) => `${s.color} ${s.offset * 100}%`)
            .join(", ")})`,
        );
        sizes.push("auto");
        break;
      case "radial":
        images.push(
          `radial-gradient(${layer.rx * 100}% ${layer.ry * 100}% at ${layer.cx * 100}% ${layer.cy * 100}%, ${rgba(layer.color, layer.alpha)}, transparent ${layer.fade * 100}%)`,
        );
        sizes.push("auto");
        break;
      case "bands":
        images.push(
          `repeating-linear-gradient(0deg, ${layer.colors[0]} 0 ${layer.height}px, ${layer.colors[1]} ${layer.height}px ${layer.height * 2}px)`,
        );
        sizes.push("auto");
        break;
      case "rules": {
        const gap = layer.every - layer.thickness;
        images.push(
          `repeating-linear-gradient(0deg, transparent 0 ${gap}px, ${rgba(layer.color, layer.alpha)} ${gap}px ${layer.every}px)`,
        );
        sizes.push("auto");
        break;
      }
      case "letters":
        if (!letters) break;
        images.push(lettersTile(layer, letters));
        sizes.push(`${layer.width}px ${layer.height}px`);
        break;
      case "snow":
        if (!snow) break;
        images.push(snowTile(layer));
        sizes.push(`${layer.tile}px ${layer.tile}px`);
        break;
    }
  }
  return {
    backgroundColor: paint.base,
    backgroundImage: images.length ? images.reverse().join(", ") : undefined,
    backgroundSize: sizes.length ? sizes.reverse().join(", ") : undefined,
  };
}
