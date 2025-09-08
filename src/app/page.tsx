"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Users,
  Coins,
  Play,
  Settings,
  MessageSquare,
} from "lucide-react";
import { createAgent, transferSTX } from "@/lib/agent";

// Define types
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
  personality: string;
  color: string;
  avatar: string;
  alive: boolean;
  isImpostor: boolean;
  suspicionLevel: number;
  agent: {
    init: () => Promise<void>;
    simpleChat: (prompt: string) => Promise<string>;
  } | null;
}

interface LogEntry {
  type: "system" | "agent" | "vote" | "transaction";
  message: string;
  agent?: Agent;
  timestamp: string;
}

const predefinedPersonalities: Array<{
  name: string;
  personality: string;
  color: string;
  avatar: string;
}> = [
  {
    name: "Detective Dave",
    personality:
      "You are a methodical detective who carefully analyzes evidence and behavior patterns. You ask probing questions and make logical deductions.",
    color: "#4A90E2",
    avatar: "🕵️",
  },
  {
    name: "Nervous Nancy",
    personality:
      "You are very anxious and jumpy, often scared of being wrongly accused. You tend to panic and over-explain your actions.",
    color: "#F5A623",
    avatar: "😰",
  },
  {
    name: "Confident Carl",
    personality:
      "You are very self-assured and often take charge of discussions. You're not afraid to make bold accusations.",
    color: "#7ED321",
    avatar: "😎",
  },
  {
    name: "Analytical Anna",
    personality:
      "You approach everything with cold logic and statistical analysis. You speak in data and probabilities.",
    color: "#9013FE",
    avatar: "🤓",
  },
  {
    name: "Joker Jim",
    personality:
      "You use humor to deflect tension and make light of serious situations. Even during accusations, you crack jokes.",
    color: "#FF6B6B",
    avatar: "😂",
  },
  {
    name: "Silent Sam",
    personality:
      "You're quiet and observant, speaking only when necessary. When you do speak, it's usually very insightful.",
    color: "#50E3C2",
    avatar: "🤐",
  },
];

const AmongUsGame: React.FC = () => {
  const [gameState, setGameState] = useState<
    "setup" | "selectImpostor" | "playing" | "finished"
  >("setup");
  const [betAmount, setBetAmount] = useState<number>(0.1);
  const [userAddress, setUserAddress] = useState<string>("");
  const [userPrivateKey, setUserPrivateKey] = useState<string>("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedImpostor, setSelectedImpostor] = useState<number | null>(null);
  const [gameLog, setGameLog] = useState<LogEntry[]>([]);
  const [round, setRound] = useState<number>(0);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [gameProgress, setGameProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isGameRunning, setIsGameRunning] = useState<boolean>(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const gameRunningRef = useRef<boolean>(false);

  // Game-controlled testnet address
  const gameAddress =
    process.env.NEXT_PUBLIC_GAME_ADDRESS ||
    "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";

  const initializeAgents = (count: number): Agent[] => {
    const selectedPersonalities = predefinedPersonalities.slice(0, count);
    return selectedPersonalities.map((personality, index) => ({
      id: index,
      name: personality.name,
      personality: personality.personality,
      color: personality.color,
      avatar: personality.avatar,
      alive: true,
      isImpostor: false,
      suspicionLevel: Math.random() * 0.3,
      agent: null,
    }));
  };

  const fetchBalance = async () => {
    if (!userAddress) return;
    try {
      const response = await fetch("/api/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: userAddress }),
      });
      const result = await response.json();
      if (result.success) {
        setUserBalance(parseFloat(result.balance));
      } else {
        setError(result.error || "Failed to fetch balance");
      }
    } catch (err) {
      console.error("Failed to fetch balance:", err);
      setError("Failed to fetch balance");
    }
  };

  useEffect(() => {
    if (userAddress) {
      void fetchBalance();
    }
  }, [userAddress]);

  const startGame = async () => {
    if (!userAddress || !userPrivateKey) {
      setError("Please provide your wallet address and private key");
      return;
    }
    if (betAmount < 0.1) {
      setError("Bet amount must be at least 0.1 STX");
      return;
    }
    if (userBalance === null || betAmount > userBalance) {
      setError("Insufficient balance or balance not loaded");
      return;
    }

    setError(null);
    setIsGameRunning(true);

    // Transfer bet amount to game address
    try {
      console.log("Transferring bet...");
      const transferResult = await transferSTX({
        fromPrivateKey: userPrivateKey,
        toAddress: gameAddress,
        fromAddress: userAddress,
        amount: betAmount.toString(),
        network: "testnet",
      });
      if (!transferResult.success) {
        setError(transferResult.error || "Failed to transfer bet");
        setIsGameRunning(false);
        return;
      }
      addToLog(
        "transaction",
        `Transferred ${betAmount} STX to game address ${gameAddress} (TxID: ${transferResult.txId})`
      );
      setUserBalance((prev) => (prev !== null ? prev - betAmount : prev));
    } catch (err) {
      console.error("Transfer failed:", err);
      setError("Failed to transfer bet: " + err.message);
      setIsGameRunning(false);
      return;
    }

    const agentCount = Math.max(4, Math.min(6, agents.length || 5));
    const initializedAgents = initializeAgents(agentCount);

    try {
      console.log("Initializing agents...");
      for (let i = 0; i < initializedAgents.length; i++) {
        const agent = initializedAgents[i];
        console.log(`Initializing ${agent.name}...`);

        const config: AgentConfig = {
          network: "testnet",
          enableConversational: true,
          // KEY CHANGE: More explicit personality prompts for Among Us
          personalityPrompt: `You are ${agent.name} playing Among Us. ${agent.personality}
        
IMPORTANT: You are NOT a blockchain assistant. You are playing a social deduction game.
- Make observations about other players
- Share suspicions naturally 
- Defend yourself when accused
- Vote based on behavior and evidence
- Stay in character at all times
- Engage in the social aspects of the game

Respond as your character would in Among Us discussions, voting phases, and social interactions.`,
          name: agent.name,
          openAiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        };

        try {
          agent.agent = await createAgent(config);
          await agent.agent.init();

          // IMPORTANT: Set the agent to Among Us mode
          if (agent.agent.setGameMode) {
            agent.agent.setGameMode("amongus");
          }

          console.log(
            `✅ ${agent.name} initialized successfully in Among Us mode`
          );
        } catch (agentError) {
          console.error(`❌ Failed to initialize ${agent.name}:`, agentError);
          // Create a mock agent for testing if initialization fails
          agent.agent = {
            init: async () => {},
            simpleChat: async (prompt: string) => {
              // Better mock responses for Among Us context
              const amongUsResponses = [
                "I've been watching everyone carefully, and I have some concerns...",
                "That's exactly what an impostor would say!",
                "I was doing tasks in electrical when the lights went out.",
                "Something about their behavior seems off to me.",
                "I think we need to be more strategic about this vote.",
                "I trust my instincts on this one.",
                "Wait, let me think about what I observed...",
              ];
              return amongUsResponses[
                Math.floor(Math.random() * amongUsResponses.length)
              ];
            },
          };
        }
      }

      console.log("All agents initialized for Among Us");
    } catch (err) {
      console.error("Failed to initialize agents:", err);
      setError("Failed to initialize agents. Using mock agents for demo.");

      // Create mock agents for demo purposes with Among Us context
      for (let agent of initializedAgents) {
        if (!agent.agent) {
          agent.agent = {
            init: async () => {},
            simpleChat: async (prompt: string) => {
              const responses = [
                `${agent.name}: I've been keeping track of everyone's movements...`,
                `${agent.name}: Something doesn't feel right about this situation.`,
                `${agent.name}: Based on what I've seen, I have my suspicions.`,
                `${agent.name}: We need to vote carefully here.`,
                `${agent.name}: I was with someone else when that happened.`,
              ];
              return responses[Math.floor(Math.random() * responses.length)];
            },
          };
        }
      }
    }

    setAgents(initializedAgents);
    setGameState("selectImpostor");
    setIsGameRunning(false);
  };

  const selectImpostor = (agentId: number) => {
    setSelectedImpostor(agentId);
    setAgents((prevAgents) =>
      prevAgents.map((agent) => ({
        ...agent,
        isImpostor: agent.id === agentId,
      }))
    );
  };

  const startAmongUsGame = () => {
    if (selectedImpostor === null) {
      setError("Please select an impostor!");
      return;
    }

    setError(null);
    setGameState("playing");
    setIsGameRunning(true);
    gameRunningRef.current = true;

    const impostorAgent = agents.find((a) => a.id === selectedImpostor);
    addToLog(
      "system",
      `Game started! ${impostorAgent?.name} is the secret impostor.`
    );

    // Start the game loop
    void runGameLoop();
  };

  const runGameLoop = async () => {
    console.log("Starting game loop...");
    const maxRounds = 8;

    try {
      for (let currentRound = 1; currentRound <= maxRounds; currentRound++) {
        // Check if game should continue using ref instead of state
        if (!gameRunningRef.current) {
          console.log("Game stopped by user or error");
          break;
        }

        console.log(`Starting round ${currentRound}`);
        setRound(currentRound);
        setGameProgress((currentRound / maxRounds) * 100);

        addToLog("system", `--- Round ${currentRound} ---`);

        // Get current alive agents
        const currentAgents = agents.filter((agent) => agent.alive);
        console.log(
          `Alive agents in round ${currentRound}:`,
          currentAgents.map((a) => a.name)
        );

        // Each agent makes a statement or observation
        for (let i = 0; i < currentAgents.length; i++) {
          const agent = currentAgents[i];

          if (!gameRunningRef.current) {
            console.log("Game stopped during agent statements");
            return;
          }

          let prompt: string;
          if (agent.isImpostor) {
            prompt = `You are the impostor in Among Us. You need to blend in and deflect suspicion while subtly casting doubt on others. The game is in round ${currentRound}. Make a statement that sounds innocent but might redirect suspicion. Keep it brief (1-2 sentences).`;
          } else {
            prompt = `You are a crew member in Among Us trying to identify the impostor. It's round ${currentRound}. Share your observations or suspicions about other players' behavior. Keep it brief (1-2 sentences).`;
          }

          try {
            console.log(`Getting response from ${agent.name}...`);
            if (!agent.agent) {
              throw new Error("Agent not initialized");
            }

            const response = await agent.agent.simpleChat(prompt);
            console.log(
              `${agent.name} responded: ${response.substring(0, 100)}...`
            );

            addToLog("agent", response, agent);
            updateSuspicionLevels(agent, response);

            // Delay for readability
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } catch (error) {
            console.error(`Agent ${agent.name} response error:`, error);
            addToLog(
              "agent",
              "I'm not sure what to think about all this...",
              agent
            );
          }
        }

        // Voting phase every 3 rounds
        if (currentRound % 3 === 0) {
          console.log("Conducting voting...");
          await conductVoting();

          // Check win conditions with updated agents state
          const aliveCrewmates = agents.filter(
            (a) => a.alive && !a.isImpostor
          ).length;
          const aliveImpostors = agents.filter(
            (a) => a.alive && a.isImpostor
          ).length;

          console.log(
            `Alive crewmates: ${aliveCrewmates}, Alive impostors: ${aliveImpostors}`
          );

          if (aliveImpostors === 0) {
            await endGame(true, "Crew wins! The impostor has been eliminated!");
            return;
          } else if (aliveImpostors >= aliveCrewmates) {
            await endGame(
              false,
              "Impostor wins! They've eliminated enough crew members!"
            );
            return;
          }
        }

        // Small delay between rounds
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      // If we reach here, impostor wins by surviving
      await endGame(false, "Impostor wins by surviving all rounds!");
    } catch (error) {
      console.error("Game loop error:", error);
      setError(
        "Game encountered an error: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
      gameRunningRef.current = false;
      setIsGameRunning(false);
    }
  };

  const updateSuspicionLevels = (speakingAgent: Agent, message: string) => {
    setAgents((prevAgents) =>
      prevAgents.map((agent) => {
        if (agent.id === speakingAgent.id) return agent;

        let suspicionChange = 0;

        // If the message mentions this agent or sounds accusatory
        const agentMentioned = message
          .toLowerCase()
          .includes(agent.name.toLowerCase());
        const soundsSuspicious =
          message.toLowerCase().includes("suspicious") ||
          message.toLowerCase().includes("acting weird") ||
          message.toLowerCase().includes("strange") ||
          message.toLowerCase().includes("doubt");

        if (agentMentioned || soundsSuspicious) {
          suspicionChange += 0.1;
        }

        // If the speaking agent is the impostor, their accusations might be strategic
        if (speakingAgent.isImpostor && suspicionChange > 0) {
          suspicionChange += 0.05;
        }

        // Random fluctuation
        suspicionChange += (Math.random() - 0.5) * 0.05;

        return {
          ...agent,
          suspicionLevel: Math.max(
            0,
            Math.min(1, agent.suspicionLevel + suspicionChange)
          ),
        };
      })
    );
  };

  const conductVoting = async () => {
    addToLog(
      "system",
      "🗳️ Voting Phase - Each agent votes for who they think is most suspicious!"
    );

    const aliveAgents = agents.filter((agent) => agent.alive);
    const votes: Record<number, number> = {};

    // Initialize vote counts
    aliveAgents.forEach((agent) => {
      votes[agent.id] = 0;
    });

    // Each agent votes
    for (let voter of aliveAgents) {
      if (!gameRunningRef.current) return;

      const otherAgents = aliveAgents.filter((a) => a.id !== voter.id);

      if (otherAgents.length === 0) continue;

      let target: Agent;

      if (voter.isImpostor) {
        // Impostor tries to vote out crew members, preferably not the most suspicious
        const crewmates = otherAgents.filter((a) => !a.isImpostor);
        if (crewmates.length > 0) {
          target = crewmates.reduce((prev, current) =>
            prev.suspicionLevel < current.suspicionLevel ? prev : current
          );
        } else {
          target = otherAgents[0]; // Fallback
        }
      } else {
        // Crew votes for most suspicious
        target = otherAgents.reduce((prev, current) =>
          prev.suspicionLevel > current.suspicionLevel ? prev : current
        );
      }

      votes[target.id]++;
      addToLog("vote", `${voter.name} votes for ${target.name}`, voter);

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // Find who gets voted out
    const voteEntries = Object.entries(votes).filter(([_, count]) => count > 0);

    if (voteEntries.length === 0) {
      addToLog("system", "No one was voted out this round.");
      return;
    }

    const [votedOutId, maxVotes] = voteEntries.reduce((max, current) =>
      current[1] > max[1] ? current : max
    );

    const votedOutAgent = agents.find((a) => a.id === Number(votedOutId));

    if (votedOutAgent && maxVotes > 0) {
      setAgents((prevAgents) =>
        prevAgents.map((agent) =>
          agent.id === Number(votedOutId) ? { ...agent, alive: false } : agent
        )
      );

      const wasImpostor = votedOutAgent.isImpostor
        ? " (THE IMPOSTOR!)"
        : " (innocent crew member)";
      addToLog("system", `${votedOutAgent.name} was voted out${wasImpostor}`);
    }
  };

  const endGame = async (playerWins: boolean, message: string) => {
    console.log("Ending game:", message);
    gameRunningRef.current = false;
    setIsGameRunning(false);
    setGameState("finished");
    addToLog("system", `🎮 GAME OVER: ${message}`);

    if (playerWins) {
      const winnings = betAmount * 1.8;
      try {
        const transferResult = await transferSTX({
          fromPrivateKey: process.env.NEXT_PUBLIC_GAME_PRIVATE_KEY || "",
          toAddress: userAddress,
          fromAddress: gameAddress,
          amount: winnings.toString(),
          network: "testnet",
        });
        if (transferResult.success) {
          addToLog(
            "transaction",
            `Received ${winnings.toFixed(
              3
            )} STX in winnings from game address ${gameAddress} (TxID: ${
              transferResult.txId
            })`
          );
          setUserBalance((prev) => (prev !== null ? prev + winnings : prev));
        } else {
          setError(transferResult.error || "Failed to transfer winnings");
        }
      } catch (err) {
        console.error("Transfer winnings failed:", err);
        setError(
          "Failed to transfer winnings: " +
            (err instanceof Error ? err.message : "Unknown error")
        );
      }
    } else {
      addToLog("system", `💸 You lost your bet of ${betAmount} STX.`);
    }
  };

  const addToLog = (
    type: LogEntry["type"],
    message: string,
    agent: Agent | null = null
  ) => {
    setGameLog((prev) => [
      ...prev,
      { type, message, agent, timestamp: new Date().toLocaleTimeString() },
    ]);
  };

  const resetGame = () => {
    gameRunningRef.current = false;
    setIsGameRunning(false);
    setGameState("setup");
    setAgents([]);
    setSelectedImpostor(null);
    setGameLog([]);
    setRound(0);
    setGameProgress(0);
    setError(null);
  };

  const stopGame = () => {
    gameRunningRef.current = false;
    setIsGameRunning(false);
    addToLog("system", "Game stopped by user");
  };

  // Auto-scroll to bottom of game log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameLog]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-3">
            <span className="text-5xl">🚀</span>
            Among Us: AI Agent Edition
            <span className="text-5xl">🔍</span>
          </h1>
          <p className="text-xl text-blue-200">
            Bet STX on whether AI agents can identify the impostor!
          </p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              <Coins className="w-5 h-5 mr-2" />
              Balance:{" "}
              {userBalance !== null
                ? `${userBalance.toFixed(3)} STX`
                : "Loading..."}
            </Badge>
            {gameState === "playing" && (
              <Badge variant="default" className="text-lg px-4 py-2">
                Round {round} • {gameProgress.toFixed(0)}% Complete
              </Badge>
            )}
            {isGameRunning && (
              <Button onClick={stopGame} variant="destructive" size="sm">
                Stop Game
              </Button>
            )}
          </div>
          {error && <div className="mt-4 text-red-400 text-sm">{error}</div>}
        </div>

        {/* Game Setup */}
        {gameState === "setup" && (
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <Card className="bg-black/20 border-purple-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Game Setup
                </CardTitle>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Your Testnet Wallet Address
                    </label>
                    <Input
                      type="text"
                      value={userAddress}
                      onChange={(e) => setUserAddress(e.target.value)}
                      placeholder="STxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full p-2 rounded bg-white/10 border border-white/20 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Your Testnet Private Key
                    </label>
                    <Input
                      type="password"
                      value={userPrivateKey}
                      onChange={(e) => setUserPrivateKey(e.target.value)}
                      placeholder="Enter your private key"
                      className="w-full p-2 rounded bg-white/10 border border-white/20 text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Never share your private key. Use a testnet wallet with
                      faucet STX.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Bet Amount (STX)
                    </label>
                    <Input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={betAmount}
                      onChange={(e) => setBetAmount(parseFloat(e.target.value))}
                      className="w-full p-2 rounded bg-white/10 border border-white/20 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Number of AI Agents (4-6)
                    </label>
                    <select
                      value={agents.length || 5}
                      onChange={(e) =>
                        setAgents(Array(parseInt(e.target.value)).fill(null))
                      }
                      className="w-full p-2 rounded bg-white/10 border border-white/20 text-white"
                    >
                      <option value="4">4 Agents</option>
                      <option value="5">5 Agents</option>
                      <option value="6">6 Agents</option>
                    </select>
                  </div>
                  <Button
                    onClick={startGame}
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={
                      !userAddress ||
                      !userPrivateKey ||
                      betAmount < 0.1 ||
                      userBalance === null ||
                      betAmount > userBalance ||
                      isGameRunning
                    }
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {isGameRunning
                      ? "Starting Game..."
                      : "Transfer Bet & Start Game"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/20 border-purple-500/50">
              <CardHeader>
                <CardTitle>How to Play</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p>• Enter your testnet wallet address and private key</p>
                  <p>• Place your STX bet (transferred to game address)</p>
                  <p>• Choose which agent will secretly be the impostor</p>
                  <p>• Watch AI agents interact and try to find the impostor</p>
                  <p>
                    • If crew identifies the impostor, you win 1.8x your bet
                  </p>
                  <p>
                    • If impostor survives or eliminates enough crew, you lose
                  </p>
                  <p>• Each agent has a unique personality and playing style</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Impostor Selection */}
        {gameState === "selectImpostor" && (
          <Card className="bg-black/20 border-red-500/50 mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Select the Secret Impostor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => selectImpostor(agent.id)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedImpostor === agent.id
                        ? "border-red-500 bg-red-500/20"
                        : "border-white/20 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-2">{agent.avatar}</div>
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-xs text-gray-300 mt-1">
                        {agent.personality.substring(0, 50)}...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                onClick={startAmongUsGame}
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={selectedImpostor === null || isGameRunning}
              >
                {isGameRunning ? "Starting Game..." : "Start Among Us Game"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Game Progress */}
        {(gameState === "playing" || gameState === "finished") && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Agents Status */}
            <Card className="bg-black/20 border-purple-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Agent Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {agents.map((agent) => (
                    <div
                      key={agent.id}
                      className={`p-3 rounded-lg border ${
                        !agent.alive
                          ? "border-red-500/50 bg-red-500/10 opacity-50"
                          : agent.isImpostor && gameState === "finished"
                          ? "border-red-500 bg-red-500/20"
                          : "border-white/20 bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{agent.avatar}</span>
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            <div className="text-xs text-gray-300">
                              Suspicion:{" "}
                              {(agent.suspicionLevel * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {!agent.alive && (
                            <Badge variant="destructive">Eliminated</Badge>
                          )}
                          {agent.isImpostor && gameState === "finished" && (
                            <Badge variant="secondary">IMPOSTOR</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Game Log */}
            <Card className="lg:col-span-2 bg-black/20 border-purple-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Game Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96 overflow-y-auto space-y-2 bg-black/20 p-4 rounded">
                  {gameLog.map((entry, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded text-sm ${
                        entry.type === "system"
                          ? "bg-blue-500/20 text-blue-200"
                          : entry.type === "vote"
                          ? "bg-yellow-500/20 text-yellow-200"
                          : entry.type === "transaction"
                          ? "bg-green-500/20 text-green-200"
                          : "bg-white/5"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {entry.agent && (
                          <span className="text-lg">{entry.agent.avatar}</span>
                        )}
                        <div className="flex-1">
                          {entry.agent && (
                            <span className="font-medium text-purple-200">
                              {entry.agent.name}:
                            </span>
                          )}{" "}
                          <span className="text-gray-200">{entry.message}</span>
                          <div className="text-xs text-gray-400 mt-1">
                            {entry.timestamp}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Game Finished */}
        {gameState === "finished" && (
          <div className="mt-6 text-center">
            <Button
              onClick={resetGame}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Play Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AmongUsGame;
