export type UtilityPanel = 'pause' | 'help' | 'build' | 'restart';

/** A utility returns to the screen that opened it, including an existing pause. */
export class PanelNavigation {
  private stack: UtilityPanel[] = [];
  get current(): UtilityPanel | undefined { return this.stack.at(-1); }
  get active(): boolean { return this.stack.length > 0; }
  has(panel: UtilityPanel): boolean { return this.stack.includes(panel); }
  open(panel: UtilityPanel): void {
    if (this.current === panel) { this.back(); return; }
    const existing = this.stack.indexOf(panel);
    if (existing >= 0) this.stack.length = existing + 1;
    else this.stack.push(panel);
  }
  back(): void { this.stack.pop(); }
  clear(): void { this.stack = []; }
}
