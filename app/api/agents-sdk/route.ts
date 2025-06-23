import { Agent, Runner, tool } from "@openai/agents";
import { openai } from "@ai-sdk/openai";
import { aisdk } from "@openai/agents-extensions";
import { z } from "zod";
import { RetrievalService } from "@/lib/retrieval";

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

function getLocation() {
  return { lat: 37.7749, lon: -122.4194 };
}

function getWeather({
  lat,
  lon,
  unit,
}: {
  lat: number;
  lon: number;
  unit: "C" | "F";
}) {
  return { value: 25, description: "Sunny" };
}

export async function POST(req: Request) {
  try {
    const { messages }: { messages: AgentMessage[] } = await req.json();

    const model = aisdk(openai("gpt-4o"));

    const agent = new Agent({
      name: "AI SDK Agent Assistant",
      instructions: `You are a helpful assistant that can access location data, weather information, and proprietary document sources. 
      
      When users ask questions:
      1. Use available tools to gather relevant information
      2. Provide comprehensive answers based on the data retrieved
      3. Be clear about what information comes from which sources`,
      model,
      tools: [
        tool({
          name: "getLocation",
          description: "Get the current location of the user",
          parameters: z.object({}),
          execute: async () => {
            const { lat, lon } = getLocation();
            return `Current location: latitude ${lat}, longitude ${lon}`;
          },
        }),
        tool({
          name: "getWeather",
          description: "Get weather information for a specific location",
          parameters: z.object({
            lat: z.number().describe("The latitude of the location"),
            lon: z.number().describe("The longitude of the location"),
            unit: z
              .enum(["C", "F"])
              .describe("The unit to display the temperature in"),
          }),
          execute: async ({ lat, lon, unit }) => {
            const { value, description } = getWeather({ lat, lon, unit });
            return `Weather: ${value}°${unit}, ${description}`;
          },
        }),
        tool({
          name: "searchDocuments",
          description:
            "Search through proprietary document sources for relevant information",
          parameters: z.object({
            query: z
              .string()
              .describe("The search query to find relevant documents"),
          }),
          execute: async ({ query }) => {
            const retrievalService = new RetrievalService();
            const documents = await retrievalService.searchDocuments(query);
            return `Search completed for query: ${query}. Documents retrieved: ${documents}.`;
          },
        }),
      ],
    });

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== "user") {
      return Response.json(
        { error: "Invalid message format" },
        { status: 400 }
      );
    }

    const runner = new Runner({
      model,
    });

    const stream = await runner.run(agent, latestMessage.content, {
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const textStream = stream.toTextStream({
            compatibleWithNodeStreams: false,
          });

          for await (const chunk of textStream) {
            const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }

          await stream.completed;
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in agents SDK endpoint:", error);
    return Response.json(
      { error: "Failed to process request with Agents SDK" },
      { status: 500 }
    );
  }
}
