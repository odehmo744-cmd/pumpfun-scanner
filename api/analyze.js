export default async function handler(req, res) {
  try {
    const token = req.query?.token;
    const apiKey = process.env.HELIUS_API_KEY;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing token address"
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "HELIUS_API_KEY is not configured"
      });
    }

    const rpcUrl =
      "https://mainnet.helius-rpc.com/?api-key=" +
      encodeURIComponent(apiKey);

    // Find the earliest transaction involving the token.
    const historyResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [
          token,
          {
            limit: 1000
          }
        ]
      })
    });

    const history = await historyResponse.json();

    if (!historyResponse.ok || history.error) {
      return res.status(502).json({
        success: false,
        error:
          history.error?.message ||
          "Failed to get token history"
      });
    }

    const signatures =
      history.result || [];

    if (!signatures.length) {
      return res.status(404).json({
        success: false,
        error: "No transactions found"
      });
    }

    // getSignaturesForAddress returns newest first.
    // Reverse to inspect the oldest transactions first.
    const oldest = [
      ...signatures
    ].reverse();

    const firstSignature =
      oldest[0].signature;

    // Fetch the actual transaction from Solana RPC.
    const txResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getTransaction",
        params: [
          firstSignature,
          {
            encoding: "jsonParsed",
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0
          }
        ]
      })
    });

    const txData =
      await txResponse.json();

    if (!txResponse.ok || txData.error) {
      return res.status(502).json({
        success: false,
        error:
          txData.error?.message ||
          "Failed to fetch transaction"
      });
    }

    const tx =
      txData.result;

    if (!tx) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
        signature: firstSignature
      });
    }

    const message =
      tx.transaction?.message;

    const accountKeys =
      message?.accountKeys || [];

    const signers =
      accountKeys
        .filter(account => account.signer === true)
        .map(account => ({
          address: account.pubkey,
          writable: account.writable
        }));

    return res.status(200).json({
      success: true,

      token,

      firstTransaction: {
        signature: firstSignature,
        slot: tx.slot || null,
        blockTime: tx.blockTime || null,
        feeLamports: tx.meta?.fee || 0,

        signers,

        accounts: accountKeys.map(
          account => ({
            address: account.pubkey,
            signer: account.signer,
            writable: account.writable
          })
        )
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
