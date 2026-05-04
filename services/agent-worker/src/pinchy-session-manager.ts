import { randomUUID } from "node:crypto";
import type { PinchyRuntimeConfig, RuntimeModelOptions, ThinkingLevel } from "../../../apps/host/src/runtime-config.js";
import { buildRuntimeConfigSignature } from "../../../apps/host/src/runtime-config-signature.js";
import type { SessionEntry } from "./session-store.js";
import {
  findSessionByConversationId,
  findSessionsByRuntimeConfigSignature,
  getSessionEntry,
  saveSessionEntry,
  updateSessionEntry,
} from "./session-store.js";

export type ConversationalSession = {
  sessionId: string;
  sessionPath: string;
  isStreaming?: boolean;
  prompt: (text: string) => Promise<unknown>;
  followUp: (text: string) => Promise<unknown>;
  steer?: (text: string) => Promise<unknown>;
  abort?: () => Promise<void>;
};

export type SessionCreationInput = {
  cwd: string;
  conversationId?: string;
  sourceRunId?: string;
  runtimeConfig: PinchyRuntimeConfig;
  modelOptions?: RuntimeModelOptions;
  thinkingLevel?: ThinkingLevel;
};

export type OpenSessionInput = {
  cwd: string;
  sessionId: string;
  conversationId?: string;
};

type SessionBackend = {
  create: (input: SessionCreationInput) => Promise<ConversationalSession>;
  open: (sessionPath: string) => Promise<ConversationalSession | undefined>;
};

export type PinchySessionManagerDependencies = {
  backend?: SessionBackend;
};

export class PinchySessionManager {
  private readonly backend: SessionBackend;

  constructor(dependencies: PinchySessionManagerDependencies = {}) {
    this.backend = dependencies.backend ?? {
      create: async () => {
        throw new Error("No session backend configured");
      },
      open: async () => undefined,
    };
  }

  async createSession(input: SessionCreationInput): Promise<ConversationalSession> {
    const sessionId = randomUUID();
    const runtimeConfigSignature = buildRuntimeConfigSignature(input.runtimeConfig);
    
    const session = await this.backend.create({
      ...input,
    });

    if (!session.sessionPath) {
      throw new Error("Created session has no sessionPath");
    }

    const entry = saveSessionEntry(input.cwd, {
      id: sessionId,
      sessionPath: session.sessionPath,
      conversationId: input.conversationId,
      sourceRunId: input.sourceRunId,
      runtimeConfigSignature,
    });

    return { ...session, sessionId, sessionPath: entry.sessionPath };
  }

  async openSession(input: OpenSessionInput): Promise<ConversationalSession> {
    const existingEntry = findSessionByConversationId(input.cwd, input.conversationId ?? "");
    if (existingEntry && existingEntry.id === input.sessionId) {
      const session = await this.backend.open(existingEntry.sessionPath);
      if (!session) {
        throw new Error(`Cannot open session: ${input.sessionId}`);
      }
      return {
        ...session,
        sessionId: existingEntry.id,
        sessionPath: existingEntry.sessionPath,
      };
    }

    const entry = getSessionEntry(input.cwd, input.sessionId);
    if (!entry) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const session = await this.backend.open(entry.sessionPath);
    if (!session) {
      throw new Error(`Cannot open session from path: ${entry.sessionPath}`);
    }

    return { ...session, sessionId: entry.id, sessionPath: entry.sessionPath };
  }

  findSessionByConversationId(cwd: string, conversationId: string): SessionEntry | undefined {
    return findSessionByConversationId(cwd, conversationId);
  }

  findReusableSessions(
    cwd: string,
    runtimeConfigSignature: string,
    excludeConversationId?: string,
  ): SessionEntry[] {
    const sessions = findSessionsByRuntimeConfigSignature(cwd, runtimeConfigSignature);
    if (excludeConversationId) {
      return sessions.filter((s) => s.conversationId !== excludeConversationId);
    }
    return sessions;
  }

  async updateSessionBinding(
    cwd: string,
    sessionId: string,
    patch: Partial<Pick<SessionEntry, "conversationId" | "sourceRunId" | "runtimeConfigSignature">>,
  ): Promise<SessionEntry | undefined> {
    return updateSessionEntry(cwd, sessionId, patch);
  }
}
