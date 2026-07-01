import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createSelectors } from "@/lib/create-selectors";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { modelchat, listenModelChat, type WireMsg } from "@/features/model-chat/lib/model-chat-api";
import { useCanvasStore } from "./canvas-store";
import { DIAGRAM_SYSTEM, serializeDiagram, parseOps } from "../lib/diagram-ai";

export interface DiagramChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** Number of diagram ops applied (assistant turns). */
  appliedCount?: number;
  error?: string;
}

interface DiagramAiState {
  messages: DiagramChatMessage[];
  provider: string | null;
  model: string | null;
  models: string[];
  busy: boolean;
  streamId: string | null;
}

interface DiagramAiActions {
  actions: {
    setBackend: (provider: string, model: string | null) => void;
    loadModels: (provider: string) => Promise<void>;
    send: (text: string) => Promise<void>;
    cancel: () => void;
    clear: () => void;
  };
}

function genId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

let unlisten: UnlistenFn | null = null;

export const useDiagramAiStore = createSelectors(
  create<DiagramAiState & DiagramAiActions>()(
    immer((set, get) => ({
      messages: [],
      provider: null,
      model: null,
      models: [],
      busy: false,
      streamId: null,
      actions: {
        setBackend: (provider, model) =>
          set((s) => {
            s.provider = provider;
            s.model = model;
          }),

        loadModels: async (provider) => {
          try {
            const list = await modelchat.models(provider);
            const ids = list.map((m) => m.id);
            set((s) => {
              s.models = ids;
              if (s.provider === provider && (!s.model || !ids.includes(s.model))) {
                s.model = ids[0] ?? null;
              }
            });
          } catch {
            set((s) => {
              s.models = [];
            });
          }
        },

        send: async (text) => {
          const trimmed = text.trim();
          const { provider, model, busy } = get();
          if (!trimmed || busy || !provider || !model) return;

          const canvas = useCanvasStore.getState();
          const diagramJson = serializeDiagram(canvas.nodes, canvas.edges);

          const assistantId = genId();
          set((s) => {
            s.messages.push({ id: genId(), role: "user", content: trimmed });
            s.messages.push({ id: assistantId, role: "assistant", content: "", streaming: true });
            s.busy = true;
          });

          // Build the wire transcript: system + prior turns + this request.
          const prior: WireMsg[] = get()
            .messages.filter((m) => m.id !== assistantId && !m.error)
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content }));
          const messages: WireMsg[] = [
            { role: "system", content: DIAGRAM_SYSTEM },
            ...prior.slice(0, -1),
            {
              role: "user",
              content: `${trimmed}\n\nCurrent diagram (JSON):\n${diagramJson}`,
            },
          ];

          const streamId = genId();
          set((s) => {
            s.streamId = streamId;
          });

          if (unlisten) {
            unlisten();
            unlisten = null;
          }
          unlisten = await listenModelChat((e) => {
            if (e.stream_id !== streamId) return;
            if (e.kind === "text_delta") {
              set((s) => {
                const m = s.messages.find((m) => m.id === assistantId);
                if (m) m.content += e.delta;
              });
            } else if (e.kind === "done") {
              finish(assistantId);
            } else if (e.kind === "error") {
              set((s) => {
                const m = s.messages.find((m) => m.id === assistantId);
                if (m) {
                  m.streaming = false;
                  m.error = e.message;
                }
                s.busy = false;
                s.streamId = null;
              });
              if (unlisten) {
                unlisten();
                unlisten = null;
              }
            }
          });

          try {
            await modelchat.stream(streamId, provider, model, messages);
          } catch (err) {
            set((s) => {
              const m = s.messages.find((m) => m.id === assistantId);
              if (m) {
                m.streaming = false;
                m.error = err instanceof Error ? err.message : String(err);
              }
              s.busy = false;
              s.streamId = null;
            });
          }
        },

        cancel: () => {
          const sid = get().streamId;
          if (sid) void modelchat.cancel(sid).catch(() => {});
          set((s) => {
            s.busy = false;
            s.streamId = null;
            const m = s.messages[s.messages.length - 1];
            if (m && m.streaming) m.streaming = false;
          });
          if (unlisten) {
            unlisten();
            unlisten = null;
          }
        },

        clear: () =>
          set((s) => {
            s.messages = [];
          }),
      },
    })),
  ),
);

/** Parse the finished assistant reply, apply ops to the diagram, and settle. */
function finish(assistantId: string) {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  const store = useDiagramAiStore.getState();
  const msg = store.messages.find((m) => m.id === assistantId);
  const reply = msg?.content ?? "";
  const { ops, error } = parseOps(reply);

  let applied = 0;
  if (ops.length > 0) {
    applied = useCanvasStore.getState().actions.applyOps(ops);
    // Let the panel fit the view to the new content.
    window.dispatchEvent(new CustomEvent("atlas:diagram-applied"));
  }

  useDiagramAiStore.setState((s) => {
    const m = s.messages.find((m) => m.id === assistantId);
    if (m) {
      m.streaming = false;
      m.appliedCount = applied;
      if (applied === 0) m.error = error ?? "No changes were applied.";
    }
    s.busy = false;
    s.streamId = null;
  });
}
