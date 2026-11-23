import { describe, it, expect } from "vitest";
import { resolveFriendVideoSource } from "./friend-video";

describe("resolveFriendVideoSource", () => {
  describe("sin configurar", () => {
    it("devuelve none con vacío, null o undefined", () => {
      expect(resolveFriendVideoSource("")).toEqual({ type: "none" });
      expect(resolveFriendVideoSource("   ")).toEqual({ type: "none" });
      expect(resolveFriendVideoSource(null)).toEqual({ type: "none" });
      expect(resolveFriendVideoSource(undefined)).toEqual({ type: "none" });
    });

    it("devuelve none si el valor no es una URL", () => {
      expect(resolveFriendVideoSource("pegar-link-aca")).toEqual({ type: "none" });
    });

    it("rechaza esquemas que no sean http/https", () => {
      expect(resolveFriendVideoSource("javascript:alert(1)")).toEqual({ type: "none" });
      expect(resolveFriendVideoSource("file:///C:/video.mp4")).toEqual({ type: "none" });
      expect(resolveFriendVideoSource("data:video/mp4;base64,AAAA")).toEqual({ type: "none" });
    });
  });

  describe("archivo de video", () => {
    it("reconoce las 4 extensiones soportadas", () => {
      for (const ext of ["mp4", "webm", "ogv", "ogg"]) {
        expect(resolveFriendVideoSource(`https://cdn.ejemplo.com/clip.${ext}`)).toEqual({
          type: "file",
          url: `https://cdn.ejemplo.com/clip.${ext}`,
        });
      }
    });

    it("reconoce la extensión sin importar mayúsculas", () => {
      expect(resolveFriendVideoSource("https://cdn.ejemplo.com/Clip.MP4")).toEqual({
        type: "file",
        url: "https://cdn.ejemplo.com/Clip.MP4",
      });
    });

    it("acepta una ruta relativa propia del portal", () => {
      expect(resolveFriendVideoSource("/friends/dashboard-video.mp4")).toEqual({
        type: "file",
        url: "/friends/dashboard-video.mp4",
      });
    });

    it("una ruta relativa sin extensión de video reconocida cae a none", () => {
      expect(resolveFriendVideoSource("/friends/dashboard-video")).toEqual({ type: "none" });
    });
  });

  describe("YouTube", () => {
    const esperado = {
      type: "embed",
      embedUrl:
        "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&loop=1&playlist=dQw4w9WgXcQ" +
        "&controls=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&playsinline=1",
    };

    it("extrae el id de las 4 formas de link", () => {
      expect(resolveFriendVideoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(esperado);
      expect(resolveFriendVideoSource("https://youtu.be/dQw4w9WgXcQ")).toEqual(esperado);
      expect(resolveFriendVideoSource("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual(esperado);
      expect(resolveFriendVideoSource("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual(esperado);
    });

    it("ignora parámetros extra del link pegado", () => {
      expect(
        resolveFriendVideoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLabc")
      ).toEqual(esperado);
    });

    it("cae a link si es un dominio de YouTube sin id de video", () => {
      expect(resolveFriendVideoSource("https://www.youtube.com/@algunCanal")).toEqual({
        type: "link",
        url: "https://www.youtube.com/@algunCanal",
      });
    });
  });

  describe("Vimeo", () => {
    const esperado = {
      type: "embed",
      embedUrl:
        "https://player.vimeo.com/video/76979871?autoplay=1&muted=1&loop=1&controls=0&title=0&byline=0&portrait=0",
    };

    it("acepta el link normal y el de player", () => {
      expect(resolveFriendVideoSource("https://vimeo.com/76979871")).toEqual(esperado);
      expect(resolveFriendVideoSource("https://player.vimeo.com/video/76979871")).toEqual(esperado);
    });

    it("cae a link si el último segmento no es un id numérico", () => {
      expect(resolveFriendVideoSource("https://vimeo.com/canal/algo")).toEqual({
        type: "link",
        url: "https://vimeo.com/canal/algo",
      });
    });
  });

  it("cualquier otro link válido queda como link, nunca como embed", () => {
    expect(resolveFriendVideoSource("https://twitch.tv/algo")).toEqual({
      type: "link",
      url: "https://twitch.tv/algo",
    });
  });
});
