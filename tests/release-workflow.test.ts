import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("release workflow uses the shared release verification script before npm publish", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
    repository?: { url?: string };
    bugs?: { url?: string };
    homepage?: string;
  };
  const workflow = readFileSync(".github/workflows/publish-npm.yml", "utf8");
  const releasing = readFileSync("docs/RELEASING.md", "utf8");
  const script = readFileSync("scripts/release-verify.ts", "utf8");

  assert.equal(packageJson.scripts?.["release:verify"], "tsx scripts/release-verify.ts");
  assert.match(packageJson.homepage ?? "", /github\.com\/pinchy-dev\/pinchy-dev/);
  assert.match(packageJson.repository?.url ?? "", /github\.com\/pinchy-dev\/pinchy-dev/);
  assert.match(packageJson.bugs?.url ?? "", /github\.com\/pinchy-dev\/pinchy-dev\/issues/);

  assert.match(workflow, /run: npm run release:verify/);
  assert.match(workflow, /run: npm publish/);
  assert.match(releasing, /npm run release:verify/);
  assert.match(releasing, /git switch -c release\/0\.3\.0/);
  assert.match(releasing, /git tag -a v0\.3\.0/);

  assert.match(script, /PINCHY_RELEASE_NPM_CACHE/);
  assert.match(script, /npm_config_cache: npmCache/);
  assert.match(script, /dashboard:build/);
  assert.match(script, /packaged install smoke/);
});

test("architecture docs make Pinchy orchestration the autonomous user-facing layer", () => {
  const architecture = readFileSync("docs/ARCHITECTURE.md", "utf8");

  assert.match(architecture, /local autonomous orchestration runtime/i);
  assert.match(architecture, /Pinchy owns the autonomous product loop/i);
  assert.match(architecture, /Pi owns execution inside an adapter call/i);
  assert.match(architecture, /Subagents are represented in Pinchy as delegated execution runs/i);
  assert.match(architecture, /`orchestration-core` ports rather than importing Pi runtime details directly/i);
});
