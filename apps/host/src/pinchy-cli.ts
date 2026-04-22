export const PINCHY_CLI_COMMANDS = [
  "init",
  "setup",
  "version",
  "config",
  "up",
  "down",
  "status",
  "logs",
  "doctor",
  "dashboard",
  "api",
  "worker",
  "daemon",
  "agent",
  "smoke",
  "help",
] as const;

export type PinchyCliCommandName = typeof PINCHY_CLI_COMMANDS[number];

export type ParsedPinchyCliArgs = {
  command: PinchyCliCommandName;
  args: string[];
  error?: string;
};

export function parsePinchyCliArgs(argv: string[]): ParsedPinchyCliArgs {
  const [rawCommand, ...args] = argv;
  if (!rawCommand) {
    return { command: "help", args: [] };
  }

  if (PINCHY_CLI_COMMANDS.includes(rawCommand as PinchyCliCommandName)) {
    return {
      command: rawCommand as PinchyCliCommandName,
      args,
    };
  }

  return {
    command: "help",
    args,
    error: `Unknown command: ${rawCommand}`,
  };
}

export function summarizePinchyCliHelp(commands: readonly PinchyCliCommandName[] = PINCHY_CLI_COMMANDS) {
  return [
    "pinchy <command>",
    "",
    ...commands.map((command) => `pinchy ${command}`),
  ].join("\n");
}
