// Shape catalog shared by the palette and the node renderer. Each shape is
// drawn as an SVG path generated from the node's width/height so it scales
// cleanly with the NodeResizer. Kept dependency-free and pure.

export type ShapeKind =
  | "rect"
  | "rounded"
  | "ellipse"
  | "diamond"
  | "parallelogram"
  | "cylinder"
  | "hexagon"
  | "text"
  | "sticky";

export interface ShapeDef {
  kind: ShapeKind;
  label: string;
  category: "Basic" | "Flowchart";
  /** Default size when created from the palette. */
  w: number;
  h: number;
}

export const SHAPES: ShapeDef[] = [
  { kind: "rect", label: "Rectangle", category: "Basic", w: 160, h: 80 },
  { kind: "rounded", label: "Rounded", category: "Basic", w: 160, h: 80 },
  { kind: "ellipse", label: "Ellipse", category: "Basic", w: 160, h: 90 },
  { kind: "diamond", label: "Diamond", category: "Basic", w: 150, h: 100 },
  { kind: "text", label: "Text", category: "Basic", w: 140, h: 40 },
  { kind: "sticky", label: "Sticky note", category: "Basic", w: 220, h: 140 },
  { kind: "parallelogram", label: "Data", category: "Flowchart", w: 170, h: 80 },
  { kind: "hexagon", label: "Preparation", category: "Flowchart", w: 170, h: 90 },
  { kind: "cylinder", label: "Database", category: "Flowchart", w: 130, h: 110 },
];

export const SHAPE_BY_KIND: Record<ShapeKind, ShapeDef> = SHAPES.reduce(
  (acc, s) => {
    acc[s.kind] = s;
    return acc;
  },
  {} as Record<ShapeKind, ShapeDef>,
);

/** Default per-shape size (falls back to a rectangle). */
export function defaultSize(kind: ShapeKind): { w: number; h: number } {
  const s = SHAPE_BY_KIND[kind];
  return s ? { w: s.w, h: s.h } : { w: 160, h: 80 };
}

/**
 * SVG geometry for a shape at (0,0) sized w×h. Returns either an SVG `path`
 * `d` string or, for rect/ellipse, the element kind + attrs. The renderer picks
 * the element; this keeps all geometry in one place.
 */
export function shapeSvg(
  kind: ShapeKind,
  w: number,
  h: number,
):
  | { el: "rect"; rx: number }
  | { el: "ellipse" }
  | { el: "path"; d: string }
  | { el: "none" } {
  switch (kind) {
    case "text":
      return { el: "none" };
    case "rect":
    case "sticky":
      return { el: "rect", rx: kind === "sticky" ? 10 : 2 };
    case "rounded":
      return { el: "rect", rx: 14 };
    case "ellipse":
      return { el: "ellipse" };
    case "diamond":
      return { el: "path", d: `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z` };
    case "parallelogram": {
      const s = Math.min(w * 0.22, 40);
      return { el: "path", d: `M ${s} 0 L ${w} 0 L ${w - s} ${h} L 0 ${h} Z` };
    }
    case "hexagon": {
      const s = Math.min(w * 0.2, 34);
      return { el: "path", d: `M ${s} 0 L ${w - s} 0 L ${w} ${h / 2} L ${w - s} ${h} L ${s} ${h} L 0 ${h / 2} Z` };
    }
    case "cylinder": {
      const ry = Math.min(h * 0.16, 18);
      // Top ellipse + body sides + bottom arc.
      return {
        el: "path",
        d:
          `M 0 ${ry} ` +
          `A ${w / 2} ${ry} 0 0 1 ${w} ${ry} ` +
          `L ${w} ${h - ry} ` +
          `A ${w / 2} ${ry} 0 0 1 0 ${h - ry} ` +
          `Z ` +
          `M 0 ${ry} A ${w / 2} ${ry} 0 0 0 ${w} ${ry}`,
      };
    }
    default:
      return { el: "rect", rx: 2 };
  }
}
