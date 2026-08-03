import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** @example humanizeTokenCount(87_000) // "87k" */
function humanizeTokenCount(tokenCount: number): string {
  return `${Math.round(tokenCount / 1_000)}k`;
}

const howMuchContextTool = defineTool({
  name: "how_much_context",
  label: "How Much Context",
  description: "Report how much of the current context window is used.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _parameters, _signal, _onUpdate, ctx) {
    const usage = ctx.getContextUsage();
    if (!usage || usage.tokens === null || usage.percent === null) {
      throw new Error("Context usage is unavailable");
    }

    const text = `You have used ${humanizeTokenCount(usage.tokens)} tokens out of ${humanizeTokenCount(usage.contextWindow)} available (${Math.round(usage.percent)}%).`;
    return { content: [{ type: "text" as const, text }] };
  },
});

export default function howMuchContext(pi: ExtensionAPI): void {
  pi.registerTool(howMuchContextTool);
}
