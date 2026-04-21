import test from "node:test";
import assert from "node:assert/strict";
import { parsePinchyCliArgs, summarizePinchyCliHelp, type PinchyCliCommandName } from "../apps/host/src/pinchy-cli.js";

test("parsePinchyCliArgs defaults to help and recognizes core product commands", () => {
  assert.equal(parsePinchyCliArgs([]).command, "help");
  assert.equal(parsePinchyCliArgs(["up"]).command, "up");
  assert.equal(parsePinchyCliArgs(["down"]).command, "down");
  assert.equal(parsePinchyCliArgs(["status"]).command, "status");
  assert.equal(parsePinchyCliArgs(["logs"]).command, "logs");
  assert.equal(parsePinchyCliArgs(["setup"]).command, "setup");
  assert.equal(parsePinchyCliArgs(["version"]).command, "version");
  assert.equal(parsePinchyCliArgs(["doctor"]).command, "doctor");
  assert.equal(parsePinchyCliArgs(["dashboard"]).command, "dashboard");
  assert.equal(parsePinchyCliArgs(["api"]).command, "api");
  assert.equal(parsePinchyCliArgs(["worker"]).command, "worker");
  assert.equal(parsePinchyCliArgs(["daemon"]).command, "daemon");
  assert.equal(parsePinchyCliArgs(["agent"]).command, "agent");
  assert.equal(parsePinchyCliArgs(["smoke"]).command, "smoke");
  assert.equal(parsePinchyCliArgs(["init"]).command, "init");
});

test("parsePinchyCliArgs keeps extra args for pass-through commands", () => {
  const parsed = parsePinchyCliArgs(["logs", "dashboard", "--tail", "200"]);
  assert.equal(parsed.command, "logs");
  assert.deepEqual(parsed.args, ["dashboard", "--tail", "200"]);
});

test("parsePinchyCliArgs treats unknown commands as help with an error", () => {
  const parsed = parsePinchyCliArgs(["wat"]);
  assert.equal(parsed.command, "help");
  assert.match(parsed.error ?? "", /Unknown command: wat/);
});

test("summarizePinchyCliHelp documents the npm-installable command surface", () => {
  const help = summarizePinchyCliHelp(["init", "setup", "version", "up", "down", "status", "logs", "doctor", "dashboard", "api", "worker", "daemon", "agent", "smoke", "help"] satisfies PinchyCliCommandName[]);
  assert.match(help, /pinchy <command>/);
  assert.match(help, /pinchy init/);
  assert.match(help, /pinchy setup/);
  assert.match(help, /pinchy version/);
  assert.match(help, /pinchy up/);
  assert.match(help, /pinchy down/);
  assert.match(help, /pinchy status/);
  assert.match(help, /pinchy logs/);
  assert.match(help, /pinchy doctor/);
  assert.match(help, /pinchy daemon/);
  assert.match(help, /pinchy smoke/);
});
