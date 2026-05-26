const HoneycombBg = (() => {
  const R = 50;
  const COL_W = Math.sqrt(3) * R;
  const ROW_H = R * 1.5;
  let canvas, ctx, w, h, blobs = [], lastTime = 0;

  function initBlobs() {
    blobs = Array.from({ length: 4 }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r: 0.22 + Math.random() * 0.14,
      phase: (i / 4) * Math.PI * 2
    }));
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function hexPath(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i + 30);
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function draw(ts) {
    const elapsed = ts / 1000;
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;

    // update blobs
    blobs.forEach(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0 || b.x > 1) b.vx *= -1;
      if (b.y < 0 || b.y > 1) b.vy *= -1;
      b.vx += (Math.random() - 0.5) * 0.008;
      b.vy += (Math.random() - 0.5) * 0.008;
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (spd > 0.22) { b.vx = (b.vx / spd) * 0.22; b.vy = (b.vy / spd) * 0.22; }
      if (spd < 0.04) { b.vx = (b.vx / spd) * 0.04; b.vy = (b.vy / spd) * 0.04; }
    });

    ctx.clearRect(0, 0, w, h);

    const halfCols = Math.ceil(w / (2 * COL_W)) + 1;
    const halfRows = Math.ceil(h / (2 * ROW_H)) + 1;

    for (let row = -halfRows; row <= halfRows; row++) {
      for (let col = -halfCols; col <= halfCols; col++) {
        const offset = (row % 2 !== 0) ? COL_W * 0.5 : 0;
        const cx = col * COL_W + offset + w / 2;
        const cy = row * ROW_H + h / 2;

        const nx = cx / w, ny = cy / h;
        let glow = 0;

        blobs.forEach(b => {
          const breath = 0.75 + 0.25 * Math.sin(elapsed * 0.6 + b.phase);
          const dx = nx - b.x, dy = ny - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const t = 1 - clamp(dist / b.r, 0, 1);
          const falloff = smoothstep(t);
          glow = Math.max(glow, falloff * breath);
        });

        // pass 1: fill black
        hexPath(cx, cy, R - 1.5);
        ctx.fillStyle = '#000';
        ctx.fill();

        // pass 2: stroke orange
        hexPath(cx, cy, R - 1);
        ctx.strokeStyle = `rgba(255,106,0,${0.06 + glow * 0.80})`;
        ctx.lineWidth = 0.5 + glow * 2.5;
        ctx.stroke();

        // pass 3: bloom if glow hot enough
        if (glow > 0.5) {
          const bloom = (glow - 0.5) / 0.5;
          ctx.shadowColor = 'rgba(255,106,0,0.6)';
          ctx.shadowBlur = bloom * 14;
          hexPath(cx, cy, R - 1);
          ctx.strokeStyle = `rgba(255,120,0,${bloom * 0.3})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    }

    requestAnimationFrame(draw);
  }

  function resize() {
    const c = document.getElementById('center');
    w = canvas.width = c.offsetWidth;
    h = canvas.height = c.offsetHeight;
  }

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', resize);
    requestAnimationFrame(() => {
      resize();
      initBlobs();
      requestAnimationFrame(draw);
    });
  }

  return { init };
})();
