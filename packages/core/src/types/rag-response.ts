import { z } from "zod";

import { RAGResponseSchema } from "../spec/rag-response.js";

export type RAGResponse = z.infer<typeof RAGResponseSchema>;
