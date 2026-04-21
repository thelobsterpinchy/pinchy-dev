import { createHumanReply, getQuestionById, getRunById, markQuestionAnswered } from "../../apps/host/src/agent-state-store.js";
import type { HumanReply, NotificationChannel } from "../../packages/shared/src/contracts.js";

export class InboundReplyIngestionError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "InboundReplyIngestionError";
  }
}

type IngestInboundReplyInput = {
  questionId: string;
  conversationId: string;
  channel: NotificationChannel;
  content: string;
  rawPayload?: unknown;
};

export function ingestInboundReply(cwd: string, input: IngestInboundReplyInput): HumanReply {
  const question = getQuestionById(cwd, input.questionId);
  if (!question) {
    throw new InboundReplyIngestionError(`Question not found: ${input.questionId}`, 404);
  }

  if (question.conversationId !== input.conversationId) {
    throw new InboundReplyIngestionError("Reply conversation does not match the question conversation.", 409);
  }

  if (question.status === "answered") {
    throw new InboundReplyIngestionError("Question is already answered.", 409);
  }

  const run = getRunById(cwd, question.runId);
  if (!run) {
    throw new InboundReplyIngestionError(`Run not found for question: ${question.runId}`, 404);
  }

  if (!["queued", "waiting_for_human"].includes(run.status)) {
    throw new InboundReplyIngestionError(`Run is not accepting replies in status: ${run.status}`, 409);
  }

  const reply = createHumanReply(cwd, {
    questionId: question.id,
    conversationId: question.conversationId,
    channel: input.channel,
    content: input.content,
    rawPayload: input.rawPayload,
  });

  markQuestionAnswered(cwd, question.id);
  return reply;
}
