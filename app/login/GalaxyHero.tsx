"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  depth: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
  ember: boolean;
}

interface GalaxyPoint {
  x: number;
  y: number;
  tt: number;
  size: number;
  warmth: number;
  alpha: number;
}

interface NebulaPuff {
  x: number;
  y: number;
  r: number;
  warmth: number;
  alpha: number;
}

const ARMS = 4;
const FLATTEN = 0.46;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function GalaxyHero({ children }: { children?: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let width = 0;
    let height = 0;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let rotX = 0;
    let rotY = 0;
    let velX = 0;
    let velY = 0;
    let nebulaAngle = 0;
    let time = 0;
    let startTime: number | null = null;
    let elapsed = 0;
    let galaxyCenterX = 0;
    let galaxyCenterY = 0;
    let spiralR = 0;
    let builtForRadius = 0;
    let layerSize = 0;
    let puffLayer: HTMLCanvasElement | null = null;
    let pointLayer: HTMLCanvasElement | null = null;

    const stars: Star[] = [];

    function buildStars() {
      const counts = [140, 110, 70];
      for (let l = 0; l < counts.length; l++) {
        for (let i = 0; i < counts[l]; i++) {
          stars.push({
            x: Math.random(),
            y: Math.random(),
            depth: l,
            r: (l + 1) * (0.55 + Math.random() * 0.9),
            baseAlpha: 0.35 + Math.random() * 0.65,
            twinkleSpeed: 0.5 + Math.random() * 1.8,
            phase: Math.random() * Math.PI * 2,
            ember: Math.random() < 0.14,
          });
        }
      }
    }

    function buildLayers() {
      if (!spiralR) return;
      const size = Math.ceil(spiralR * 2.3);
      layerSize = size;

      const puffs: NebulaPuff[] = [];
      for (let a = 0; a < ARMS; a++) {
        const pitchVar = a % 2 === 0 ? 0.12 : -0.08;
        const armOffset = (a / ARMS) * Math.PI * 2;
        for (let i = 0; i < 26; i++) {
          const tt = 0.08 + (i / 26) * 0.85 + (Math.random() - 0.5) * 0.03;
          const jAngle = (Math.random() - 0.5) * 0.1;
          const jRadius = (Math.random() - 0.5) * spiralR * 0.045;
          const angle = armOffset + Math.pow(tt, 0.94) * Math.PI * (2.1 + pitchVar) + jAngle;
          const radius = spiralR * 0.04 + tt * spiralR + jRadius;
          puffs.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius * FLATTEN,
            r: spiralR * (0.05 + Math.random() * 0.09) * (1 - tt * 0.3),
            warmth: Math.max(0, 1 - tt * 1.9),
            alpha: 0.07 + Math.random() * 0.1,
          });
        }
      }

      const points: GalaxyPoint[] = [];
      const perArm = 340;
      for (let a = 0; a < ARMS; a++) {
        const pitchVar = a % 2 === 0 ? 0.12 : -0.08;
        const armOffset = (a / ARMS) * Math.PI * 2;
        for (let i = 0; i < perArm; i++) {
          const tt = Math.pow(Math.random(), 0.65);
          const spread = 0.05 + tt * 0.16;
          const jAngle = (Math.random() - 0.5) * spread;
          const jRadius = (Math.random() - 0.5) * spiralR * 0.05 * (0.4 + tt);
          const angle = armOffset + Math.pow(tt, 0.94) * Math.PI * (2.1 + pitchVar) + jAngle;
          const radius = spiralR * 0.04 + tt * spiralR + jRadius;
          const bright = Math.random() > 0.93;
          points.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius * FLATTEN,
            tt,
            size: bright ? 1.6 + Math.random() * 1.4 : 0.4 + Math.random() * 1.1,
            warmth: Math.max(0, Math.min(1, 1.15 - tt * 1.35 + (Math.random() - 0.5) * 0.25)),
            alpha: 0.25 + Math.random() * 0.55,
          });
        }
      }
      for (let i = 0; i < 260; i++) {
        const tt = Math.pow(Math.random(), 1.4);
        const angle = Math.random() * Math.PI * 2;
        const radius = tt * spiralR;
        points.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius * FLATTEN,
          tt,
          size: 0.3 + Math.random() * 0.7,
          warmth: Math.max(0, Math.min(1, 1.05 - tt * 1.3)),
          alpha: 0.08 + Math.random() * 0.2,
        });
      }

      const pl = document.createElement("canvas");
      pl.width = size;
      pl.height = size;
      const pc = pl.getContext("2d");
      if (!pc) return;
      pc.translate(size / 2, size / 2);

      pc.save();
      pc.scale(1, FLATTEN);
      const coreGlow = pc.createRadialGradient(0, 0, 0, 0, 0, spiralR * 0.5);
      coreGlow.addColorStop(0, "rgba(255,186,108,0.11)");
      coreGlow.addColorStop(0.4, "rgba(206,112,38,0.055)");
      coreGlow.addColorStop(1, "rgba(150,70,20,0)");
      pc.fillStyle = coreGlow;
      pc.beginPath();
      pc.arc(0, 0, spiralR * 0.5, 0, Math.PI * 2);
      pc.fill();
      pc.restore();

      for (const p of puffs) {
        const g = pc.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        const r = Math.round(lerp(112, 255, p.warmth));
        const gr = Math.round(lerp(88, 158, p.warmth));
        const b = Math.round(lerp(186, 62, p.warmth));
        g.addColorStop(0, `rgba(${r},${gr},${b},${p.alpha})`);
        g.addColorStop(0.55, `rgba(${r},${gr},${b},${p.alpha * 0.38})`);
        g.addColorStop(1, `rgba(${r},${gr},${b},0)`);
        pc.beginPath();
        pc.fillStyle = g;
        pc.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        pc.fill();
      }
      puffLayer = pl;

      const gl = document.createElement("canvas");
      gl.width = size;
      gl.height = size;
      const gc = gl.getContext("2d");
      if (!gc) return;
      gc.translate(size / 2, size / 2);
      gc.globalCompositeOperation = "lighter";

      gc.save();
      gc.scale(1, FLATTEN);
      const bulge = gc.createRadialGradient(0, 0, 0, 0, 0, spiralR * 0.17);
      bulge.addColorStop(0, "rgba(255,240,218,0.44)");
      bulge.addColorStop(0.38, "rgba(255,168,64,0.22)");
      bulge.addColorStop(1, "rgba(255,125,10,0)");
      gc.fillStyle = bulge;
      gc.beginPath();
      gc.arc(0, 0, spiralR * 0.17, 0, Math.PI * 2);
      gc.fill();
      gc.restore();

      for (const p of points) {
        const alpha = p.alpha * (1 - p.tt * 0.62);
        const r = Math.round(lerp(178, 255, p.warmth));
        const g = Math.round(lerp(166, 186, p.warmth));
        const b = Math.round(lerp(226, 96, p.warmth));
        gc.beginPath();
        gc.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        gc.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        gc.fill();
      }
      pointLayer = gl;

      builtForRadius = spiralR;
    }

    function resize() {
      const rect = container!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      canvas!.style.width = rect.width + "px";
      canvas!.style.height = rect.height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (titleRef.current) {
        const tRect = titleRef.current.getBoundingClientRect();
        galaxyCenterX = tRect.left + tRect.width / 2 - rect.left;
        galaxyCenterY = tRect.top + tRect.height / 2 - rect.top;
      } else {
        galaxyCenterX = width * 0.5;
        galaxyCenterY = height * 0.42;
      }

      spiralR = Math.min(width, height) * 0.78;
      if (!pointLayer || Math.abs(spiralR - builtForRadius) > builtForRadius * 0.02) {
        buildLayers();
      }
    }

    function handleDownEvt(clientX: number, clientY: number) {
      isDragging = true;
      lastX = clientX;
      lastY = clientY;
    }

    function handleMoveEvt(clientX: number, clientY: number) {
      if (!isDragging) return;
      const dx = clientX - lastX;
      const dy = clientY - lastY;
      velX = dx * 0.06;
      velY = dy * 0.06;
      rotX += dx * 0.06;
      rotY = Math.max(-40, Math.min(40, rotY + dy * 0.06));
      lastX = clientX;
      lastY = clientY;
    }

    function handleUpEvt() {
      isDragging = false;
    }

    function onMouseDown(e: MouseEvent) {
      handleDownEvt(e.clientX, e.clientY);
    }
    function onMouseMove(e: MouseEvent) {
      handleMoveEvt(e.clientX, e.clientY);
    }
    function onMouseUp() {
      handleUpEvt();
    }
    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (t) handleDownEvt(t.clientX, t.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (t) handleMoveEvt(t.clientX, t.clientY);
    }
    function onTouchEnd() {
      handleUpEvt();
    }
    function onResize() {
      resize();
      if (reduceMotion) draw();
    }

    function draw() {
      const w = width;
      const h = height;
      if (!w || !h) return;
      ctx!.clearRect(0, 0, w, h);

      const starsIn = easeOutCubic((elapsed - 0.1) / 1.1);
      const galaxyIn = easeOutCubic((elapsed - 0.5) / 1.4);
      const igniteIn = easeOutCubic((elapsed - 1) / 1.8);

      const coreX = galaxyCenterX - w * 0.015;
      const coreY = galaxyCenterY + h * 0.02;

      const bg = ctx!.createRadialGradient(
        w * 0.5,
        h * 0.34,
        0,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.78
      );
      bg.addColorStop(0, "#1d1006");
      bg.addColorStop(0.4, "#100b1c");
      bg.addColorStop(1, "#050409");
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, w, h);

      ctx!.save();
      ctx!.translate(w * 0.5, h * 0.42);
      ctx!.rotate(nebulaAngle);
      const blobs = [
        { dx: -w * 0.17, dy: -h * 0.04, r: Math.max(w, h) * 0.42, c: "rgba(255,125,10,0.11)" },
        { dx: w * 0.21, dy: h * 0.09, r: Math.max(w, h) * 0.38, c: "rgba(104,62,196,0.20)" },
        { dx: w * 0.03, dy: -h * 0.19, r: Math.max(w, h) * 0.3, c: "rgba(255,160,60,0.09)" },
        { dx: -w * 0.06, dy: h * 0.21, r: Math.max(w, h) * 0.26, c: "rgba(64,42,138,0.22)" },
      ];
      blobs.forEach((b) => {
        const grad = ctx!.createRadialGradient(b.dx, b.dy, 0, b.dx, b.dy, b.r);
        grad.addColorStop(0, b.c);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(b.dx, b.dy, b.r, 0, Math.PI * 2);
        ctx!.fill();
      });
      ctx!.restore();

      if (puffLayer && pointLayer) {
        const half = layerSize / 2;
        ctx!.save();
        ctx!.globalAlpha = galaxyIn;
        ctx!.translate(coreX, coreY);
        ctx!.rotate(nebulaAngle * 1.6);
        ctx!.drawImage(puffLayer, -half, -half);
        ctx!.globalCompositeOperation = "lighter";
        ctx!.drawImage(pointLayer, -half, -half);
        ctx!.restore();
      }

      if (igniteIn > 0) {
        const cx = coreX;
        const cy = coreY;
        const bloom = ctx!.createRadialGradient(cx, cy, 0, cx, cy, spiralR * 0.34);
        bloom.addColorStop(0, `rgba(255,166,72,${0.12 * igniteIn})`);
        bloom.addColorStop(0.5, `rgba(255,125,10,${0.045 * igniteIn})`);
        bloom.addColorStop(1, "rgba(255,125,10,0)");
        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";
        ctx!.fillStyle = bloom;
        ctx!.beginPath();
        ctx!.arc(cx, cy, spiralR * 0.34, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      ctx!.save();
      ctx!.globalAlpha = starsIn;
      stars.forEach((s) => {
        const parallax = (s.depth + 1) * 1.1;
        const driftX = Math.sin(time * 0.35 + s.phase) * (4 + s.depth * 2);
        const driftY = Math.cos(time * 0.3 + s.phase * 1.3) * (4 + s.depth * 2);
        const px = s.x * w + rotX * parallax * 0.35 + driftX;
        const py = s.y * h + rotY * parallax * 0.35 + driftY;
        const wrappedX = ((px % w) + w) % w;
        const wrappedY = ((py % h) + h) % h;
        const twinkle = 0.5 + 0.5 * Math.sin(time * s.twinkleSpeed + s.phase);
        const alpha = s.baseAlpha * (0.55 + 0.45 * twinkle);
        ctx!.beginPath();
        ctx!.fillStyle = s.ember ? `rgba(255,170,84,${alpha})` : `rgba(255,255,255,${alpha})`;
        ctx!.arc(wrappedX, wrappedY, s.r, 0, Math.PI * 2);
        ctx!.fill();
        if (s.ember || s.r > 1.8) {
          ctx!.beginPath();
          ctx!.fillStyle = s.ember
            ? `rgba(255,150,60,${alpha * 0.2})`
            : `rgba(206,196,255,${alpha * 0.14})`;
          ctx!.arc(wrappedX, wrappedY, s.r * 3.2, 0, Math.PI * 2);
          ctx!.fill();
        }
      });
      ctx!.restore();

      const vg = ctx!.createRadialGradient(
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.28,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.72
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.62)");
      ctx!.fillStyle = vg;
      ctx!.fillRect(0, 0, w, h);
    }

    let raf = 0;
    function loop(t: number) {
      if (startTime === null) startTime = t;
      elapsed = (t - startTime) * 0.001;
      time = t * 0.001;
      if (!isDragging) {
        velX *= 0.94;
        velY *= 0.94;
        rotX += velX * 0.4;
        rotY += velY * 0.4;
        rotY *= 0.985;
      }
      nebulaAngle = -time * 0.0045;
      draw();
      raf = requestAnimationFrame(loop);
    }

    buildStars();
    resize();

    let disposed = false;
    document.fonts?.ready.then(() => {
      if (disposed) return;
      resize();
      if (reduceMotion) draw();
    });

    window.addEventListener("resize", onResize);

    if (reduceMotion) {
      elapsed = 99;
      time = 0;
      draw();
    } else {
      container.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchmove", onTouchMove, { passive: true });
      container.addEventListener("touchend", onTouchEnd);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <div ref={containerRef} className="gx-stage">
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
      />

      <div aria-hidden className="gx-grain" />

      <div aria-hidden>
        <span className="gx-corner gx-corner-tl" />
        <span className="gx-corner gx-corner-tr" />
        <span className="gx-corner gx-corner-bl" />
        <span className="gx-corner gx-corner-br" />
      </div>

      <span className="gx-chrome gx-chrome-bl">Región US</span>
      <span className="gx-chrome gx-chrome-br">© 2026 Team Portal</span>

      <div className="gx-center">
        <div className="gx-stack">
          <h1 ref={titleRef} className="gx-wordmark">
            TEAM PORTAL
          </h1>

          <p className="gx-eyebrow gx-halo">Boosting Guild</p>

          {children}
        </div>
      </div>
    </div>
  );
}
