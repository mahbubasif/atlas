// The AI copilot protocol: the model replies with a fenced ```json block
// containing `{ "ops": [...] }`, which we parse and apply to the diagram store.
// This works for ANY text backend (BYOK provider, Claude Code, Codex).

import type {
  DiagramOp,
  DiagramNode,
  CanvasEdge,
  ShapeKind,
  EdgeVariant,
} from "../stores/canvas-store";

export const DIAGRAM_SYSTEM = `You are a diagramming copilot inside a node-and-edge diagram editor (like draw.io).
The user asks you to create or edit a diagram. You DO NOT chat conversationally — you RESPOND ONLY with a single fenced code block:

\`\`\`json
{ "ops": [ ... ] }
\`\`\`

Each op is one of:
- {"op":"add_node","id":"a","shape":"rounded","label":"Login"}   // id is any short unique string you choose; reuse it in "connect"
- {"op":"update_node","id":"a","label":"...","shape":"...","fill":"#RRGGBB","stroke":"#RRGGBB","textColor":"#RRGGBB"}
- {"op":"delete_node","id":"a"}
- {"op":"connect","source":"a","target":"b","label":"optional","variant":"smoothstep"}
- {"op":"delete_edge","id":"e_..."}
- {"op":"layout"}   // re-run auto-layout

shape ∈ rect | rounded | ellipse | diamond | parallelogram | hexagon | cylinder | text | sticky.
Use "diamond" for decisions, "cylinder" for databases, "parallelogram" for I/O.
Do NOT include x/y — positions are auto-laid-out. When EDITING, reuse the ids from the provided current diagram; only emit ops for what changes.
Colors are #RRGGBB hex. Keep labels short. Output the json block and nothing else.`;

/** Compact current-diagram context handed to the model on each turn. */
export function serializeDiagram(nodes: DiagramNode[], edges: CanvasEdge[]): string {
  return JSON.stringify({
    nodes: nodes.map((n) => ({ id: n.id, shape: n.shape, label: n.label })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label })),
  });
}

const SHAPES = new Set([
  "rect", "rounded", "ellipse", "diamond", "parallelogram", "hexagon", "cylinder", "text", "sticky",
]);

const VARIANTS = new Set(["straight", "smoothstep", "step", "bezier"]);

function coerceOp(raw: unknown): DiagramOp | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const shape = (v: unknown): ShapeKind | undefined =>
    typeof v === "string" && SHAPES.has(v) ? (v as ShapeKind) : undefined;
  const variant = (v: unknown): EdgeVariant | undefined =>
    typeof v === "string" && VARIANTS.has(v) ? (v as EdgeVariant) : undefined;
  switch (o.op) {
    case "add_node":
      return { op: "add_node", id: str(o.id), shape: shape(o.shape), label: str(o.label), fill: str(o.fill), stroke: str(o.stroke), textColor: str(o.textColor) };
    case "update_node":
      return str(o.id) ? { op: "update_node", id: str(o.id)!, shape: shape(o.shape), label: str(o.label), fill: str(o.fill), stroke: str(o.stroke), textColor: str(o.textColor) } : null;
    case "delete_node":
      return str(o.id) ? { op: "delete_node", id: str(o.id)! } : null;
    case "connect":
      return str(o.source) && str(o.target)
        ? { op: "connect", source: str(o.source)!, target: str(o.target)!, label: str(o.label), variant: variant(o.variant) }
        : null;
    case "delete_edge":
      return str(o.id) ? { op: "delete_edge", id: str(o.id)! } : null;
    case "layout":
      return { op: "layout" };
    default:
      return null;
  }
}

export interface ParsedOps {
  ops: DiagramOp[];
  error?: string;
}

/** Extract + validate the ops array from the model's reply. Tolerant of prose
 *  around the json block. Returns an error string when nothing usable is found. */
export function parseOps(text: string): ParsedOps {
  let jsonText: string | null = null;
  // Prefer the last fenced ```json block.
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  if (fences.length) jsonText = fences[fences.length - 1][1].trim();
  if (!jsonText) {
    // Fall back to the first {...} that spans an "ops" key.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) jsonText = text.slice(start, end + 1);
  }
  if (!jsonText) return { ops: [], error: "No diagram operations found in the reply." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ops: [], error: "Could not parse the model's JSON." };
  }
  const rawOps = (parsed as { ops?: unknown })?.ops;
  if (!Array.isArray(rawOps)) return { ops: [], error: "Reply had no `ops` array." };
  const ops = rawOps.map(coerceOp).filter((o): o is DiagramOp => o !== null);
  if (ops.length === 0) return { ops: [], error: "No valid operations in the reply." };
  return { ops };
}
