import { z } from "zod";

import { VectorSchema } from "../spec/vector.js";

export type Vector = z.infer<typeof VectorSchema>;
export type VectorMetadata = NonNullable<Vector["metadata"]>;
