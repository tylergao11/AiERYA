export class EventBus<Events extends object> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>();
  on<K extends keyof Events>(name: K, handler: (payload: Events[K]) => void): () => void {
    const set = this.handlers.get(name) ?? new Set();
    set.add(handler as (payload: never) => void); this.handlers.set(name, set);
    return () => { set.delete(handler as (payload: never) => void); };
  }
  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    for (const handler of this.handlers.get(name) ?? []) handler(payload as never);
  }
}
