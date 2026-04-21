import { join, resolve } from "node:path";

export type PinchyInstallSmokeStep = {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
};

export type PinchyInstallSmokePlan = {
  tarballPath: string;
  installRoot: string;
  workspaceRoot: string;
  pinchyBinPath: string;
  steps: PinchyInstallSmokeStep[];
};

export function resolvePinchyInstallSmokeExpectedFiles(workspaceRoot: string) {
  return [
    resolve(workspaceRoot, ".pi/settings.json"),
    resolve(workspaceRoot, ".pinchy-runtime.json"),
    resolve(workspaceRoot, ".pinchy-goals.json"),
    resolve(workspaceRoot, ".pinchy-watch.json"),
  ];
}

export function buildPinchyInstallSmokePlan(input: {
  tarballPath: string;
  installRoot: string;
  workspaceRoot: string;
}): PinchyInstallSmokePlan {
  const pinchyBinPath = join(input.installRoot, "node_modules", ".bin", "pinchy");
  return {
    ...input,
    pinchyBinPath,
    steps: [
      {
        label: "install tarball into temp prefix",
        command: "npm",
        args: ["install", "--prefix", input.installRoot, input.tarballPath],
      },
      {
        label: "run installed pinchy help",
        command: pinchyBinPath,
        args: ["help"],
      },
      {
        label: "initialize workspace with installed pinchy",
        command: pinchyBinPath,
        args: ["init"],
        cwd: input.workspaceRoot,
      },
      {
        label: "run installed pinchy doctor",
        command: pinchyBinPath,
        args: ["doctor"],
        cwd: input.workspaceRoot,
      },
      {
        label: "run installed pinchy status",
        command: pinchyBinPath,
        args: ["status"],
        cwd: input.workspaceRoot,
      },
    ],
  };
}
