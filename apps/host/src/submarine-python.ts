import { dirname, delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const BUNDLED_SUBMARINE_PYTHON_PATH = resolve(PACKAGE_ROOT, "vendor/submarine-python");

export function getBundledSubmarinePythonPath() {
  return BUNDLED_SUBMARINE_PYTHON_PATH;
}

export function buildSubmarinePythonEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const existingPythonPath = baseEnv.PYTHONPATH?.trim();
  return {
    ...baseEnv,
    PYTHONPATH: existingPythonPath
      ? `${BUNDLED_SUBMARINE_PYTHON_PATH}${delimiter}${existingPythonPath}`
      : BUNDLED_SUBMARINE_PYTHON_PATH,
  };
}
