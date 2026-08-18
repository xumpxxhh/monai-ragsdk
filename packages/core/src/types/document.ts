import { z } from 'zod';

import { DocumentSchema } from '../spec/document.js';

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentMetadata = NonNullable<Document['metadata']>;
