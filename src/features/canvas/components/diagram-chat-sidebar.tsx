import { useEffect, useRef } from "react";
import { Sparkles, X, Eraser, Check, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { PROVIDERS } from "@/features/settings/lib/providers";
import { useByokStore } from "@/features/settings/stores/byok-store";
import { useDiagramAiStore } from "../stores/diagram-ai-store";
import { useCanvasStore } from "../stores/canvas-store";

const CHAT_PROVIDERS = PROVIDERS.filter((p) => p.chat);

export function DiagramChatSidebar() {
  const messages = useDiagramAiStore.use.messages();
  const provider = useDiagramAiStore.use.provider();
  const model = useDiagramAiStore.use.model();
  const models = useDiagramAiStore.use.models();
  const busy = useDiagramAiStore.use.busy();
  const { setBackend, loadModels, clear } = useDiagramAiStore.use.actions();
  const { setChatOpen } = useCanvasStore.use.actions();

  const byokKeys = useByokStore.use.keys();
  const { load: loadKeys } = useByokStore.use.actions();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  // Configured, chat-capable providers.
  const configured = CHAT_PROVIDERS.filter((p) => byokKeys[p.id]);

  // Pick a default backend once keys are known.
  useEffect(() => {
    if (!provider && configured.length > 0) {
      const first = configured[0].id;
      setBackend(first, null);
      void loadModels(first);
    }
  }, [provider, configured, setBackend, loadModels]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  return (
    <div className="w-72 shrink-0 border-l border-border-default bg-[#0d0e0d] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 h-[32px] shrink-0 border-b border-border-default">
        <Sparkles size={13} className="text-[var(--accent-primary)]" />
        <span className="text-[11px] font-medium text-text-secondary">AI</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={clear}
            className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            title="Clear chat"
          >
            <Eraser size={12} />
          </button>
          <button
            onClick={() => setChatOpen(false)}
            className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            title="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Backend picker */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-subtle">
        {configured.length === 0 ? (
          <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
            <KeyRound size={11} /> Add a provider key in Settings → API Keys.
          </div>
        ) : (
          <>
            <select
              value={provider ?? ""}
              onChange={(e) => {
                setBackend(e.target.value, null);
                void loadModels(e.target.value);
              }}
              className="h-6 rounded border border-border-default bg-bg-elevated px-1.5 text-[10px] text-text-primary outline-none"
            >
              {configured.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={model ?? ""}
              onChange={(e) => setBackend(provider!, e.target.value)}
              className="h-6 flex-1 min-w-0 rounded border border-border-default bg-bg-elevated px-1.5 text-[10px] text-text-primary outline-none"
            >
              {models.length === 0 && <option value="">default</option>}
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-3 py-3 flex flex-col gap-2.5">
        {messages.length === 0 && (
          <div className="text-[11px] text-text-tertiary leading-relaxed">
            Describe a diagram and I'll draw it — e.g. <span className="text-text-secondary">"a user login flow with a database"</span>. Ask follow-ups to edit it.
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="self-end max-w-[85%] rounded-lg rounded-br-sm bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/25 px-2.5 py-1.5 text-[12px] text-text-primary whitespace-pre-wrap break-words">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="self-start max-w-[90%] text-[12px]">
              {m.streaming ? (
                <div className="flex items-center gap-1.5 text-text-tertiary">
                  <Loader2 size={12} className="animate-spin" /> Working…
                </div>
              ) : m.error ? (
                <div className="flex items-start gap-1.5 text-[var(--status-error)]">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" /> {m.error}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-text-secondary">
                  <Check size={12} className="text-[var(--status-success)]" />
                  Applied {m.appliedCount ?? 0} change{m.appliedCount === 1 ? "" : "s"}.
                </div>
              )}
            </div>
          ),
        )}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="self-start flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> Working…
          </div>
        )}
      </div>
    </div>
  );
}
