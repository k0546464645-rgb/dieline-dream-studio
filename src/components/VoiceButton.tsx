import { useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { createParser, type EventSourceMessage } from "eventsource-parser";
import { recordWav } from "@/lib/record-wav";
import { Button } from "@/components/ui/button";

type Props = {
  onText: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

async function readTranscript(res: Response): Promise<string> {
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg.slice(0, 200) || `Transcription failed (${res.status})`);
  }
  if (!res.body) throw new Error("Empty transcription response");
  let full = "";
  let final = "";
  const parser = createParser({
    onEvent(event: EventSourceMessage) {
      try {
        const data = JSON.parse(event.data) as { type?: string; delta?: string; text?: string };
        if (data.type === "transcript.text.delta" && data.delta) full += data.delta;
        if (data.type === "transcript.text.done" && data.text) final = data.text;
      } catch {
        // ignore non-JSON keepalive lines
      }
    },
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
  const text = (final || full).trim();
  if (!text) throw new Error("No speech was heard — please try again");
  return text;
}

export function VoiceButton({ onText, disabled, className }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const session = useRef<{ stop: () => Promise<File> } | null>(null);

  async function toggle() {
    if (busy) return;
    if (recording) {
      setRecording(false);
      setBusy(true);
      try {
        const file = await session.current!.stop();
        session.current = null;
        const form = new FormData();
        form.append("file", file, file.name);
        const { data } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
        const headers: Record<string, string> = data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
        const res = await fetch("/api/transcribe", { method: "POST", headers, body: form });
        onText(await readTranscript(res));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Transcription failed");
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      session.current = await recordWav();
      setRecording(true);
    } catch {
      toast.error("Microphone access was denied · אין גישה למיקרופון");
    }
  }

  return (
    <Button
      type="button"
      variant={recording ? "destructive" : "outline"}
      onClick={() => void toggle()}
      disabled={disabled || busy}
      title={recording ? "Stop and transcribe · עצירה ותמלול" : "Speak · דיבור קולי"}
      className={className}
    >
      {busy ? "…" : recording ? <Square className="size-4" /> : <Mic className="size-4" />}
    </Button>
  );
}
