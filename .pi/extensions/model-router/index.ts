import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type ProfileName = "coding" | "debug" | "fast";

type ModelTarget = {
  provider: string;
  id: string;
};

function parseTarget(target: string | undefined): ModelTarget | undefined {
  if (!target) return undefined;
  const [provider, id] = target.split("/", 2);
  if (!provider || !id) return undefined;
  return { provider, id };
}

function getProfileTarget(name: ProfileName) {
  return parseTarget(process.env[`PINCHY_MODEL_PROFILE_${name.toUpperCase()}`]);
}

function inferProfile(prompt: string): ProfileName | undefined {
  const value = prompt.toLowerCase();
  if (/(browser|website|playwright|debug|screenshot|console|dom|desktop|app issue)/.test(value)) return "debug";
  if (/(refactor|implement|test|tdd|pattern|code|typescript|function|architecture)/.test(value)) return "coding";
  if (/(quick|fast|brief|summary|summarize)/.test(value)) return "fast";
  return undefined;
}

export default function modelRouter(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const profile = inferProfile(event.prompt);
    if (!profile) return;
    const target = getProfileTarget(profile);
    if (!target) return;
    const model = ctx.modelRegistry.find(target.provider, target.id);
    if (!model) return;
    const success = await pi.setModel(model);
    if (success) {
      ctx.ui.setStatus("model-router", `Auto model profile: ${profile} -> ${target.provider}/${target.id}`);
    }
  });

  pi.registerCommand("pinchy-model", {
    description: "Switch to a configured model profile: coding, debug, or fast.",
    handler: async (args, ctx) => {
      const profile = (args || "").trim() as ProfileName;
      if (!["coding", "debug", "fast"].includes(profile)) {
        ctx.ui.notify("Usage: /pinchy-model coding|debug|fast", "info");
        return;
      }
      const target = getProfileTarget(profile);
      if (!target) {
        ctx.ui.notify(`No model configured for profile ${profile}.`, "error");
        return;
      }
      const model = ctx.modelRegistry.find(target.provider, target.id);
      if (!model) {
        ctx.ui.notify(`Configured model not found: ${target.provider}/${target.id}`, "error");
        return;
      }
      const success = await pi.setModel(model);
      ctx.ui.notify(
        success
          ? `Switched to ${profile} profile -> ${target.provider}/${target.id}`
          : `Failed to switch to ${target.provider}/${target.id}`,
        success ? "info" : "error",
      );
    },
  });

  pi.registerCommand("pinchy-models", {
    description: "Show configured Pinchy model profiles.",
    handler: async (_args, ctx) => {
      const lines = (["coding", "debug", "fast"] as ProfileName[])
        .map((name) => {
          const target = getProfileTarget(name);
          return `${name}: ${target ? `${target.provider}/${target.id}` : "(unset)"}`;
        })
        .join("\n");
      ctx.ui.notify(lines, "info");
    },
  });
}
