import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ToolScaffoldSpec = {
  name: string;
  description: string;
  promptSnippet?: string;
};

function toPascalCase(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("");
}

function normalizeToolName(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function scaffoldExtensionTool(cwd: string, spec: ToolScaffoldSpec) {
  const safeName = normalizeToolName(spec.name);
  if (!safeName) {
    throw new Error("Tool name must include at least one letter or number.");
  }
  const dir = resolve(cwd, ".pi/extensions/generated-tools");
  const path = resolve(dir, `${safeName}.ts`);
  mkdirSync(dirname(path), { recursive: true });

  const functionName = toPascalCase(safeName) || "GeneratedTool";
  const content = `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function ${functionName}(pi: ExtensionAPI) {
  pi.registerTool({
    name: ${JSON.stringify(safeName.replace(/-/g, "_"))},
    label: ${JSON.stringify(functionName)},
    description: ${JSON.stringify(spec.description)},
    promptSnippet: ${JSON.stringify(spec.promptSnippet ?? spec.description)},
    parameters: Type.Object({
      input: Type.Optional(Type.String({ description: "Optional input." })),
    }),
    async execute(_toolCallId, params) {
      const message = ${JSON.stringify(`TODO: implement ${safeName}`)} + (params.input ? "\nInput: " + params.input : "");
      return {
        content: [{ type: "text", text: message }],
        details: { generated: true },
      };
    },
  });
}
`;

  writeFileSync(path, content, "utf8");
  return { path, safeName };
}

export function listGeneratedTools(cwd: string) {
  const path = resolve(cwd, ".pi/extensions/generated-tools/.index");
  if (!existsSync(path)) return [] as string[];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
}

export function appendGeneratedToolIndex(cwd: string, entry: string) {
  const path = resolve(cwd, ".pi/extensions/generated-tools/.index");
  mkdirSync(dirname(path), { recursive: true });
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  writeFileSync(path, current + entry + "\n", "utf8");
}
