import { NextResponse } from "next/server";
import { StacksWalletAgent } from "stacks-agent-kit";

// In-memory storage for agents (replace with a database in production)
const agentStore = new Map<number, StacksWalletAgent>();

interface AgentConfig {
  network: "testnet";
  enableConversational: boolean;
  personalityPrompt: string;
  name: string;
  openAiApiKey?: string;
}

// Initialize agents
export async function POST(request: Request) {
  try {
    const { configs }: { configs: AgentConfig[] } = await request.json();

    // Validate configs
    if (!configs.every((c) => c.network === "testnet")) {
      return NextResponse.json(
        { success: false, error: "Only testnet is supported" },
        { status: 400 }
      );
    }

    const agents: Array<{ id: number; name: string }> = [];
    for (const [index, config] of configs.entries()) {
      const agent = await import("stacks-agent-kit").then((module) =>
        module.createStacksWalletAgent({
          ...config,
          openAiApiKey: process.env.OPENAI_API_KEY,
        })
      );
      await agent.init();
      agentStore.set(index, agent);
      agents.push({ id: index, name: config.name });
    }

    return NextResponse.json({ success: true, agents });
  } catch (error) {
    console.error("Error initializing agents:", error);
    return NextResponse.json(
      { success: false, error: "Failed to initialize agents" },
      { status: 500 }
    );
  }
}

// Handle agent chat
export async function PUT(request: Request) {
  try {
    const { agentId, prompt }: { agentId: number; prompt: string } =
      await request.json();
    const agent = agentStore.get(agentId);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }
    const response = await agent.simpleChat(prompt);
    return NextResponse.json({ success: true, response });
  } catch (error) {
    console.error("Error in agent chat:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process agent chat" },
      { status: 500 }
    );
  }
}
