import { z } from 'zod';

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]),
);

const resourcesSchema = z.object({
	vars: z.record(jsonSchema).optional(),
});

const entryWorkerSchema = z.object({
	name: z.string(),
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
	name: z.string(),
	resources: resourcesSchema.default({}),
	entryWorker: entryWorkerSchema,
});

export type ConfigInputSchema = z.input<typeof configSchema>;
export type ConfigSchema = z.output<typeof configSchema>;
