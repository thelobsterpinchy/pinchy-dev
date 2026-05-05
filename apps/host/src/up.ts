import { startManagedServices, summarizeManagedServices, waitForManagedServiceReadiness } from "./dev-stack.js";
import { applyPinchyWorkspaceEnv } from "./workspace-env.js";

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  applyPinchyWorkspaceEnv(cwd);
  const results = startManagedServices(cwd);
  await waitForManagedServiceReadiness();
  console.log(summarizeManagedServices(results));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
