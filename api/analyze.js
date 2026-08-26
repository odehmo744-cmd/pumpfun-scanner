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

    // 1. Get token metadata
    const assetResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAsset",
        params: {
          id: token,
          displayOptions: {
            showFungible: true
          }
        }
      })
    });

    const assetData = await assetResponse.json();

    if (!assetResponse.ok || assetData.error) {
      return res.status(502).json({
        success: false,
        error:
          assetData.error?.message ||
          "Failed to get token asset data"
      });
    }

    const asset = assetData.result || {};

    // Try all known creator locations
    const creators =
      asset.creators ||
      asset.content?.creators ||
      [];

    const creatorCandidates = creators.map(c => ({
      address:
        c.address ||
        c.pubkey ||
        null,
      verified:
        c.verified ?? null,
      share:
        c.share ?? null
    }));

    // 2. Get earliest signatures
    const historyResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
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

    const oldest =
      [...signatures].reverse();

    const firstSignature =
      oldest[0]?.signature || null;

    let firstTransaction = null;

    // 3. Inspect earliest transaction
    if (firstSignature) {

      const txResponse = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
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

      const tx =
        txData.result;

      if (tx) {

        const accountKeys =
          tx.transaction?.message?.accountKeys || [];

        const signers =
          accountKeys
            .filter(a => a.signer === true)
            .map(a => ({
              address: a.pubkey,
              writable: a.writable
            }));

        firstTransaction = {
          signature: firstSignature,
          slot: tx.slot || null,
          blockTime: tx.blockTime || null,
          feeLamports: tx.meta?.fee || 0,
          signers
        };
      }
    }

    // 4. Choose creator candidate
    const verifiedCreator =
      creatorCandidates.find(
        c => c.verified === true
      );

    const creator =
      verifiedCreator?.address ||
      creatorCandidates[0]?.address ||
      firstTransaction?.signers?.[0]?.address ||
      null;

    return res.status(200).json({
      success: true,

      token,

      creator: {
        address: creator,
        source:
          verifiedCreator
            ? "helius_verified_creator"
            : creatorCandidates.length
              ? "helius_creator"
              : "earliest_transaction_signer"
      },

      creatorCandidates,

      firstTransaction,

      asset: {
        name:
          asset.content?.metadata?.name ||
          null,

        symbol:
          asset.content?.metadata?.symbol ||
          null,

        interface:
          asset.interface ||
          null,

        tokenStandard:
          asset.token_info?.token_standard ||
          null
      }
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
