import { describe, expect, it, vi } from 'vitest';

import type {
  RuntimeContext,
  RuntimeGenerationStreamEvent,
  RuntimeGenerator,
  RuntimeGeneratorInput,
} from '../src/index.ts';
import {
  createGroundingPolicyRuntimeGenerator,
  resolveGroundingPolicyAction,
} from '../src/index.ts';

function baseInput(
  overrides: Partial<RuntimeGeneratorInput> = {},
): RuntimeGeneratorInput {
  return {
    request: {
      originalQuery: { query: '什么是 runtime？' },
      effectiveQuery: { query: '什么是 runtime？' },
    },
    chunks: [],
    ...overrides,
  };
}

function context(): RuntimeContext {
  return {
    requestId: 'req-1',
    input: { query: '什么是 runtime？' },
    options: {},
    startedAt: Date.now(),
  };
}

describe('resolveGroundingPolicyAction', () => {
  it('proceeds when chunks remain', () => {
    expect(
      resolveGroundingPolicyAction(
        baseInput({
          chunks: [{ id: 'c1', content: '有依据' }],
          grounding: { chunksEmptyReason: 'no-hits' },
        }),
        'explicit',
      ),
    ).toEqual({ kind: 'proceed' });
  });

  it('proceeds when grounding is absent', () => {
    expect(resolveGroundingPolicyAction(baseInput(), 'explicit')).toEqual({
      kind: 'proceed',
    });
  });

  it('refuses no-hits under explicit', () => {
    const action = resolveGroundingPolicyAction(
      baseInput({ grounding: { chunksEmptyReason: 'no-hits' } }),
      'explicit',
    );
    expect(action.kind).toBe('refuse');
    if (action.kind === 'refuse') {
      expect(action.reason).toBe('no-hits');
      expect(action.answer).toContain('未找到');
    }
  });

  it('refuses filtered under explicit', () => {
    const action = resolveGroundingPolicyAction(
      baseInput({ grounding: { chunksEmptyReason: 'filtered' } }),
      'explicit',
    );
    expect(action.kind).toBe('refuse');
    if (action.kind === 'refuse') {
      expect(action.reason).toBe('filtered');
    }
  });

  it('generalizes skipped even under explicit', () => {
    const action = resolveGroundingPolicyAction(
      baseInput({ grounding: { chunksEmptyReason: 'skipped' } }),
      'explicit',
    );
    expect(action.kind).toBe('generalize');
    if (action.kind === 'generalize') {
      expect(action.reason).toBe('skipped');
      expect(action.promptContext).toContain('未检索知识库');
      expect(action.promptContext).toContain('什么是 runtime？');
    }
  });

  it('generalizes no-hits under generalize policy', () => {
    const action = resolveGroundingPolicyAction(
      baseInput({ grounding: { chunksEmptyReason: 'no-hits' } }),
      'generalize',
    );
    expect(action.kind).toBe('generalize');
    if (action.kind === 'generalize') {
      expect(action.promptContext).toContain('不是来自知识库');
    }
  });
});

describe('createGroundingPolicyRuntimeGenerator', () => {
  it('delegates to inner when chunks remain', async () => {
    const generate = vi.fn(async () => ({ answer: 'grounded' }));
    const inner: RuntimeGenerator = { generate };
    const wrapped = createGroundingPolicyRuntimeGenerator(inner, {
      policy: 'explicit',
    });

    const input = baseInput({
      chunks: [{ id: 'c1', content: '依据' }],
    });
    const result = await wrapped.generate(input, context());

    expect(result.answer).toBe('grounded');
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]?.[0]).toEqual(input);
  });

  it('short-circuits explicit no-hits without calling inner', async () => {
    const generate = vi.fn(async () => ({ answer: 'should-not-run' }));
    const wrapped = createGroundingPolicyRuntimeGenerator(
      { generate },
      { policy: 'explicit' },
    );

    const result = await wrapped.generate(
      baseInput({ grounding: { chunksEmptyReason: 'no-hits' } }),
      context(),
    );

    expect(generate).not.toHaveBeenCalled();
    expect(result.answer).toContain('未找到');
    expect(result.generationMetadata).toEqual({
      groundingRefusal: true,
      chunksEmptyReason: 'no-hits',
      noGroundingPolicy: 'explicit',
    });
  });

  it('short-circuits explicit filtered without calling inner', async () => {
    const generate = vi.fn(async () => ({ answer: 'should-not-run' }));
    const wrapped = createGroundingPolicyRuntimeGenerator(
      { generate },
      { policy: 'explicit' },
    );

    const result = await wrapped.generate(
      baseInput({ grounding: { chunksEmptyReason: 'filtered' } }),
      context(),
    );

    expect(generate).not.toHaveBeenCalled();
    expect(result.generationMetadata?.chunksEmptyReason).toBe('filtered');
  });

  it('calls inner for explicit skipped with generalize prompt', async () => {
    let received: RuntimeGeneratorInput | undefined;
    const wrapped = createGroundingPolicyRuntimeGenerator(
      {
        async generate(input) {
          received = input;
          return { answer: 'from-model' };
        },
      },
      { policy: 'explicit' },
    );

    const result = await wrapped.generate(
      baseInput({ grounding: { chunksEmptyReason: 'skipped' } }),
      context(),
    );

    expect(result.answer).toBe('from-model');
    expect(received?.grounding).toBeUndefined();
    expect(received?.promptContext).toContain('未检索知识库');
  });

  it('calls inner for generalize no-hits with injected promptContext', async () => {
    let received: RuntimeGeneratorInput | undefined;
    const wrapped = createGroundingPolicyRuntimeGenerator(
      {
        async generate(input) {
          received = input;
          return { answer: 'general' };
        },
      },
      { policy: 'generalize' },
    );

    await wrapped.generate(
      baseInput({ grounding: { chunksEmptyReason: 'no-hits' } }),
      context(),
    );

    expect(received?.grounding).toBeUndefined();
    expect(received?.promptContext).toContain('不是来自知识库');
  });

  it('streams a refuse answer without calling inner stream', async () => {
    const generateStream = vi.fn(async function* () {
      yield { type: 'delta' as const, text: 'nope' };
    });
    const wrapped = createGroundingPolicyRuntimeGenerator(
      {
        async generate() {
          return { answer: 'unused' };
        },
        generateStream,
      },
      { policy: 'explicit' },
    );

    const events: RuntimeGenerationStreamEvent[] = [];
    for await (const event of wrapped.generateStream!(
      baseInput({ grounding: { chunksEmptyReason: 'no-hits' } }),
      context(),
    )) {
      events.push(event);
    }

    expect(generateStream).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'delta' });
    expect(events[1]).toMatchObject({
      type: 'complete',
      result: {
        generationMetadata: {
          groundingRefusal: true,
          chunksEmptyReason: 'no-hits',
          noGroundingPolicy: 'explicit',
        },
      },
    });
  });

  it('delegates generateStream for generalize', async () => {
    let received: RuntimeGeneratorInput | undefined;
    const wrapped = createGroundingPolicyRuntimeGenerator(
      {
        async generate() {
          return { answer: 'unused' };
        },
        async *generateStream(input) {
          received = input;
          yield { type: 'delta', text: 'g' };
          yield {
            type: 'complete',
            result: { answer: 'g' },
          };
        },
      },
      { policy: 'generalize' },
    );

    const events: RuntimeGenerationStreamEvent[] = [];
    for await (const event of wrapped.generateStream!(
      baseInput({ grounding: { chunksEmptyReason: 'filtered' } }),
      context(),
    )) {
      events.push(event);
    }

    expect(received?.promptContext).toContain('不是来自知识库');
    expect(events.map((e) => e.type)).toEqual(['delta', 'complete']);
  });
});
