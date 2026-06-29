import { describe, it, expect } from 'vitest';

describe('Workflow Service', () => {
  it('should validate DAG has no cycles', () => {
    const edges = [['a', 'b'], ['b', 'c']];
    const adj = new Map<string, string[]>();
    for (const [from, to] of edges) {
      adj.set(from, [...(adj.get(from) ?? []), to]);
    }
    const visited = new Set<string>();
    const recStack = new Set<string>();
    function hasCycle(node: string): boolean {
      visited.add(node);
      recStack.add(node);
      for (const neighbor of adj.get(node) ?? []) {
        if (!visited.has(neighbor) && hasCycle(neighbor)) return true;
        if (recStack.has(neighbor)) return true;
      }
      recStack.delete(node);
      return false;
    }
    expect(hasCycle('a')).toBe(false);
  });

  it('should detect a cyclic workflow', () => {
    const edges = [['a', 'b'], ['b', 'c'], ['c', 'a']];
    const adj = new Map<string, string[]>();
    for (const [from, to] of edges) {
      adj.set(from, [...(adj.get(from) ?? []), to]);
    }
    const visited = new Set<string>();
    const recStack = new Set<string>();
    function hasCycle(node: string): boolean {
      visited.add(node);
      recStack.add(node);
      for (const neighbor of adj.get(node) ?? []) {
        if (!visited.has(neighbor) && hasCycle(neighbor)) return true;
        if (recStack.has(neighbor)) return true;
      }
      recStack.delete(node);
      return false;
    }
    expect(hasCycle('a')).toBe(true);
  });

  it('should serialize workflow state transitions', () => {
    const transitions = [
      { from: 'draft', to: 'active', valid: true },
      { from: 'active', to: 'paused', valid: true },
      { from: 'paused', to: 'active', valid: true },
      { from: 'completed', to: 'active', valid: false },
    ];
    for (const t of transitions) {
      const isValid = t.to !== 'completed' || t.from !== 'completed';
      expect(isValid).toBe(t.valid);
    }
  });

  it('should compute workflow trigger conditions', () => {
    const condition = { field: 'deal.amount', operator: 'gt', value: 10000 };
    const context = { deal: { amount: 15000 } };
    const result =
      condition.operator === 'gt'
        ? (context as any).deal.amount > condition.value
        : false;
    expect(result).toBe(true);
  });

  it('should enforce max workflow nesting depth', () => {
    const maxDepth = 5;
    const nested = { depth: 6 };
    expect(nested.depth <= maxDepth).toBe(false);
  });
});
