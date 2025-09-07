import { NextResponse } from "next/server";
import { StacksWalletAgent } from "stacks-agent-kit";

interface TransferParams {
  fromPrivateKey: string;
  toAddress: string;
  amount: string;
  network: "testnet";
  memo?: string;
}

export async function POST(request: Request) {
  try {
    const params: TransferParams = await request.json();
    if (params.network !== "testnet") {
      return NextResponse.json(
        { success: false, error: "Only testnet is supported" },
        { status: 400 }
      );
    }
    if (!params.fromPrivateKey || !params.toAddress || !params.amount) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const agent = await import("stacks-agent-kit").then((module) =>
      module.createStacksWalletAgent({
        network: "testnet",
        privateKey: params.fromPrivateKey,
      })
    );
    await agent.init();

    const transferResult = await agent.transferSTX(params);
    if (!transferResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: transferResult.error || "Failed to transfer STX",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      txId: transferResult.data, // Assuming data is the transaction ID
    });
  } catch (error) {
    console.error("Error transferring STX:", error);
    return NextResponse.json(
      { success: false, error: "Failed to transfer STX" },
      { status: 500 }
    );
  }
}
