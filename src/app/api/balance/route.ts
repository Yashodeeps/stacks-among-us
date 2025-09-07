import { NextResponse } from "next/server";
import { StacksWalletAgent } from "stacks-agent-kit";

export async function POST(request: Request) {
  try {
    const { address }: { address: string } = await request.json();
    if (!address) {
      return NextResponse.json(
        { success: false, error: "Address is required" },
        { status: 400 }
      );
    }

    const agent = await import("stacks-agent-kit").then((module) =>
      module.createStacksWalletAgent({
        network: "testnet",
      })
    );
    await agent.init();

    const balanceResult = await agent.getBalance({ address });
    if (!balanceResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: balanceResult.error || "Failed to fetch balance",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      balance: balanceResult.data,
    });
  } catch (error) {
    console.error("Error fetching balance:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
