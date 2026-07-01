import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createSelectors } from "@/lib/create-selectors";
import { logEvent } from "@/features/log/lib/log";
import { forceLayout } from "@/lib/graph-layout";
import { loadCanvas, saveCanvas } from "../lib/canvas-api";
import { defaultSize, type ShapeKind } from "../lib/shapes";

export type { ShapeKind } from "../lib/shapes";
export type EdgeVariant = "straight" | "smoothstep" | "step" | "bezier";
export type EdgeArrow = "end" | "none" | "both";

/** One diagram node — a shape styled entirely by its own properties (draw.io's
 *  unified model), so the renderer stays generic and the AI can restyle freely. */
export interface DiagramNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: ShapeKind;
  label: string;
  /** Sticky-note body markdown (only used by the `sticky` shape). */
  body?: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  textColor: string;
  fontSize: number;
  /** Z-order; higher renders on top. */
  z: number;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  variant: EdgeVariant;
  arrow: EdgeArrow;
  stroke?: string;
  dashed?: boolean;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

interface CanvasFile {
  version: 2;
  viewport: CanvasViewport;
  nodes: DiagramNode[];
  edges: CanvasEdge[];
}

/** Structured operations the AI copilot emits; applied as one undo batch. */
export type DiagramOp =
  | { op: "add_node"; id?: string; shape?: ShapeKind; label?: string; x?: number; y?: number; w?: number; h?: number; fill?: string; stroke?: string; textColor?: string }
  | { op: "update_node"; id: string; label?: string; shape?: ShapeKind; x?: number; y?: number; w?: number; h?: number; fill?: string; stroke?: string; textColor?: string }
  | { op: "delete_node"; id: string }
  | { op: "connect"; source: string; target: string; label?: string; variant?: EdgeVariant; arrow?: EdgeArrow }
  | { op: "delete_edge"; id: string }
  | { op: "layout"; algo?: "force" };

export const NODE_DEFAULTS = {
  fill: "#20222b",
  stroke: "#9aa4b2",
  strokeWidth: 1.5,
  textColor: "#e8eaed",
  fontSize: 13,
};

interface CanvasState {
  projectPath: string | null;
  loaded: boolean;
  nodes: DiagramNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  selectedIds: string[];
  selectedEdgeId: string | null;
  fullscreen: boolean;
  /** True while the AI-chat sidebar is open. */
  chatOpen: boolean;
  undoStack: Array<{ nodes: DiagramNode[]; edges: CanvasEdge[] }>;
  redoStack: Array<{ nodes: DiagramNode[]; edges: CanvasEdge[] }>;
}

type AlignAxis = "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom";

interface CanvasActions {
  actions: {
    loadProject: (path: string) => Promise<void>;
    addShape: (shape: ShapeKind, at?: { x: number; y: number }) => string;
    updateNode: (id: string, patch: Partial<DiagramNode>) => void;
    moveNode: (id: string, x: number, y: number) => void;
    resizeNode: (id: string, w: number, h: number, x?: number, y?: number) => void;
    deleteNodes: (ids: string[]) => void;
    duplicate: (ids: string[]) => void;
    bringToFront: (ids: string[]) => void;
    sendToBack: (ids: string[]) => void;
    alignSelected: (axis: AlignAxis) => void;
    addEdge: (source: string, target: string, opts?: Partial<CanvasEdge>) => void;
    updateEdge: (id: string, patch: Partial<CanvasEdge>) => void;
    deleteEdge: (id: string) => void;
    setSelectedIds: (ids: string[]) => void;
    setSelectedEdge: (id: string | null) => void;
    setViewport: (vp: CanvasViewport) => void;
    setFullscreen: (open: boolean) => void;
    toggleFullscreen: () => void;
    setChatOpen: (open: boolean) => void;
    beginInteraction: () => void;
    undo: () => void;
    redo: () => void;
    /** AI hooks. */
    applyOps: (ops: DiagramOp[]) => number;
    replaceDiagram: (nodes: DiagramNode[], edges: CanvasEdge[]) => void;
  };
}

function genId(prefix: "n" | "e"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

const emptyViewport: CanvasViewport = { x: 0, y: 0, zoom: 1 };
const HISTORY_CAP = 60;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 400;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const s = useCanvasStore.getState();
    if (!s.projectPath || !s.loaded) return;
    const payload: CanvasFile = {
      version: 2,
      viewport: s.viewport,
      nodes: s.nodes,
      edges: s.edges,
    };
    try {
      await saveCanvas(s.projectPath, JSON.stringify(payload));
    } catch (err) {
      console.error("save canvas failed", err);
    }
  }, SAVE_DEBOUNCE_MS);
}

/** Fill defaults + migrate a v1 sticky-note node to the v2 shape model. */
function normalizeNode(raw: Record<string, unknown>, i: number): DiagramNode {
  const r = raw as Partial<DiagramNode> & { title?: string };
  const stamp = nowIso();
  const isLegacy = r.shape === undefined && (r.title !== undefined || r.body !== undefined);
  const shape: ShapeKind = r.shape ?? (isLegacy ? "sticky" : "rect");
  const size = defaultSize(shape);
  return {
    id: r.id ?? genId("n"),
    x: typeof r.x === "number" ? r.x : 0,
    y: typeof r.y === "number" ? r.y : 0,
    width: typeof r.width === "number" ? r.width : size.w,
    height: typeof r.height === "number" ? r.height : size.h,
    shape,
    label: r.label ?? r.title ?? "",
    body: r.body,
    fill: r.fill ?? NODE_DEFAULTS.fill,
    stroke: r.stroke ?? NODE_DEFAULTS.stroke,
    strokeWidth: typeof r.strokeWidth === "number" ? r.strokeWidth : NODE_DEFAULTS.strokeWidth,
    textColor: r.textColor ?? NODE_DEFAULTS.textColor,
    fontSize: typeof r.fontSize === "number" ? r.fontSize : NODE_DEFAULTS.fontSize,
    z: typeof r.z === "number" ? r.z : i,
    createdAt: r.createdAt ?? stamp,
    updatedAt: r.updatedAt ?? stamp,
  };
}

function normalizeEdge(raw: Record<string, unknown>): CanvasEdge | null {
  const r = raw as Partial<CanvasEdge>;
  if (!r.source || !r.target) return null;
  return {
    id: r.id ?? genId("e"),
    source: r.source,
    target: r.target,
    label: r.label,
    variant: r.variant ?? "smoothstep",
    arrow: r.arrow ?? "end",
    stroke: r.stroke,
    dashed: r.dashed,
    sourceHandle: r.sourceHandle ?? null,
    targetHandle: r.targetHandle ?? null,
  };
}

function parseFile(raw: string): CanvasFile {
  try {
    const parsed = JSON.parse(raw) as {
      viewport?: CanvasViewport;
      nodes?: unknown[];
      edges?: unknown[];
    };
    const nodes = Array.isArray(parsed.nodes)
      ? parsed.nodes.map((n, i) => normalizeNode(n as Record<string, unknown>, i))
      : [];
    const edges = Array.isArray(parsed.edges)
      ? parsed.edges
          .map((e) => normalizeEdge(e as Record<string, unknown>))
          .filter((e): e is CanvasEdge => e !== null)
      : [];
    return { version: 2, viewport: parsed.viewport ?? emptyViewport, nodes, edges };
  } catch {
    return { version: 2, viewport: emptyViewport, nodes: [], edges: [] };
  }
}

function snapshot(s: CanvasState): { nodes: DiagramNode[]; edges: CanvasEdge[] } {
  return {
    nodes: s.nodes.map((n) => ({ ...n })),
    edges: s.edges.map((e) => ({ ...e })),
  };
}

/** Push the current node/edge state onto the undo stack (clears redo). Call
 *  BEFORE a discrete mutation; drag/resize call `beginInteraction` on start. */
function pushHistory(s: CanvasState) {
  s.undoStack.push(snapshot(s));
  if (s.undoStack.length > HISTORY_CAP) s.undoStack.shift();
  s.redoStack = [];
}

function makeNode(
  shape: ShapeKind,
  x: number,
  y: number,
  extra: Partial<DiagramNode> = {},
): DiagramNode {
  const size = defaultSize(shape);
  const stamp = nowIso();
  return {
    id: extra.id ?? genId("n"),
    x,
    y,
    width: extra.width ?? size.w,
    height: extra.height ?? size.h,
    shape,
    label: extra.label ?? "",
    body: extra.body,
    fill: extra.fill ?? NODE_DEFAULTS.fill,
    stroke: extra.stroke ?? NODE_DEFAULTS.stroke,
    strokeWidth: extra.strokeWidth ?? NODE_DEFAULTS.strokeWidth,
    textColor: extra.textColor ?? NODE_DEFAULTS.textColor,
    fontSize: extra.fontSize ?? NODE_DEFAULTS.fontSize,
    z: extra.z ?? 0,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export const useCanvasStore = createSelectors(
  create<CanvasState & CanvasActions>()(
    immer((set, get) => ({
      projectPath: null,
      loaded: false,
      nodes: [],
      edges: [],
      viewport: emptyViewport,
      selectedIds: [],
      selectedEdgeId: null,
      fullscreen: false,
      chatOpen: false,
      undoStack: [],
      redoStack: [],
      actions: {
        loadProject: async (path) => {
          if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
          }
          set((s) => {
            s.projectPath = path;
            s.loaded = false;
            s.nodes = [];
            s.edges = [];
            s.selectedIds = [];
            s.selectedEdgeId = null;
            s.undoStack = [];
            s.redoStack = [];
            s.viewport = emptyViewport;
          });
          try {
            const raw = await loadCanvas(path);
            const parsed = parseFile(raw);
            set((s) => {
              if (s.projectPath !== path) return;
              s.nodes = parsed.nodes;
              s.edges = parsed.edges;
              s.viewport = parsed.viewport;
              s.loaded = true;
            });
          } catch {
            set((s) => {
              if (s.projectPath !== path) return;
              s.loaded = true;
            });
          }
        },

        addShape: (shape, at) => {
          const id = genId("n");
          set((s) => {
            pushHistory(s);
            const maxZ = s.nodes.reduce((m, n) => Math.max(m, n.z), 0);
            s.nodes.push(
              makeNode(shape, at?.x ?? 0, at?.y ?? 0, { id, z: maxZ + 1 }),
            );
            s.selectedIds = [id];
            s.selectedEdgeId = null;
          });
          scheduleSave();
          logEvent({ source: "canvas", kind: "shape-add", summary: shape, payload: { id } });
          return id;
        },

        updateNode: (id, patch) =>
          set((s) => {
            const n = s.nodes.find((n) => n.id === id);
            if (!n) return;
            pushHistory(s);
            Object.assign(n, patch);
            n.updatedAt = nowIso();
            scheduleSave();
          }),

        moveNode: (id, x, y) =>
          set((s) => {
            const n = s.nodes.find((n) => n.id === id);
            if (!n) return;
            n.x = x;
            n.y = y;
            scheduleSave();
          }),

        resizeNode: (id, w, h, x, y) =>
          set((s) => {
            const n = s.nodes.find((n) => n.id === id);
            if (!n) return;
            n.width = Math.max(24, w);
            n.height = Math.max(20, h);
            if (typeof x === "number") n.x = x;
            if (typeof y === "number") n.y = y;
            scheduleSave();
          }),

        deleteNodes: (ids) => {
          if (ids.length === 0) return;
          const set2 = new Set(ids);
          set((s) => {
            pushHistory(s);
            s.nodes = s.nodes.filter((n) => !set2.has(n.id));
            s.edges = s.edges.filter((e) => !set2.has(e.source) && !set2.has(e.target));
            s.selectedIds = s.selectedIds.filter((id) => !set2.has(id));
            scheduleSave();
          });
          logEvent({ source: "canvas", kind: "shape-delete", summary: `${ids.length} deleted` });
        },

        duplicate: (ids) => {
          if (ids.length === 0) return;
          set((s) => {
            pushHistory(s);
            const created: string[] = [];
            for (const id of ids) {
              const n = s.nodes.find((n) => n.id === id);
              if (!n) continue;
              const nid = genId("n");
              s.nodes.push({ ...n, id: nid, x: n.x + 24, y: n.y + 24, createdAt: nowIso(), updatedAt: nowIso() });
              created.push(nid);
            }
            if (created.length) s.selectedIds = created;
            scheduleSave();
          });
        },

        bringToFront: (ids) =>
          set((s) => {
            const idset = new Set(ids);
            const maxZ = s.nodes.reduce((m, n) => Math.max(m, n.z), 0);
            let z = maxZ;
            for (const n of s.nodes) if (idset.has(n.id)) n.z = ++z;
            scheduleSave();
          }),

        sendToBack: (ids) =>
          set((s) => {
            const idset = new Set(ids);
            const minZ = s.nodes.reduce((m, n) => Math.min(m, n.z), 0);
            let z = minZ;
            for (const n of s.nodes) if (idset.has(n.id)) n.z = --z;
            scheduleSave();
          }),

        alignSelected: (axis) =>
          set((s) => {
            const sel = s.nodes.filter((n) => s.selectedIds.includes(n.id));
            if (sel.length < 2) return;
            pushHistory(s);
            const minX = Math.min(...sel.map((n) => n.x));
            const maxX = Math.max(...sel.map((n) => n.x + n.width));
            const minY = Math.min(...sel.map((n) => n.y));
            const maxY = Math.max(...sel.map((n) => n.y + n.height));
            for (const n of sel) {
              if (axis === "left") n.x = minX;
              else if (axis === "right") n.x = maxX - n.width;
              else if (axis === "hcenter") n.x = (minX + maxX) / 2 - n.width / 2;
              else if (axis === "top") n.y = minY;
              else if (axis === "bottom") n.y = maxY - n.height;
              else if (axis === "vmiddle") n.y = (minY + maxY) / 2 - n.height / 2;
            }
            scheduleSave();
          }),

        addEdge: (source, target, opts) => {
          if (source === target) return;
          const exists = get().edges.some(
            (e) =>
              (e.source === source && e.target === target) ||
              (e.source === target && e.target === source),
          );
          if (exists) return;
          set((s) => {
            pushHistory(s);
            s.edges.push({
              id: genId("e"),
              source,
              target,
              variant: opts?.variant ?? "smoothstep",
              arrow: opts?.arrow ?? "end",
              label: opts?.label,
              stroke: opts?.stroke,
              dashed: opts?.dashed,
              sourceHandle: opts?.sourceHandle ?? null,
              targetHandle: opts?.targetHandle ?? null,
            });
            scheduleSave();
          });
        },

        updateEdge: (id, patch) =>
          set((s) => {
            const e = s.edges.find((e) => e.id === id);
            if (!e) return;
            pushHistory(s);
            Object.assign(e, patch);
            scheduleSave();
          }),

        deleteEdge: (id) =>
          set((s) => {
            pushHistory(s);
            s.edges = s.edges.filter((e) => e.id !== id);
            if (s.selectedEdgeId === id) s.selectedEdgeId = null;
            scheduleSave();
          }),

        setSelectedIds: (ids) =>
          set((s) => {
            s.selectedIds = ids;
            if (ids.length) s.selectedEdgeId = null;
          }),

        setSelectedEdge: (id) =>
          set((s) => {
            s.selectedEdgeId = id;
            if (id) s.selectedIds = [];
          }),

        setViewport: (vp) =>
          set((s) => {
            s.viewport = vp;
            scheduleSave();
          }),

        setFullscreen: (open) =>
          set((s) => {
            s.fullscreen = open;
          }),

        toggleFullscreen: () =>
          set((s) => {
            s.fullscreen = !s.fullscreen;
          }),

        setChatOpen: (open) =>
          set((s) => {
            s.chatOpen = open;
          }),

        beginInteraction: () =>
          set((s) => {
            pushHistory(s);
          }),

        undo: () =>
          set((s) => {
            const prev = s.undoStack.pop();
            if (!prev) return;
            s.redoStack.push(snapshot(s));
            s.nodes = prev.nodes;
            s.edges = prev.edges;
            s.selectedIds = [];
            s.selectedEdgeId = null;
            scheduleSave();
          }),

        redo: () =>
          set((s) => {
            const next = s.redoStack.pop();
            if (!next) return;
            s.undoStack.push(snapshot(s));
            s.nodes = next.nodes;
            s.edges = next.edges;
            s.selectedIds = [];
            s.selectedEdgeId = null;
            scheduleSave();
          }),

        applyOps: (ops) => {
          let changed = 0;
          set((s) => {
            pushHistory(s);
            const created: string[] = [];
            for (const op of ops) {
              try {
                if (op.op === "add_node") {
                  const nid = op.id ?? genId("n");
                  if (s.nodes.some((n) => n.id === nid)) continue;
                  const maxZ = s.nodes.reduce((m, n) => Math.max(m, n.z), 0);
                  s.nodes.push(
                    makeNode(op.shape ?? "rounded", op.x ?? 0, op.y ?? 0, {
                      id: nid,
                      label: op.label ?? "",
                      width: op.w,
                      height: op.h,
                      fill: op.fill,
                      stroke: op.stroke,
                      textColor: op.textColor,
                      z: maxZ + 1,
                    }),
                  );
                  created.push(nid);
                  changed++;
                } else if (op.op === "update_node") {
                  const n = s.nodes.find((n) => n.id === op.id);
                  if (!n) continue;
                  if (op.label !== undefined) n.label = op.label;
                  if (op.shape !== undefined) n.shape = op.shape;
                  if (op.x !== undefined) n.x = op.x;
                  if (op.y !== undefined) n.y = op.y;
                  if (op.w !== undefined) n.width = op.w;
                  if (op.h !== undefined) n.height = op.h;
                  if (op.fill !== undefined) n.fill = op.fill;
                  if (op.stroke !== undefined) n.stroke = op.stroke;
                  if (op.textColor !== undefined) n.textColor = op.textColor;
                  n.updatedAt = nowIso();
                  changed++;
                } else if (op.op === "delete_node") {
                  s.nodes = s.nodes.filter((n) => n.id !== op.id);
                  s.edges = s.edges.filter((e) => e.source !== op.id && e.target !== op.id);
                  changed++;
                } else if (op.op === "connect") {
                  if (op.source === op.target) continue;
                  const dup = s.edges.some((e) => e.source === op.source && e.target === op.target);
                  if (dup) continue;
                  if (!s.nodes.some((n) => n.id === op.source) || !s.nodes.some((n) => n.id === op.target)) continue;
                  s.edges.push({
                    id: genId("e"),
                    source: op.source,
                    target: op.target,
                    label: op.label,
                    variant: op.variant ?? "smoothstep",
                    arrow: op.arrow ?? "end",
                    sourceHandle: null,
                    targetHandle: null,
                  });
                  changed++;
                } else if (op.op === "delete_edge") {
                  s.edges = s.edges.filter((e) => e.id !== op.id);
                  changed++;
                }
              } catch {
                /* skip malformed op */
              }
            }
            // Position any AI-created nodes that lack real coordinates.
            const needLayout = s.nodes.filter((n) => created.includes(n.id) && n.x === 0 && n.y === 0);
            const doLayout = ops.some((o) => o.op === "layout") || needLayout.length > 1;
            if (doLayout && s.nodes.length > 0) {
              const deg = new Map<string, number>();
              for (const e of s.edges) {
                deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
                deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
              }
              const pos = forceLayout(
                s.nodes.map((n) => ({ id: n.id, degree: deg.get(n.id) ?? 0 })),
                s.edges.map((e) => ({ from: e.source, to: e.target })),
                1200,
                800,
                { spacing: 1.1 },
              );
              const targets = ops.some((o) => o.op === "layout") ? s.nodes : s.nodes.filter((n) => created.includes(n.id));
              for (const n of targets) {
                const p = pos[n.id];
                if (p) {
                  n.x = Math.round(p.x - n.width / 2);
                  n.y = Math.round(p.y - n.height / 2);
                }
              }
            }
            if (created.length) s.selectedIds = created;
            scheduleSave();
          });
          return changed;
        },

        replaceDiagram: (nodes, edges) =>
          set((s) => {
            pushHistory(s);
            s.nodes = nodes;
            s.edges = edges;
            s.selectedIds = [];
            s.selectedEdgeId = null;
            scheduleSave();
          }),
      },
    })),
  ),
);
