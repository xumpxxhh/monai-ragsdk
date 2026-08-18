import { OllamaEmbedder, OllamaRuntimeGenerator } from '../src/index.js';

// mock HTTP，只验证 Ollama adapter 的请求映射，不依赖本机 Ollama 服务。

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });
}

const fetchImpl = async (url: string, init?: { body?: string }) => {
  if (url.includes('/api/embed')) {
    return jsonResponse({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    });
  }

  const body = JSON.parse(String(init?.body ?? '{}')) as { stream?: boolean };

  if (body.stream) {
    return new Response(
      [
        JSON.stringify({ message: { content: '根据上下文，' }, done: false }),
        JSON.stringify({
          message: { content: 'runtime 负责在线四阶段编排。' },
          done: true,
        }),
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      },
    );
  }

  return jsonResponse({
    message: {
      content: '根据上下文，runtime 负责在线四阶段编排。',
    },
  });
};

const embedder = new OllamaEmbedder({
  model: 'nomic-embed-text',
  dimension: 2,
  fetch: fetchImpl,
});

const vectors = await embedder.embed([
  {
    id: 'chunk-1',
    content: 'runtime 负责在线四阶段编排。',
    metadata: { sourceId: 'docs/runtime' },
  },
  {
    id: 'chunk-2',
    content: 'indexing 负责离线索引。',
    metadata: { sourceId: 'docs/indexing' },
  },
]);

const generator = new OllamaRuntimeGenerator({
  model: 'qwen2.5',
  fetch: fetchImpl,
});

const generation = await generator.generate(
  {
    request: {
      originalQuery: { query: 'runtime 是什么' },
      effectiveQuery: { query: 'runtime 是什么' },
    },
    chunks: [
      {
        id: 'chunk-1',
        content: 'runtime 负责在线四阶段编排。',
      },
    ],
  },
  {
    requestId: 'demo',
    input: { query: 'runtime 是什么' },
    options: {},
    startedAt: Date.now(),
  },
);

const streamed = [];
for await (const event of generator.generateStream(
  {
    request: {
      originalQuery: { query: 'runtime 是什么' },
      effectiveQuery: { query: 'runtime 是什么' },
    },
    chunks: [
      {
        id: 'chunk-1',
        content: 'runtime 负责在线四阶段编排。',
      },
    ],
  },
  {
    requestId: 'demo-stream',
    input: { query: 'runtime 是什么' },
    options: {},
    startedAt: Date.now(),
  },
)) {
  streamed.push(event);
}

console.log(
  JSON.stringify(
    {
      vectors,
      generation,
      streamed,
    },
    null,
    2,
  ),
);
