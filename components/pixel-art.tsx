import React from "react";

/**
 * Hand-drawn pixel maps. Characters:
 *  plane: "#" deep indigo body, "o" light window, "." transparent
 *  cloud: "#" light lavender, "+" lavender shade, "." transparent
 *  check: "#" deep indigo, "." transparent
 */

export const PLANE_MAP = [
  "..........................",
  ".....##...................",
  ".....####.................",
  ".....######...............",
  ".....########.............",
  ".....##########...........",
  ".....############ooo###...",
  "...##################....",
  "....################.....",
  ".......#####...####.......",
  ".......#####...####.......",
  "..........................",
];

export const PLANE_PALETTE: Record<string, string> = {
  "#": "#4338CA",
  o: "#F5F7FF",
};

export const CLOUD_A = [
  "............................",
  "........########............",
  "......############..........",
  "....################........",
  "..####################......",
  ".######################.....",
  "########################....",
  "++++++++++++++++++++++++....",
  ".++++++++++++++++++++++.....",
  "............................",
];

export const CLOUD_B = [
  "......................",
  "......######..........",
  "....##########........",
  "..##############......",
  ".################.....",
  "##################....",
  "++++++++++++++++++....",
  ".++++++++++++++++....",
  "......................",
];

export const CLOUD_PALETTE: Record<string, string> = {
  "#": "#E4E8FF",
  "+": "#C7D2FE",
};

export const CHECK_MAP = [
  ".......##",
  "......###",
  ".....###.",
  "##..###..",
  "#####....",
  ".###.....",
  "..#......",
];

interface PixelSpriteProps {
  map: string[];
  palette: Record<string, string>;
  /** rendered width in px; height scales automatically */
  pixel?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Crisp pixel-art sprite rendered as SVG rects. No blurring, any size. */
export function PixelSprite({
  map,
  palette,
  pixel = 6,
  className,
  style,
}: PixelSpriteProps) {
  const rows = map.length;
  const cols = map[0].length;
  const rects: React.ReactNode[] = [];
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      const fill = palette[ch];
      if (!fill) continue;
      rects.push(
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1.02}
          height={1.02}
          fill={fill}
        />,
      );
    }
  });
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      className={className}
      style={{ width: cols * pixel, height: "auto", display: "block", ...style }}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {rects}
    </svg>
  );
}
