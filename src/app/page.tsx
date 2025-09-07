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
  const logEndRef = useRef<HTMLDivElement>(null);

  // Game-controlled testnet address (replace with your actual testnet address)
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

    // Transfer bet amount to game address
    try {
      const transferResult = await transferSTX({
        fromPrivateKey: userPrivateKey,
        toAddress: gameAddress,
        amount: betAmount.toString(),
        network: "testnet",
      });
      if (!transferResult.success) {
        setError(transferResult.error || "Failed to transfer bet");
        return;
      }
      addToLog(
        "transaction",
        `Transferred ${betAmount} STX to game address ${gameAddress}`
      );
      setUserBalance((prev) => (prev !== null ? prev - betAmount : prev));
    } catch (err) {
      console.error("Transfer failed:", err);
      setError("Failed to transfer bet");
      return;
    }

    const agentCount = Math.max(4, Math.min(6, agents.length || 5));
    const initializedAgents = initializeAgents(agentCount);

    try {
      for (let agent of initializedAgents) {
        const config: AgentConfig = {
          network: "testnet",
          enableConversational: true,
          personalityPrompt: agent.personality,
          name: agent.name,
        };
        agent.agent = await createAgent(config);
        await agent.agent.init();
      }
    } catch (err) {
      console.error("Failed to initialize agents:", err);
      setError("Failed to initialize agents. Please try again.");
      return;
    }

    setAgents(initializedAgents);
    setGameState("selectImpostor");
  };

  const selectImpostor = (agentId: number) => {
    setSelectedImpostor(agentId);
    const updatedAgents = agents.map((agent) => ({
      ...agent,
      isImpostor: agent.id === agentId,
    }));
    setAgents(updatedAgents);
  };

  const startAmongUsGame = () => {
    if (selectedImpostor === null) {
      setError("Please select an impostor!");
      return;
    }

    setError(null);
    setGameState("playing");
    setGameLog([
      {
        type: "system",
        message: `Game started! ${
          agents.find((a) => a.id === selectedImpostor)?.name
        } is the secret impostor.`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    // Start the game loop
    void runGameLoop();
  };

  const runGameLoop = async () => {
    const maxRounds = 8;

    for (let currentRound = 1; currentRound <= maxRounds; currentRound++) {
      if (gameState !== "playing") break;

      setRound(currentRound);
      setGameProgress((currentRound / maxRounds) * 100);

      // Add round start message
      addToLog("system", `--- Round ${currentRound} ---`);

      // Each agent makes a statement or observation
      const aliveAgents = agents.filter((agent) => agent.alive);

      for (let agent of aliveAgents) {
        if (gameState !== "playing") break;

        let prompt: string;
        if (agent.isImpostor) {
          prompt = `You are the impostor in Among Us. You need to blend in and deflect suspicion while subtly casting doubt on others. The game is in round ${currentRound}. Make a statement that sounds innocent but might redirect suspicion.`;
        } else {
          prompt = `You are a crew member in Among Us trying to identify the impostor. It's round ${currentRound}. Share your observations or suspicions about other players' behavior.`;
        }

        try {
          if (!agent.agent) throw new Error("Agent not initialized");
          const response = await agent.agent.simpleChat(prompt);
          addToLog("agent", response, agent);

          // Update suspicion levels based on responses
          updateSuspicionLevels(agent, response);

          // Small delay for readability
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } catch (error) {
          console.error("Agent response error:", error);
          addToLog(
            "agent",
            "I'm not sure what to think about all this...",
            agent
          );
        }
      }

      // Voting phase every few rounds
      if (currentRound % 3 === 0) {
        await conductVoting();

        // Check win conditions
        const aliveCrewmates = agents.filter(
          (a) => a.alive && !a.isImpostor
        ).length;
        const aliveImpostors = agents.filter(
          (a) => a.alive && a.isImpostor
        ).length;

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
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // If we reach here, impostor wins by surviving
    await endGame(false, "Impostor wins by surviving all rounds!");
  };

  const updateSuspicionLevels = (speakingAgent: Agent, message: string) => {
    setAgents((prevAgents) =>
      prevAgents.map((agent) => {
        if (agent.id === speakingAgent.id) return agent;

        let suspicionChange = 0;

        // If the message mentions this agent or sounds accusatory
        if (
          message.toLowerCase().includes(agent.name.toLowerCase()) ||
          message.toLowerCase().includes("suspicious") ||
          message.toLowerCase().includes("acting weird")
        ) {
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
      // Determine who this agent votes for based on suspicion levels
      const otherAgents = aliveAgents.filter((a) => a.id !== voter.id);

      let target: Agent | undefined;
      if (voter.isImpostor) {
        // Impostor tries to vote out crew members, preferably not the most suspicious
        const crewmates = otherAgents.filter((a) => !a.isImpostor);
        target = crewmates.reduce((prev, current) =>
          prev.suspicionLevel < current.suspicionLevel ? prev : current
        );
      } else {
        // Crew votes for most suspicious
        target = otherAgents.reduce((prev, current) =>
          prev.suspicionLevel > current.suspicionLevel ? prev : current
        );
      }

      if (target) {
        votes[target.id]++;
        addToLog("vote", `${voter.name} votes for ${target.name}`, voter);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Find who gets voted out
    const votedOut = Object.keys(votes).reduce((a, b) =>
      votes[Number(a)] > votes[Number(b)] ? a : b
    );
    const votedOutAgent = agents.find((a) => a.id === Number(votedOut));

    if (votedOutAgent && votes[Number(votedOut)] > 0) {
      setAgents((prevAgents) =>
        prevAgents.map((agent) =>
          agent.id === Number(votedOut) ? { ...agent, alive: false } : agent
        )
      );

      const wasImpostor = votedOutAgent.isImpostor
        ? " (THE IMPOSTOR!)"
        : " (innocent crew member)";
      addToLog("system", `${votedOutAgent.name} was voted out${wasImpostor}`);
    } else {
      addToLog("system", "No one was voted out this round.");
    }
  };

  const endGame = async (playerWins: boolean, message: string) => {
    setGameState("finished");
    addToLog("system", `🎮 GAME OVER: ${message}`);

    if (playerWins) {
      const winnings = betAmount * 1.8;
      try {
        const transferResult = await transferSTX({
          fromPrivateKey: process.env.NEXT_PUBLIC_GAME_PRIVATE_KEY || "",
          toAddress: userAddress,
          amount: winnings.toString(),
          network: "testnet",
        });
        if (!transferResult.success) {
          setError(transferResult.error || "Failed to transfer winnings");
          return;
        }
        addToLog(
          "transaction",
          `Received ${winnings.toFixed(
            3
          )} STX in winnings from game address ${gameAddress}`
        );
        setUserBalance((prev) => (prev !== null ? prev + winnings : prev));
      } catch (err) {
        console.error("Transfer winnings failed:", err);
        setError("Failed to transfer winnings");
        return;
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
    setGameState("setup");
    setAgents([]);
    setSelectedImpostor(null);
    setGameLog([]);
    setRound(0);
    setGameProgress(0);
    setError(null);
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
                      betAmount > userBalance
                    }
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Transfer Bet & Start Game
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
                disabled={selectedImpostor === null}
              >
                Start Among Us Game
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
