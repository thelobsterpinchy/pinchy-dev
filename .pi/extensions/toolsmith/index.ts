import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { appendGeneratedToolIndex, scaffoldExtensionTool } from "../../../apps/host/src/tool-scaffold.js";
import { loadGeneratedToolSource } from "../../../apps/host/src/tool-review.js";

export default function toolsmith(pi: ExtensionAPI) {
  pi.registerTool({
    name: "scaffold_tool_extension",
    label: "Scaffold Tool Extension",
    description: "Create a new generated Pi tool extension scaffold inside this repository.",
    promptSnippet: "Use this when Pinchy needs a new repo-local tool scaffold for a repeated workflow.",
    parameters: Type.Object({
      name: Type.String({ description: "Tool name." }),
      description: Type.String({ description: "Tool description." }),
      promptSnippet: Type.Optional(Type.String({ description: "Optional prompt snippet." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const generated = scaffoldExtensionTool(ctx.cwd, {
        name: params.name,
        description: params.description,
        promptSnippet: params.promptSnippet,
      });
      appendGeneratedToolIndex(ctx.cwd, generated.safeName);
      return {
        content: [{ type: "text", text: `Scaffolded generated tool at ${generated.path}. Review it, then run /reload to load it.` }],
        details: generated,
      };
    },
  });

  pi.registerTool({
    name: "review_generated_tool",
    label: "Review Generated Tool",
    description: "Load and review the source of a generated tool before reloading it.",
    promptSnippet: "Review generated tool source before asking to reload extensions.",
    parameters: Type.Object({
      name: Type.String({ description: "Generated tool name." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const loaded = loadGeneratedToolSource(ctx.cwd, params.name);
      if (!loaded) {
        return {
          content: [{ type: "text", text: `Generated tool not found: ${params.name}` }],
          details: { name: params.name },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Path: ${loaded.path}\n\n${loaded.source}` }],
        details: loaded,
      };
    },
  });

  pi.registerCommand("toolsmith", {
    description: "Explain how to scaffold and load generated tools.",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Use scaffold_tool_extension, review_generated_tool, inspect the generated tool diff, then use reload_runtime or /reload-runtime to load the generated tool. Use /skill:tool-proposal when deciding whether a new tool is justified.", "info");
    },
  });
}
