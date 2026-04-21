import { startManagedServices, summarizeManagedServices, waitForManagedServiceReadiness } from "./dev-stack.js";

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  const results = startManagedServices(cwd);
  await waitForManagedServiceReadiness();
  console.log(summarizeManagedServices(results));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
