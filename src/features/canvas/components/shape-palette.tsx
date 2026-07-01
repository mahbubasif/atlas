import {
  Square,
  Squircle,
  Circle,
  Diamond,
  Type,
  StickyNote,
  Shapes,
  Hexagon,
  Cylinder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SHAPES, type ShapeKind } from "../lib/shapes";

const ICONS: Record<ShapeKind, React.ElementType> = {
  rect: Square,
  rounded: Squircle,
  ellipse: Circle,
  diamond: Diamond,
  text: Type,
  sticky: StickyNote,
  parallelogram: Shapes,
  hexagon: Hexagon,
  cylinder: Cylinder,
};

export const SHAPE_DND_MIME = "application/atlas-shape";

/** Left rail of draggable shapes. Drag onto the canvas (handled by the panel's
 *  `onDrop`) or click to drop one at the viewport center. */
export function ShapePalette({ onAdd }: { onAdd: (shape: ShapeKind) => void }) {
  const categories = ["Basic", "Flowchart"] as const;
  return (
    <div className="w-11 shrink-0 border-r border-border-default bg-[#0d0e0d] flex flex-col items-center gap-2 py-2 overflow-y-auto hide-scrollbar">
      {categories.map((cat) => (
        <div key={cat} className="flex flex-col items-center gap-1">
          {SHAPES.filter((s) => s.category === cat).map((s) => {
            const Icon = ICONS[s.kind] ?? Square;
            return (
              <button
                key={s.kind}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(SHAPE_DND_MIME, s.kind);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onAdd(s.kind)}
                title={`${s.label} — drag to canvas or click to add`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary",
                  "hover:bg-bg-hover hover:text-text-primary transition-colors cursor-grab active:cursor-grabbing",
                )}
              >
                <Icon size={16} strokeWidth={1.5} />
              </button>
            );
          })}
          {cat !== "Flowchart" && <div className="my-0.5 h-px w-6 bg-border-subtle" />}
        </div>
      ))}
    </div>
  );
}
