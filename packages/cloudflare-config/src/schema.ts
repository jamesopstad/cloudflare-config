import { z } from 'zod';

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]),
);

export const varsSchema = z.record(jsonSchema);

const servicesSchema = z.record(
	z.object({
		worker: z.string(),
		export: z
			.string()
			.transform((value) => (value === 'default' ? undefined : value)),
	}),
);

const resourcesSchema = z.object({
	vars: varsSchema.optional(),
	services: servicesSchema.optional(),
});

const workersSchema = z.record(
	z.object({
		// TODO: enforce date format
		compatibilityDate: z.string(),
		module: z
			.record(z.string(), z.any())
			.pipe(
				z
					.object({ __MODULE_PATH__: z.string() })
					.transform((module) => module.__MODULE_PATH__),
			),
	}),
);

export const configSchema = z.object({
	name: z.string(),
	workers: workersSchema,
	entryWorker: z.string(),
	resources: resourcesSchema.default({}),
});

export type WorkersInput = z.input<typeof workersSchema>;
export type VarsInput = z.input<typeof varsSchema>;
export type ServicesInput = z.input<typeof servicesSchema>;
export type ConfigInput = z.input<typeof configSchema>;
export type ConfigOutput = z.output<typeof configSchema>;
