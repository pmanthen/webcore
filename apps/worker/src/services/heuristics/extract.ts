import type { Stagehand } from "@browserbasehq/stagehand";
import type { z } from "zod";

/**
 * Stagehand's `extract()` overload infers its return type from the Zod schema
 * through a deeply recursive conditional type, which TypeScript abandons for
 * schemas this size (TS2589).
 *
 * Calling through a narrowed signature and then parsing with the same schema
 * keeps the result strictly typed, and makes the validation boundary explicit
 * rather than leaving it implicit in Stagehand's generics — if the model returns
 * something off-schema, it fails here with a Zod error instead of flowing on as
 * a mistyped object.
 */
type NarrowedExtract = (
  instruction: string,
  schema: unknown,
  options?: { timeout?: number },
) => Promise<unknown>;

export async function extractStructured<T extends z.ZodType>(
  stagehand: Stagehand,
  instruction: string,
  schema: T,
  options?: { timeout?: number },
): Promise<z.infer<T>> {
  const extract = stagehand.extract.bind(stagehand) as unknown as NarrowedExtract;
  const raw = await extract(instruction, schema, options);
  return schema.parse(raw) as z.infer<T>;
}
