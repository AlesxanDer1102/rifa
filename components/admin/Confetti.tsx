"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#fbbf24", "#f59e0b", "#ef4444", "#dc2626", "#10b981", "#34d399", "#ffffff", "#60a5fa"];
const DURATION_MS = 5000;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  round: boolean;
}

function spawn(width: number, height: number): Particle[] {
  const particles: Particle[] = [];
  const make = (x: number, y: number, angle: number, speed: number): Particle => {
    const a = angle + (Math.random() - 0.5) * 0.9;
    const v = speed * (0.55 + Math.random() * 0.6);
    return {
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      size: 6 + Math.random() * 7,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.35,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.3,
    };
  };
  const speed = Math.min(26, Math.max(15, width / 55));
  for (let i = 0; i < 90; i++) particles.push(make(0, height, -Math.PI / 3, speed));
  for (let i = 0; i < 90; i++) particles.push(make(width, height, (-2 * Math.PI) / 3, speed));
  for (let i = 0; i < 60; i++) particles.push(make(Math.random() * width, -20, Math.PI / 2, 4));
  return particles;
}

/** Lightweight canvas confetti. Fires a burst every time `burst` changes to a value > 0. */
export function Confetti({ burst }: { burst: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (burst <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = spawn(width, height);
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);
      const fade = elapsed > DURATION_MS - 1200 ? Math.max(0, (DURATION_MS - elapsed) / 1200) : 1;
      ctx.globalAlpha = fade;
      for (const p of particles) {
        p.vy += 0.38;
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      if (elapsed < DURATION_MS) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, width, height);
    };
  }, [burst]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
