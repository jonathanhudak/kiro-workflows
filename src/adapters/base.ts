/**
 * Adapter registry — manages available runtime adapters.
 */

import type { Adapter } from "../core/types.js";

export class AdapterRegistry {
  private adapters = new Map<string, Adapter>();

  register(adapter: Adapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): Adapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      const available = [...this.adapters.keys()].join(", ");
      throw new Error(`Unknown adapter: ${name}. Available: ${available}`);
    }
    return adapter;
  }

  has(name: string): boolean {
    return this.adapters.has(name);
  }

  list(): Adapter[] {
    return [...this.adapters.values()];
  }
}

/**
 * Create the default registry with all built-in adapters.
 */
export function createDefaultRegistry(): AdapterRegistry {
  // Lazy imports to avoid circular deps and allow tree-shaking
  const registry = new AdapterRegistry();
  return registry;
}
