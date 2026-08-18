import { GenerationError, RAGCoreError, RetrievalError, ValidationError } from '../dist/index.js';

const errors = [
  new ValidationError('query is invalid'),
  new RetrievalError('retriever failed'),
  new GenerationError('generator failed'),
];

for (const error of errors) {
  console.log({
    name: error.name,
    message: error.message,
    isCoreError: error instanceof RAGCoreError,
  });
}
