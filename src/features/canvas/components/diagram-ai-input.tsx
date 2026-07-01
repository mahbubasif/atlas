import { useState } from "react";
import { Sparkles, ArrowUp, Loader2 } from "lucide-react";
import { useDiagramAiStore } from "../stores/diagram-ai-store";
import { useCanvasStore } from "../stores/canvas-store";

/** Bottom-center floating prompt bar — mirrors the Memory → Timeline pill. */
export function DiagramAiInput() {
  const [value, setValue] = useState("");
  const busy = useDiagramAiStore.use.busy();
  const provider = useDiagramAiStore.use.provider();
  const { send } = useDiagramAiStore.use.actions();
  const { setChatOpen } = useCanvasStore.use.actions();

  const submit = () => {
    const text = value.trim();
    if (!text || busy || !provider) return;
    setChatOpen(true);
    void send(text);
    setValue("");
  };

  return (
    <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 w-[min(560px,calc(100%-40px))]">
      <div className="flex items-center gap-2.5 h-11 rounded-full bg-[#141414]/95 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] border border-white/[0.12] px-4">
        <Sparkles size={15} className="shrink-0 text-[var(--accent-primary)]" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Describe a diagram, or ask to change this one…"
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-text-primary placeholder:text-text-tertiary"
        />
        <button
          onClick={submit}
          disabled={!value.trim() || busy || !provider}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-primary)] text-black disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
          title={provider ? "Send" : "Configure a provider in Settings → API Keys"}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} />}
        </button>
      </div>
    </div>
  );
}
