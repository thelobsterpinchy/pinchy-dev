import { createConversation, createNotificationDelivery, getQuestionById, listConversations } from "../../apps/host/src/agent-state-store.js";
import type { NotificationChannel, NotificationDelivery, Question } from "../../packages/shared/src/contracts.js";
import { createDiscordNotifier } from "./discord.js";

type QuestionDispatcherDependencies = {
  sendDiscordQuestion?: ReturnType<typeof createDiscordNotifier>["sendQuestion"];
};

function pickDeliveryChannel(question: Question): NotificationChannel {
  if (!question.channelHints || question.channelHints.length === 0) return "discord";
  return question.channelHints.includes("discord") ? "discord" : question.channelHints[0] ?? "discord";
}

export function createQuestionDeliveryDispatcher(dependencies: QuestionDispatcherDependencies = {}) {
  const discordNotifier = createDiscordNotifier();
  const sendDiscordQuestion = dependencies.sendDiscordQuestion ?? discordNotifier.sendQuestion;

  return {
    async dispatchQuestion(cwd: string, question: Question): Promise<NotificationDelivery> {
      const channel = pickDeliveryChannel(question);
      if (channel === "discord") {
        const conversationTitle = listConversations(cwd).find((entry) => entry.id === question.conversationId)?.title;
        return sendDiscordQuestion(cwd, {
          questionId: question.id,
          runId: question.runId,
          prompt: question.prompt,
          conversationTitle,
        });
      }

      return createNotificationDelivery(cwd, {
        channel,
        status: "failed",
        questionId: question.id,
        runId: question.runId,
        error: `Notification channel not implemented: ${channel}`,
      });
    },
  };
}
