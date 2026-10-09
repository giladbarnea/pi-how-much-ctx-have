import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const extensionPath = fileURLToPath(new URL("../index.ts", import.meta.url));
const contextWindow = 272_000;

test("how_much_context reports Pi's context usage against the model's window", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "pi-how-much-ctx-have-"));
  const faux = fauxProvider({ models: [{ id: "faux-context", contextWindow }] });
  const modelRuntime = await ModelRuntime.create({
    authPath: join(sandbox, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  await modelRuntime.setRuntimeApiKey(faux.provider.id, "local-test");
  const resourceLoader = new DefaultResourceLoader({
    cwd: sandbox,
    agentDir: sandbox,
    additionalExtensionPaths: [extensionPath],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd: sandbox,
    agentDir: sandbox,
    model: faux.getModel(),
    modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(sandbox),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  });

  let usageSeenByTool;
  session.subscribe((event) => {
    if (event.type === "tool_execution_start" && event.toolName === "how_much_context") {
      usageSeenByTool = session.getContextUsage();
    }
  });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("how_much_context", {})),
    fauxAssistantMessage("Noted."),
  ]);

  try {
    await session.prompt("Fill the context window. ".repeat(10_000));

    const toolResult = session.messages.find(
      (message) => message.role === "toolResult" && message.toolName === "how_much_context",
    );
    assert.ok(toolResult, `Expected a how_much_context tool result. Got roles: ${session.messages.map((message) => message.role)}`);
    assert.equal(toolResult.isError, false, `Expected success. Got: ${JSON.stringify(toolResult.content)}`);
    assert.ok(usageSeenByTool?.tokens >= 50_000, `Expected substantial usage from the large prompt. Got: ${JSON.stringify(usageSeenByTool)}`);
    const expectedText = `You have used ${Math.round(usageSeenByTool.tokens / 1_000)}k tokens out of 272k available (${Math.round(usageSeenByTool.percent)}%).`;
    assert.deepEqual(toolResult.content, [{ type: "text", text: expectedText }]);
  } finally {
    session.dispose();
    await rm(sandbox, { recursive: true, force: true });
  }
});
