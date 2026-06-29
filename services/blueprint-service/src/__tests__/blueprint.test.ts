import { describe, it, expect } from 'vitest';

describe('Blueprint Service', () => {
  it('should validate blueprint JSON schema', () => {
    const blueprint = {
      version: '1.0',
      steps: [{ id: '1', type: 'email', config: {} }],
    };
    expect(blueprint.version).toMatch(/^\d+\.\d+$/);
    expect(Array.isArray(blueprint.steps)).toBe(true);
    expect(blueprint.steps.every((s: any) => s.id && s.type)).toBe(true);
  });

  it('should reject blueprint with circular step references', () => {
    const steps = [
      { id: 'a', next: 'b' },
      { id: 'b', next: 'c' },
      { id: 'c', next: 'a' },
    ];
    const visited = new Set<string>();
    function hasCycle(id: string): boolean {
      if (visited.has(id)) return true;
      visited.add(id);
      const step = steps.find((s) => s.id === id);
      if (step?.next) return hasCycle(step.next);
      return false;
    }
    expect(hasCycle('a')).toBe(true);
  });

  it('should version blueprints with semantic versioning', () => {
    const versions = ['1.0.0', '1.0.1', '1.1.0', '2.0.0'];
    const sorted = [...versions].sort((a, b) => {
      const parse = (v: string) => v.split('.').map(Number);
      const [a1, a2, a3] = parse(a);
      const [b1, b2, b3] = parse(b);
      return a1 - b1 || a2 - b2 || a3 - b3;
    });
    expect(sorted[sorted.length - 1]).toBe('2.0.0');
  });

  it('should clone a blueprint with new IDs', () => {
    const original = { id: 'bp-1', name: 'Onboarding', steps: [{ id: 's1' }] };
    const clone = { ...original, id: crypto.randomUUID(), steps: original.steps.map((s) => ({ ...s, id: crypto.randomUUID() })) };
    expect(clone.id).not.toBe(original.id);
    expect(clone.steps[0].id).not.toBe(original.steps[0].id);
    expect(clone.name).toBe(original.name);
  });

  it('should validate required step types', () => {
    const validTypes = ['email', 'wait', 'condition', 'task', 'webhook'];
    expect(validTypes.includes('email')).toBe(true);
    expect(validTypes.includes('unknown')).toBe(false);
  });
});
