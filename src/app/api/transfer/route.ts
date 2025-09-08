import {
  makeSTXTokenTransfer,
  TransactionSigner,
  transactionToHex,
} from "@stacks/transactions";
import { NextResponse } from "next/server";

interface TransferParams {
  fromPrivateKey: string;
  fromAddress: string;
  toAddress: string;
  amount: string; // Amount in STX (e.g., "0.1")
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

    // Validate and convert amount to microSTX

    const agent = await import("stacks-agent-kit").then((module) =>
      module.createStacksWalletAgent({
        network: "testnet",
        privateKey: params.fromPrivateKey,
      })
    );

    await agent.init();

    console.log("Fetching account info...", params.fromAddress);
    console.log("agent network", agent.network.client.baseUrl);

    const accountResponse = await fetch(
      `${
        agent.network.client.baseUrl
      }/v2/accounts/${`ST3EKY2FG5KW60TZC2R9D0DF6DJJ98RPW5CN3B9P4`}`
    );

    console.log("Account response status:", accountResponse);

    if (!accountResponse.ok) {
      throw new Error(`Failed to fetch account: ${accountResponse.statusText}`);
    }
    // console.log("accountResponse", accountResponse);
    const accountInfo = await accountResponse.json();
    const nonce = parseInt(accountInfo.nonce || "0");

    console.log(`Nonce: ${nonce}`);

    const txOptions = {
      recipient: params.toAddress,
      amount: 20000n, // Convert STX to microSTX
      senderKey: params.fromPrivateKey,
      network: "testnet" as const,
      memo: "Simple transfer test",
      nonce: nonce,
      fee: 400n,
    };

    const transaction = await makeSTXTokenTransfer(txOptions);

    const signer = new TransactionSigner(transaction);
    signer.signOrigin(params.fromPrivateKey);
    const signedTx = signer.transaction;
    const serializedTx = transactionToHex(signedTx);

    console.log("serializedTx", serializedTx);

    const response = await fetch(
      `${agent.network.client.baseUrl}/v2/transactions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx: serializedTx }),
      }
    );
    const broadcastResponse = await response.json();

    console.log("broadcastResponse", broadcastResponse);

    if (!response.ok) {
      console.log(
        `❌ Transfer failed: ${broadcastResponse.error || "Unknown error"}`
      );
      console.log(
        "Note: This can be because we are using test addresses with no balance.\n"
      );
      return;
    }

    // If we get here, we have a successful transaction
    const txid =
      typeof broadcastResponse === "string"
        ? broadcastResponse
        : broadcastResponse.txid;
    console.log("✅ Transfer successful!");
    console.log(`Transaction ID: ${txid}\n`);

    if (!txid) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to transfer STX",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      txId: txid, // Transaction ID
      amount: 10000, // Original STX amount
      // microSTX: 20000n, // Converted microSTX amount
    });
  } catch (error) {
    console.error("Error transferring STX:", error);

    // More detailed error logging
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Failed to transfer STX: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}
