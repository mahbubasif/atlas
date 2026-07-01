import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { shapeSvg, type ShapeKind } from "../lib/shapes";
import { useCanvasStore } from "../stores/canvas-store";

export interface DiagramNodeData extends Record<string, unknown> {
  shape: ShapeKind;
  label: string;
  body?: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  textColor: string;
  fontSize: number;
  width: number;
  height: number;
}

const HANDLE_CLASS =
  "!w-2 !h-2 !rounded-full !border !border-white/40 !bg-[var(--accent-primary)] opacity-0 group-hover:opacity-100 transition-opacity";

export const DiagramShapeNode = memo(function DiagramShapeNode({
  id,
  data,
  selected,
}: NodeProps) {
  const d = data as DiagramNodeData;
  const { updateNode, beginInteraction } = useCanvasStore.use.actions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.label);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && areaRef.current) {
      areaRef.current.focus();
      areaRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== d.label) updateNode(id, { label: draft });
  };

  const sw = d.strokeWidth;
  const geom = shapeSvg(d.shape, d.width, d.height);

  return (
    <div className="group relative" style={{ width: d.width, height: d.height }}>
      <NodeResizer
        isVisible={!!selected}
        minWidth={40}
        minHeight={28}
        onResizeStart={() => beginInteraction()}
        lineClassName="!border-[var(--accent-primary)]/60"
        handleClassName="!bg-[var(--accent-primary)] !w-2 !h-2 !rounded-sm !border-0"
      />

      {/* Connection handles on all four sides (loose mode → any is source/target). */}
      <Handle id="t" type="source" position={Position.Top} className={HANDLE_CLASS} />
      <Handle id="r" type="source" position={Position.Right} className={HANDLE_CLASS} />
      <Handle id="b" type="source" position={Position.Bottom} className={HANDLE_CLASS} />
      <Handle id="l" type="source" position={Position.Left} className={HANDLE_CLASS} />

      {/* Shape */}
      {geom.el !== "none" && (
        <svg
          width={d.width}
          height={d.height}
          className="absolute inset-0 pointer-events-none overflow-visible"
        >
          {geom.el === "rect" && (
            <rect
              x={sw / 2}
              y={sw / 2}
              width={Math.max(0, d.width - sw)}
              height={Math.max(0, d.height - sw)}
              rx={geom.rx}
              fill={d.fill}
              stroke={d.stroke}
              strokeWidth={sw}
            />
          )}
          {geom.el === "ellipse" && (
            <ellipse
              cx={d.width / 2}
              cy={d.height / 2}
              rx={Math.max(0, d.width / 2 - sw / 2)}
              ry={Math.max(0, d.height / 2 - sw / 2)}
              fill={d.fill}
              stroke={d.stroke}
              strokeWidth={sw}
            />
          )}
          {geom.el === "path" && (
            <path d={geom.d} fill={d.fill} stroke={d.stroke} strokeWidth={sw} strokeLinejoin="round" />
          )}
        </svg>
      )}

      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center px-2 py-1">
        {editing ? (
          <textarea
            ref={areaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setDraft(d.label);
                setEditing(false);
              }
              e.stopPropagation();
            }}
            className="w-full resize-none bg-transparent text-center outline-none nodrag"
            style={{ color: d.textColor, fontSize: d.fontSize, lineHeight: 1.3 }}
            rows={1}
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(d.label);
              setEditing(true);
            }}
            className="w-full whitespace-pre-wrap break-words text-center select-none"
            style={{
              color: d.label ? d.textColor : "var(--text-tertiary)",
              fontSize: d.fontSize,
              lineHeight: 1.3,
              textDecoration: d.shape === "text" && !d.label ? "none" : undefined,
            }}
          >
            {d.label || (d.shape === "text" ? "Text" : "")}
          </span>
        )}
      </div>
    </div>
  );
});
