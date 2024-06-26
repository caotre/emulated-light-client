import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { borshSerialize } from "borsher";
import { hash } from "@coral-xyz/anchor/dist/cjs/utils/sha256";
import {
  ComputeBudgetProgram,
  Connection,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { solanaIbcProgramId, rpcUrl, depositor } from "./constants";
import { getInt64Bytes, hexToBytes, getGuestChainAccounts } from "./utils";
import { instructionSchema } from "./schema";

describe("solana-ibc", () => {
  it("This is test", async () => {
    // Parameters
    const sender = depositor.publicKey; // solana account address
    const receiver = ""; // cosmos address
    const amount = 0; // amount to send
    const channelIdOfSolana = "channel-0"; // example channel id
    const channelIdOfCosmos = "channel-1"; // example channel id
    const portId = "transfer"; // always the same
    const memo = "";
    const tokenMint = new anchor.web3.PublicKey(
      "CAb5AhUMS4EbKp1rEoNJqXGy94Abha4Tg4FrHz7zZDZ3"
    ); // Token that is being sent

    await sendTransfer(
      sender,
      receiver,
      amount,
      channelIdOfSolana,
      channelIdOfCosmos,
      portId,
      memo,
      tokenMint
    );
  });
});

const sendTransfer = async (
  sender: anchor.web3.PublicKey,
  receiver: string,
  amount: number,
  channelIdOfSolana: string,
  channelIdOfCosmos: string,
  portId: string,
  memo: string,
  tokenMint: anchor.web3.PublicKey
) => {
  const senderPublicKey = new anchor.web3.PublicKey(sender);

  const emptyArray = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ];

  const convertedAmount = getInt64Bytes(amount);
  const finalAmount = convertedAmount.concat(emptyArray);

  const senderTokenAccount = await spl.getAssociatedTokenAddress(
    tokenMint,
    senderPublicKey
  );
  let hashedDenom = hexToBytes(hash(tokenMint.toString()));

  const msgTransferPayload = {
    port_id_on_a: portId,
    chan_id_on_a: channelIdOfCosmos,
    packet_data: {
      token: {
        denom: {
          trace_path: [{ port_id: portId, channel_id: channelIdOfCosmos }],
          base_denom: tokenMint.toString(),
        },
        amount: finalAmount,
      },
      sender: senderTokenAccount.toString(),
      receiver,
      memo,
    },
    timeout_height_on_b: {
      Never: {},
    },
    timeout_timestamp_on_b: {
      time: 0,
    },
  };

  const instructionPayload = {
    discriminator: [153, 182, 142, 63, 227, 31, 140, 239],
    port_id: portId,
    channel_id: channelIdOfSolana,
    hashed_base_denom: hashedDenom,
    msg: msgTransferPayload,
  };

  const buffer = borshSerialize(instructionSchema, instructionPayload);

  const {
    guestChainPDA,
    triePDA,
    ibcStoragePDA,
    mintAuthorityPDA,
    escrowAccountPDA,
  } = getGuestChainAccounts(portId, channelIdOfSolana, hashedDenom);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: senderPublicKey, isSigner: true, isWritable: true },
      { pubkey: solanaIbcProgramId, isSigner: false, isWritable: true },
      { pubkey: ibcStoragePDA, isSigner: false, isWritable: true },
      { pubkey: triePDA, isSigner: false, isWritable: true },
      { pubkey: guestChainPDA, isSigner: false, isWritable: true },
      { pubkey: mintAuthorityPDA, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: true },
      { pubkey: escrowAccountPDA, isSigner: false, isWritable: true },
      { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
      {
        pubkey: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: spl.TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: true },
    ],
    programId: solanaIbcProgramId,
    data: buffer, // All instructions are hellos
  });

  const connection = new Connection(rpcUrl, "confirmed");

  let transactions = new Transaction();

  transactions.add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 128 * 1024 })
  );
  transactions.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })
  );
  transactions.add(instruction);

  let tx = await sendAndConfirmTransaction(
    connection,
    transactions,
    [depositor],
    {
      skipPreflight: true,
    }
  );

  console.log("This is transaction, ", tx);
};
