export type FriendVideoSource =
  | { type: "file"; url: string }
  | { type: "embed"; embedUrl: string }
  | { type: "link"; url: string }
  | { type: "none" };

const VIDEO_FILE_EXTENSIONS = [".mp4", ".webm", ".ogv", ".ogg"];

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"];
const VIMEO_HOSTS = ["vimeo.com", "www.vimeo.com", "player.vimeo.com"];

function youtubeVideoId(url: URL): string | null {
  if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ?? null;
  }
  const fromQuery = url.searchParams.get("v");
  if (fromQuery) return fromQuery;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && (segments[0] === "embed" || segments[0] === "shorts")) {
    return segments[1];
  }
  return null;
}

function vimeoVideoId(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  const candidate = segments[segments.length - 1];
  return candidate && /^\d+$/.test(candidate) ? candidate : null;
}

export function resolveFriendVideoSource(rawUrl: string | null | undefined): FriendVideoSource {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return { type: "none" };

  if (trimmed.startsWith("/")) {
    return VIDEO_FILE_EXTENSIONS.some((ext) => trimmed.toLowerCase().endsWith(ext))
      ? { type: "file", url: trimmed }
      : { type: "none" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { type: "none" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return { type: "none" };

  const path = url.pathname.toLowerCase();
  if (VIDEO_FILE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return { type: "file", url: trimmed };
  }

  if (YOUTUBE_HOSTS.includes(url.hostname)) {
    const id = youtubeVideoId(url);
    if (id) {
      return {
        type: "embed",
        embedUrl:
          `https://www.youtube.com/embed/${id}` +
          `?autoplay=1&mute=1&loop=1&playlist=${id}` +
          `&controls=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&playsinline=1`,
      };
    }
  }

  if (VIMEO_HOSTS.includes(url.hostname)) {
    const id = vimeoVideoId(url);
    if (id) {
      return {
        type: "embed",
        embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&controls=0&title=0&byline=0&portrait=0`,
      };
    }
  }

  return { type: "link", url: trimmed };
}
