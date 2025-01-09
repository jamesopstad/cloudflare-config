import { z } from 'zod';

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]),
);

export const varsSchema = z.record(jsonSchema);

const resourcesSchema = z.object({
	vars: varsSchema.optional(),
});

const workerSchema = z.object({
	// TODO: enforce date format
	compatibilityDate: z.string(),
	module: z
		.record(z.string(), z.unknown())
		.pipe(
			z
				.object({ __MODULE_PATH__: z.string() })
				.transform((module) => module.__MODULE_PATH__),
		),
});

export const configSchema = z.object({
	// name: z.string(),
	workers: z.record(z.string(), workerSchema),
	entryWorker: z.string(),
	resources: resourcesSchema.default({}),
});

export type VarsInput = z.input<typeof varsSchema>;
export type ConfigInput = z.input<typeof configSchema>;
export type Config = z.output<typeof configSchema>;
