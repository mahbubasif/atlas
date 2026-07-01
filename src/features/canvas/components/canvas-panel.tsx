import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus,
  Maximize2,
  Minimize2,
  Crosshair,
  Undo2,
  Redo2,
  Workflow,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/features/project/stores/project-store";
import { useCanvasStore } from "../stores/canvas-store";
import { defaultSize, type ShapeKind } from "../lib/shapes";
import { DiagramShapeNode, type DiagramNodeData } from "./diagram-shape-node";
import { ShapePalette, SHAPE_DND_MIME } from "./shape-palette";
import { FormatPanel } from "./format-panel";
import { DiagramChatSidebar } from "./diagram-chat-sidebar";
import { DiagramAiInput } from "./diagram-ai-input";

const nodeTypes = { shape: DiagramShapeNode };

function variantToRfType(v: string): string {
  return v === "bezier" ? "default" : v; // xyflow: default=bezier; straight/step/smoothstep as-is
}

export function CanvasPanel() {
  const fullscreen = useCanvasStore.use.fullscreen();
  const { setFullscreen } = useCanvasStore.use.actions();

  const surface = (
    <ReactFlowProvider>
      <CanvasSurface fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(!fullscreen)} />
    </ReactFlowProvider>
  );

  if (!fullscreen) return surface;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && setFullscreen(false)}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 bg-black/60"
          style={{ zIndex: "var(--z-overlay)" as unknown as number }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-12 left-6 right-6 bottom-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] overflow-hidden flex flex-col shadow-[var(--shadow-overlay)] focus:outline-none"
          style={{ zIndex: "var(--z-modal)" as unknown as number }}
        >
          <Dialog.Title className="sr-only">Diagram</Dialog.Title>
          {surface}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CanvasSurface({
  fullscreen,
  onToggleFullscreen,
}: {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const project = useProjectStore.use.currentProject();
  const projectPath = project?.path ?? null;

  const storeProjectPath = useCanvasStore.use.projectPath();
  const nodes = useCanvasStore.use.nodes();
  const edges = useCanvasStore.use.edges();
  const selectedIds = useCanvasStore.use.selectedIds();
  const selectedEdgeId = useCanvasStore.use.selectedEdgeId();
  const loaded = useCanvasStore.use.loaded();
  const chatOpen = useCanvasStore.use.chatOpen();
  const {
    loadProject,
    addShape,
    moveNode,
    resizeNode,
    deleteNodes,
    addEdge,
    deleteEdge,
    setSelectedIds,
    setSelectedEdge,
    setViewport,
    beginInteraction,
    setChatOpen,
    undo,
    redo,
  } = useCanvasStore.use.actions();

  useEffect(() => {
    if (!projectPath) return;
    if (storeProjectPath !== projectPath) {
      loadProject(projectPath).catch(() => {});
    }
  }, [projectPath, storeProjectPath, loadProject]);

  const rf = useReactFlow();

  // Fit the view after the AI applies a batch of ops.
  useEffect(() => {
    const onApplied = () => {
      requestAnimationFrame(() => rf.fitView({ duration: 400, padding: 0.2 }));
    };
    window.addEventListener("atlas:diagram-applied", onApplied);
    return () => window.removeEventListener("atlas:diagram-applied", onApplied);
  }, [rf]);

  const wrapperRef = useRef<HTMLDivElement>(null);

  const rfNodes = useMemo<Node<DiagramNodeData>[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "shape",
        position: { x: n.x, y: n.y },
        width: n.width,
        height: n.height,
        selected: selectedIds.includes(n.id),
        zIndex: n.z,
        style: { width: n.width, height: n.height },
        data: {
          shape: n.shape,
          label: n.label,
          body: n.body,
          fill: n.fill,
          stroke: n.stroke,
          strokeWidth: n.strokeWidth,
          textColor: n.textColor,
          fontSize: n.fontSize,
          width: n.width,
          height: n.height,
        },
      })),
    [nodes, selectedIds],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const stroke = e.stroke ?? "rgba(255,255,255,0.42)";
        const withArrow = e.arrow === "end" || e.arrow === "both";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
          type: variantToRfType(e.variant),
          label: e.label,
          selected: e.id === selectedEdgeId,
          markerEnd: withArrow ? { type: MarkerType.ArrowClosed, color: stroke } : undefined,
          markerStart:
            e.arrow === "both" ? { type: MarkerType.ArrowClosed, color: stroke } : undefined,
          style: {
            stroke,
            strokeWidth: 1.6,
            strokeDasharray: e.dashed ? "6 4" : undefined,
          },
        };
      }),
    [edges, selectedEdgeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          moveNode(c.id, c.position.x, c.position.y);
        } else if (c.type === "dimensions" && c.dimensions && "resizing" in c && c.resizing) {
          resizeNode(c.id, c.dimensions.width, c.dimensions.height);
        } else if (c.type === "remove") {
          deleteNodes([c.id]);
        }
      }
    },
    [moveNode, resizeNode, deleteNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) if (c.type === "remove") deleteEdge(c.id);
    },
    [deleteEdge],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) {
        addEdge(c.source, c.target, {
          sourceHandle: c.sourceHandle,
          targetHandle: c.targetHandle,
        });
      }
    },
    [addEdge],
  );

  // Multi-select comes through onSelectionChange (guarded to avoid feedback).
  const onSelectionChange = useCallback(
    ({ nodes: selN, edges: selE }: { nodes: Node[]; edges: Edge[] }) => {
      const ids = selN.map((n) => n.id);
      const cur = useCanvasStore.getState().selectedIds;
      const same = ids.length === cur.length && ids.every((id, i) => id === cur[i]);
      if (!same) setSelectedIds(ids);
      const eid = selE[0]?.id ?? null;
      if (eid !== useCanvasStore.getState().selectedEdgeId) setSelectedEdge(eid);
    },
    [setSelectedIds, setSelectedEdge],
  );

  const addAtCenter = useCallback(
    (shape: ShapeKind) => {
      const wrap = wrapperRef.current;
      const size = defaultSize(shape);
      if (!wrap) {
        addShape(shape);
        return;
      }
      const rect = wrap.getBoundingClientRect();
      const center = rf.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      addShape(shape, { x: center.x - size.w / 2, y: center.y - size.h / 2 });
    },
    [rf, addShape],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(SHAPE_DND_MIME) as ShapeKind;
      if (!kind) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const size = defaultSize(kind);
      addShape(kind, { x: pos.x - size.w / 2, y: pos.y - size.h / 2 });
    },
    [rf, addShape],
  );

  const handleFit = useCallback(() => {
    if (nodes.length === 0) return;
    rf.fitView({ duration: 350, padding: 0.2 });
  }, [rf, nodes.length]);

  const onMoveEnd = useCallback(
    (_: unknown, vp: { x: number; y: number; zoom: number }) => setViewport(vp),
    [setViewport],
  );

  // Undo/redo keyboard, scoped to the canvas wrapper.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    },
    [undo, redo],
  );

  if (!projectPath) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[12px] text-text-tertiary gap-2 px-6 text-center">
        <Workflow size={18} className="opacity-60" />
        <div>No project open.</div>
        <div className="text-[10px]">Diagrams are per-project. Open a folder to start.</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* Header / toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 h-[32px] shrink-0 border-b border-border-default">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-secondary font-medium">Diagram</span>
          <span className="text-[10px] text-text-tertiary">· {nodes.length} shapes</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => addAtCenter("rounded")}
            className="flex items-center gap-1.5 px-2 h-6 rounded text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
            title="Add shape"
          >
            <Plus size={11} /> Shape
          </button>
          <div className="mx-1 h-4 w-px bg-border-subtle" />
          <button onClick={undo} className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer" title="Undo (⌘Z)">
            <Undo2 size={12} />
          </button>
          <button onClick={redo} className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer" title="Redo (⌘⇧Z)">
            <Redo2 size={12} />
          </button>
          <button onClick={handleFit} className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer" title="Fit to view">
            <Crosshair size={12} />
          </button>
          <button onClick={onToggleFullscreen} className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer" title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <div className="mx-1 h-4 w-px bg-border-subtle" />
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={cn(
              "flex items-center gap-1.5 px-2 h-6 rounded text-[11px] transition-colors cursor-pointer",
              chatOpen
                ? "text-text-primary bg-bg-selected"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover",
            )}
            title="AI copilot"
          >
            <Sparkles size={11} /> AI
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <ShapePalette onAdd={addAtCenter} />

        <div
          ref={wrapperRef}
          className="flex-1 min-h-0 relative outline-none"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
        >
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-text-tertiary">
              Loading…
            </div>
          )}

          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeDragStart={() => beginInteraction()}
            onPaneClick={() => {
              setSelectedIds([]);
              setSelectedEdge(null);
            }}
            onMoveEnd={onMoveEnd}
            minZoom={0.2}
            maxZoom={2}
            fitView={false}
            defaultViewport={useCanvasStore.getState().viewport}
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            selectionOnDrag
            panOnScroll
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="rgba(255,255,255,0.14)" />
          </ReactFlow>

          <FormatPanel />
          <DiagramAiInput />
        </div>

        {chatOpen && <DiagramChatSidebar />}
      </div>
    </div>
  );
}

export { CanvasPanel as default };
