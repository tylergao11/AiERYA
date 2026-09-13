const KEY = 'forest-ward.handbook-seen.v1';

/** An optional invitation. Storage restrictions never prevent play. */
export class FirstRunGuide {
  private seen = false;
  constructor() {
    try { this.seen = localStorage.getItem(KEY) === '1'; } catch { /* Private browsing. */ }
  }
  get visible(): boolean { return !this.seen; }
  dismiss(): void {
    this.seen = true;
    try { localStorage.setItem(KEY, '1'); } catch { /* Remember for this session. */ }
  }
}
