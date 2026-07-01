import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  BringToFront,
  SendToBack,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SHAPES, type ShapeKind } from "../lib/shapes";
import { useCanvasStore, type EdgeArrow, type EdgeVariant } from "../stores/canvas-store";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wide text-text-tertiary shrink-0">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative flex items-center gap-1.5 cursor-pointer">
      <span
        className="h-5 w-5 rounded border border-border-default"
        style={{ background: value }}
      />
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#888888"}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

const numCls =
  "w-14 h-6 rounded border border-border-default bg-bg-elevated px-1.5 text-[11px] text-text-primary tabular-nums outline-none focus:border-[var(--accent-primary)]";
const iconBtn =
  "flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer";

export function FormatPanel() {
  const nodes = useCanvasStore.use.nodes();
  const edges = useCanvasStore.use.edges();
  const selectedIds = useCanvasStore.use.selectedIds();
  const selectedEdgeId = useCanvasStore.use.selectedEdgeId();
  const {
    updateNode,
    updateEdge,
    deleteNodes,
    deleteEdge,
    alignSelected,
    bringToFront,
    sendToBack,
  } = useCanvasStore.use.actions();

  const edge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null;
  const sel = nodes.filter((n) => selectedIds.includes(n.id));
  if (sel.length === 0 && !edge) return null;

  // Apply a style patch to every selected node.
  const patchAll = (patch: Parameters<typeof updateNode>[1]) => {
    for (const n of sel) updateNode(n.id, patch);
  };

  return (
    <div className="absolute right-3 top-3 z-10 w-60 rounded-xl border border-border-default bg-[#141414]/95 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] p-3 flex flex-col gap-2.5">
      {edge ? (
        <>
          <div className="text-[11px] font-medium text-text-secondary">Connector</div>
          <Row label="Style">
            <select
              value={edge.variant}
              onChange={(e) => updateEdge(edge.id, { variant: e.target.value as EdgeVariant })}
              className="h-6 rounded border border-border-default bg-bg-elevated px-1.5 text-[11px] text-text-primary outline-none"
            >
              {["smoothstep", "bezier", "straight", "step"].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </Row>
          <Row label="Arrow">
            <select
              value={edge.arrow}
              onChange={(e) => updateEdge(edge.id, { arrow: e.target.value as EdgeArrow })}
              className="h-6 rounded border border-border-default bg-bg-elevated px-1.5 text-[11px] text-text-primary outline-none"
            >
              {["end", "both", "none"].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </Row>
          <Row label="Dashed">
            <input
              type="checkbox"
              checked={!!edge.dashed}
              onChange={(e) => updateEdge(edge.id, { dashed: e.target.checked })}
            />
          </Row>
          <Row label="Label">
            <input
              value={edge.label ?? ""}
              onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
              className="w-32 h-6 rounded border border-border-default bg-bg-elevated px-1.5 text-[11px] text-text-primary outline-none"
              placeholder="—"
            />
          </Row>
          <button
            onClick={() => deleteEdge(edge.id)}
            className="mt-1 flex items-center justify-center gap-1.5 h-7 rounded-md border border-border-default text-[11px] text-[var(--status-error)] hover:bg-bg-hover transition-colors"
          >
            <Trash2 size={11} /> Delete
          </button>
        </>
      ) : (
        <>
          <div className="text-[11px] font-medium text-text-secondary">
            {sel.length > 1 ? `${sel.length} shapes` : "Shape"}
          </div>

          {sel.length === 1 && (
            <Row label="Type">
              <select
                value={sel[0].shape}
                onChange={(e) => patchAll({ shape: e.target.value as ShapeKind })}
                className="h-6 rounded border border-border-default bg-bg-elevated px-1.5 text-[11px] text-text-primary outline-none"
              >
                {SHAPES.map((s) => (
                  <option key={s.kind} value={s.kind}>{s.label}</option>
                ))}
              </select>
            </Row>
          )}

          <Row label="Fill">
            <ColorField value={sel[0].fill} onChange={(v) => patchAll({ fill: v })} />
          </Row>
          <Row label="Stroke">
            <ColorField value={sel[0].stroke} onChange={(v) => patchAll({ stroke: v })} />
            <input
              type="number"
              min={0}
              max={12}
              step={0.5}
              value={sel[0].strokeWidth}
              onChange={(e) => patchAll({ strokeWidth: Number(e.target.value) })}
              className={numCls}
            />
          </Row>
          <Row label="Text">
            <ColorField value={sel[0].textColor} onChange={(v) => patchAll({ textColor: v })} />
            <input
              type="number"
              min={8}
              max={48}
              value={sel[0].fontSize}
              onChange={(e) => patchAll({ fontSize: Number(e.target.value) })}
              className={numCls}
            />
          </Row>

          {sel.length === 1 && (
            <>
              <Row label="Pos">
                <input
                  type="number"
                  value={Math.round(sel[0].x)}
                  onChange={(e) => updateNode(sel[0].id, { x: Number(e.target.value) })}
                  className={numCls}
                />
                <input
                  type="number"
                  value={Math.round(sel[0].y)}
                  onChange={(e) => updateNode(sel[0].id, { y: Number(e.target.value) })}
                  className={numCls}
                />
              </Row>
              <Row label="Size">
                <input
                  type="number"
                  value={Math.round(sel[0].width)}
                  onChange={(e) => updateNode(sel[0].id, { width: Number(e.target.value) })}
                  className={numCls}
                />
                <input
                  type="number"
                  value={Math.round(sel[0].height)}
                  onChange={(e) => updateNode(sel[0].id, { height: Number(e.target.value) })}
                  className={numCls}
                />
              </Row>
            </>
          )}

          {sel.length > 1 && (
            <Row label="Align">
              <button className={iconBtn} title="Left" onClick={() => alignSelected("left")}>
                <AlignHorizontalJustifyStart size={13} />
              </button>
              <button className={iconBtn} title="Center" onClick={() => alignSelected("hcenter")}>
                <AlignHorizontalJustifyCenter size={13} />
              </button>
              <button className={iconBtn} title="Right" onClick={() => alignSelected("right")}>
                <AlignHorizontalJustifyEnd size={13} />
              </button>
              <button className={iconBtn} title="Top" onClick={() => alignSelected("top")}>
                <AlignVerticalJustifyStart size={13} />
              </button>
              <button className={iconBtn} title="Middle" onClick={() => alignSelected("vmiddle")}>
                <AlignVerticalJustifyCenter size={13} />
              </button>
              <button className={iconBtn} title="Bottom" onClick={() => alignSelected("bottom")}>
                <AlignVerticalJustifyEnd size={13} />
              </button>
            </Row>
          )}

          <div className="flex items-center gap-1 pt-0.5">
            <button className={iconBtn} title="Bring to front" onClick={() => bringToFront(selectedIds)}>
              <BringToFront size={13} />
            </button>
            <button className={iconBtn} title="Send to back" onClick={() => sendToBack(selectedIds)}>
              <SendToBack size={13} />
            </button>
            <button
              className={cn(iconBtn, "ml-auto text-[var(--status-error)]")}
              title="Delete"
              onClick={() => deleteNodes(selectedIds)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
