interface AgentConfig {
  network: "testnet";
  enableConversational: boolean;
  personalityPrompt: string;
  name: string;
  openAiApiKey?: string;
}

interface Agent {
  id: number;
  name: string;
  init: () => Promise<void>;
  simpleChat: (prompt: string) => Promise<string>;
}

interface TransferParams {
  fromPrivateKey: string;
  toAddress: string;
  amount: string; // Amount in STX (e.g., "0.1")
  network: "testnet";
  memo?: string;
  fromAddress: string;
}

interface TransferResult {
  success: boolean;
  txId?: string;
  error?: string;
}

export async function createAgent(config: AgentConfig): Promise<Agent> {
  const response = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ configs: [config] }),
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Failed to initialize agent");
  }

  const agentId = result.agents[0].id;
  const agentName = result.agents[0].name;

  return {
    id: agentId,
    name: agentName,
    async init() {
      // Initialization handled server-side
    },
    async simpleChat(prompt: string) {
      const chatResponse = await fetch("/api/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, prompt }),
      });

      const chatResult = await chatResponse.json();
      if (!chatResult.success) {
        throw new Error(chatResult.error || "Failed to process chat");
      }

      return chatResult.response;
    },
  };
}

export async function transferSTX(
  params: TransferParams
): Promise<TransferResult> {
  // Validate amount client-side
  const amountNum = parseFloat(params.amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return {
      success: false,
      error: "Invalid amount: must be a positive number",
    };
  }
  console.log("transferSTX params", params);
  const response = await fetch("/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const result = await response.json();
  return result;
}
