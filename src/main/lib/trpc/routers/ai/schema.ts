/**
 * AI Router Schema Utilities
 *
 * Zod to JSON Schema conversion for OpenAI Responses API
 */

import { z } from "zod";

/**
 * Convert Zod schema to JSON Schema for OpenAI Responses API
 * Note: With strict=true, ALL properties must be in required array.
 * Optional fields must use anyOf with null type.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return convertZodType(schema);
}

/**
 * Convert a Zod type to JSON Schema format
 */
export function convertZodType(zodType: z.ZodTypeAny): Record<string, unknown> {
  const description = zodType.description || "";

  // Handle ZodOptional
  if (zodType instanceof z.ZodOptional) {
    const inner = convertZodType(zodType._def.innerType);
    return {
      anyOf: [inner, { type: "null" }],
      description: inner.description || description,
    };
  }

  // Handle ZodDefault
  if (zodType instanceof z.ZodDefault) {
    const inner = convertZodType(zodType._def.innerType);
    return {
      anyOf: [inner, { type: "null" }],
      description: inner.description || description,
    };
  }

  // Handle ZodObject
  if (zodType instanceof z.ZodObject) {
    const shape = zodType.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldType = value as z.ZodTypeAny;
      const isOptional =
        fieldType instanceof z.ZodOptional || fieldType instanceof z.ZodDefault;

      if (isOptional) {
        const inner =
          fieldType instanceof z.ZodOptional
            ? convertZodType(fieldType._def.innerType)
            : convertZodType(
                (fieldType as z.ZodDefault<z.ZodTypeAny>)._def.innerType
              );
        properties[key] = {
          anyOf: [inner, { type: "null" }],
          description: fieldType.description || inner.description || "",
        };
      } else {
        properties[key] = convertZodType(fieldType);
      }

      // ALL fields must be required for strict mode
      required.push(key);
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
      description,
    };
  }

  // Handle ZodArray
  if (zodType instanceof z.ZodArray) {
    return {
      type: "array",
      items: convertZodType(zodType._def.type),
      description,
    };
  }

  // Handle ZodEnum
  if (zodType instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: zodType._def.values,
      description,
    };
  }

  // Handle ZodUnion
  if (zodType instanceof z.ZodUnion) {
    const options = zodType._def.options as z.ZodTypeAny[];
    // Check if it's a simple union of primitives
    const types = options.map((opt) => {
      if (opt instanceof z.ZodString) return "string";
      if (opt instanceof z.ZodNumber) return "number";
      if (opt instanceof z.ZodBoolean) return "boolean";
      if (opt instanceof z.ZodNull) return "null";
      return "string";
    });

    // If all are the same type, just use that type
    const uniqueTypes = [...new Set(types.filter((t) => t !== "null"))];
    if (uniqueTypes.length === 1) {
      if (types.includes("null")) {
        return {
          anyOf: [{ type: uniqueTypes[0] }, { type: "null" }],
          description,
        };
      }
      return { type: uniqueTypes[0], description };
    }

    // Multiple types
    return {
      anyOf: options.map((opt) => convertZodType(opt)),
      description,
    };
  }

  // Handle primitives
  if (zodType instanceof z.ZodString) {
    return { type: "string", description };
  }
  if (zodType instanceof z.ZodNumber) {
    return { type: "number", description };
  }
  if (zodType instanceof z.ZodBoolean) {
    return { type: "boolean", description };
  }
  if (zodType instanceof z.ZodNull) {
    return { type: "null", description };
  }

  // Fallback
  return { type: "string", description };
}

/**
 * Extract web search details from event
 */
export function extractWebSearchDetails(wsEvent: any): {
  action?: "search" | "open_page" | "find_in_page";
  query?: string;
  domains?: string[];
  url?: string;
} {
  const actionValue = wsEvent?.action;
  const actionObj =
    typeof actionValue === "object" && actionValue !== null ? actionValue : {};
  const actionType =
    actionValue === "search" ||
    actionValue === "open_page" ||
    actionValue === "find_in_page"
      ? actionValue
      : actionObj.type === "search" ||
          actionObj.type === "open_page" ||
          actionObj.type === "find_in_page"
        ? actionObj.type
        : undefined;

  const queries = Array.isArray(actionObj.queries)
    ? actionObj.queries
    : Array.isArray(wsEvent?.queries)
      ? wsEvent.queries
      : undefined;

  const query =
    typeof actionObj.query === "string"
      ? actionObj.query
      : typeof wsEvent?.query === "string"
        ? wsEvent.query
        : queries?.[0];

  const domains = Array.isArray(actionObj.domains)
    ? actionObj.domains
    : Array.isArray(wsEvent?.domains)
      ? wsEvent.domains
      : undefined;

  const url =
    typeof actionObj.url === "string"
      ? actionObj.url
      : typeof wsEvent?.url === "string"
        ? wsEvent.url
        : undefined;

  return {
    action: actionType,
    query,
    domains,
    url,
  };
}
