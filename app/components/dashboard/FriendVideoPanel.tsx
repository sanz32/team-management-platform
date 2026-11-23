import { Clapperboard, ExternalLink } from "lucide-react";
import { resolveFriendVideoSource } from "@/lib/friend-video";
import EmptyState from "../EmptyState";
import FriendVideoPlayer from "./FriendVideoPlayer";

export default function FriendVideoPanel({ videoUrl }: { videoUrl: string | null }) {
  const source = resolveFriendVideoSource(videoUrl);

  return (
    <div className="hud-panel px-5 py-4">
      {source.type === "none" && (
        <EmptyState
          icon={Clapperboard}
          message="Sin video configurado"
          description="Cuando haya uno cargado, aparece acá y se reproduce solo."
        />
      )}

      {source.type === "file" && <FriendVideoPlayer src={source.url} />}

      {source.type === "embed" && (
        <iframe
          src={source.embedUrl}
          title="Video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="w-full aspect-video rounded-lg border-0 bg-canvas"
        />
      )}

      {source.type === "link" && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-ink-muted text-sm">Este video se abre fuera del portal.</p>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Ver video
          </a>
        </div>
      )}
    </div>
  );
}
