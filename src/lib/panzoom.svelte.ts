// ============================================================
// Déplacement et zoom d'un plan (souris, molette, pavé tactile, doigts).
// Utilisé par la vue éventail. Usage :
//   const pz = new PanZoom();   <div {@attach pz.attacher}> … style="transform: {pz.transform}"
// ============================================================
export class PanZoom {
  x = $state(0);
  y = $state(0);
  k = $state(1);
  anime = $state(false);
  /** Vrai si le dernier geste a déplacé le plan (pour ignorer le clic qui suit). */
  aBouge = false;
  min = 0.2;
  max = 4;
  el: HTMLElement | null = null;

  get transform() {
    return `translate(${this.x}px, ${this.y}px) scale(${this.k})`;
  }

  /** Place le point (px, py) du plan au centre de la zone, à l'échelle k. */
  centrerSur(px: number, py: number, k = this.k, anime = true) {
    if (!this.el) return;
    const r = this.el.getBoundingClientRect();
    this.anime = anime;
    this.k = k;
    this.x = r.width / 2 - px * k;
    this.y = r.height / 2 - py * k;
    setTimeout(() => (this.anime = false), 400);
  }

  zoomAutour(px: number, py: number, f: number, anime = false) {
    const k = Math.min(this.max, Math.max(this.min, this.k * f));
    const r = k / this.k;
    this.anime = anime;
    this.x = px - (px - this.x) * r;
    this.y = py - (py - this.y) * r;
    this.k = k;
  }

  zoomer(f: number) {
    if (!this.el) return;
    const r = this.el.getBoundingClientRect();
    this.zoomAutour(r.width / 2, r.height / 2, f, true);
  }

  /** À brancher avec {@attach pz.attacher} sur la zone qui reçoit les gestes. */
  attacher = (el: HTMLElement) => {
    this.el = el;
    const pts = new Map<number, { x: number; y: number }>();
    let geste: { x0: number; y0: number; tx: number; ty: number; k: number; d0: number; mx: number; my: number } | null = null;
    const demarrer = () => {
      const l = [...pts.values()];
      const r = el.getBoundingClientRect();
      if (l.length === 1) geste = { x0: l[0].x, y0: l[0].y, tx: this.x, ty: this.y, k: this.k, d0: 0, mx: 0, my: 0 };
      else if (l.length >= 2) {
        geste = { x0: 0, y0: 0, tx: this.x, ty: this.y, k: this.k, d0: Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y), mx: (l[0].x + l[1].x) / 2 - r.left, my: (l[0].y + l[1].y) / 2 - r.top };
      }
    };
    const appui = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.aBouge = false;
      this.anime = false;
      demarrer();
    };
    const bouge = (e: PointerEvent) => {
      if (!pts.has(e.pointerId) || !geste) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const l = [...pts.values()];
      if (l.length === 1) {
        const dx = l[0].x - geste.x0, dy = l[0].y - geste.y0;
        if (Math.hypot(dx, dy) > 5) this.aBouge = true;
        if (this.aBouge) { this.x = geste.tx + dx; this.y = geste.ty + dy; }
      } else {
        this.aBouge = true;
        const k = Math.min(this.max, Math.max(this.min, geste.k * (Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) / geste.d0)));
        const f = k / geste.k;
        this.x = geste.mx - (geste.mx - geste.tx) * f;
        this.y = geste.my - (geste.my - geste.ty) * f;
        this.k = k;
      }
    };
    const relache = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size) demarrer();
      else geste = null;
    };
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const pave = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) < 40);
      if (pave) { this.anime = false; this.x -= e.deltaX; this.y -= e.deltaY; }
      else this.zoomAutour(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener('pointerdown', appui);
    el.addEventListener('wheel', molette, { passive: false });
    window.addEventListener('pointermove', bouge);
    window.addEventListener('pointerup', relache);
    window.addEventListener('pointercancel', relache);
    return () => {
      el.removeEventListener('pointerdown', appui);
      el.removeEventListener('wheel', molette);
      window.removeEventListener('pointermove', bouge);
      window.removeEventListener('pointerup', relache);
      window.removeEventListener('pointercancel', relache);
      this.el = null;
    };
  };
}
