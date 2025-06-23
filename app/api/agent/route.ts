import { ToolInvocation, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { RetrievalService } from "@/lib/retrieval";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: ToolInvocation[];
}

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: "You are a helpful assistant; mostly for beginners.",
    messages,
    onStepFinish(result) {},
    tools: {
      getSources: {
        description: "Get supplementary materials, resources, and the schedule/calendar for the bootcamp",
        parameters: z.object({
          query: z
            .string()
            .describe("The search query to find relevant supplementary materials, resrouces, and the schedule/calendar for the bootcamp"),
        }),
        execute: async ({ query }) => {
          const retrievalService = new RetrievalService();
          const documents = await retrievalService.searchDocuments(query);
          return documents;
        },
      },
      getCurrentDate: {
        description: "Get the current date and timezone in a structured format.",
        parameters: z.object({}),
        execute: async () => {
          const now = new Date();
          const date = now.toISOString().split('T')[0];
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          return { date, timezone };
        },
      },
    },
  });

  return result.toDataStreamResponse();
}
