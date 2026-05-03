import test from "node:test";
import assert from "node:assert/strict";
import designPatternsExtension from "../.pi/extensions/design-patterns/index.js";

test("design patterns extension registers search and lookup tools", async () => {
  const tools = new Map<string, any>();
  const pi = {
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
  };

  designPatternsExtension(pi as never);

  assert.ok(tools.has("search_design_patterns"));
  assert.ok(tools.has("get_design_pattern"));
  assert.ok(tools.has("detect_design_anti_patterns"));
  assert.ok(tools.has("get_design_anti_pattern"));
  assert.ok(tools.has("diagnose_design_problem"));
  assert.ok(tools.has("analyze_design_structure"));
  assert.ok(tools.has("scan_repository_design_structure"));
  assert.ok(tools.has("plan_design_remediation"));

  const searchResponse = await tools.get("search_design_patterns").execute(
    "call-1",
    { query: "large switch for interchangeable behavior", maxResults: 3 },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  assert.match(searchResponse.content[0].text, /Strategy/i);

  const antiPatternResponse = await tools.get("detect_design_anti_patterns").execute(
    "call-anti-1",
    { query: "global service locator hides dependencies", maxResults: 3 },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  assert.match(antiPatternResponse.content[0].text, /Service Locator/i);
  assert.match(antiPatternResponse.content[0].text, /Dependency Injection/i);

  const getResponse = await tools.get("get_design_pattern").execute(
    "call-2",
    { name: "dependency injection" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  assert.match(getResponse.content[0].text, /Dependency Injection/);
  assert.match(getResponse.content[0].text, /Use when:/);

  const diagnosisResponse = await tools.get("diagnose_design_problem").execute(
    "call-diagnosis-1",
    { query: "global service locator and growing manager class", maxResults: 3 },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  assert.match(diagnosisResponse.content[0].text, /Likely anti-patterns:/);
  assert.match(diagnosisResponse.content[0].text, /Recommended healthy patterns:/);
  assert.match(diagnosisResponse.content[0].text, /Dependency Injection/);

  const structureResponse = await tools.get("analyze_design_structure").execute(
    "call-structure-1",
    { path: "tests/design-patterns-extension.test.ts", maxResults: 3 },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  assert.match(structureResponse.content[0].text, /File:/);
  assert.match(structureResponse.content[0].text, /Summary:/);

  const repoScanResponse = await tools.get("scan_repository_design_structure").execute(
    "call-scan-1",
    { include: ["apps/host/src"], maxFiles: 2, maxResultsPerFile: 2 },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  assert.match(repoScanResponse.content[0].text, /Scanned/);
  assert.match(repoScanResponse.content[0].text, /Top suspicious files:/);

  const remediationResponse = await tools.get("plan_design_remediation").execute(
    "call-remediation-1",
    { path: "apps/host/src/design-structure-analysis.ts", maxResults: 3 },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  assert.match(remediationResponse.content[0].text, /Refactor plan|No strong remediation plan needed/);

  const getAntiPatternResponse = await tools.get("get_design_anti_pattern").execute(
    "call-anti-2",
    { name: "god object" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  assert.match(getAntiPatternResponse.content[0].text, /God Object/);
  assert.match(getAntiPatternResponse.content[0].text, /Recommended patterns:/);
});
