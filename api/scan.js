export default async function handler(req, res) {
  try {
    // ==================================================
    // NO CACHE
    // ==================================================

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const scannedAt = Date.now();

    // ==================================================
    // TOKEN
    // ==================================================

    const token = String(req.query?.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing token address"
      });
    }

    if (token.length < 32 || token.length > 50) {
      return res.status(400).json({
        success: false,
        error: "Invalid Solana token address"
      });
    }

    // ==================================================
    // HELIUS
    // ==================================================

    const heliusKey = process.env.HELIUS_API_KEY;

    if (!heliusKey) {
      return res.status(500).json({
        success: false,
        error: "HELIUS_API_KEY is not configured"
      });
    }

    const rpcUrl =
      "https://mainnet.helius-rpc.com/?api-key=" +
      encodeURIComponent(heliusKey);

    // ==================================================
    // RPC HELPER
    // ==================================================

    async function rpc(method, params, id) {
      const response = await fetch(rpcUrl, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, max-age=0"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params
        })
      });

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          `Invalid RPC response: ${method}`
        );
      }

      if (!response.ok) {
        throw new Error(
          `RPC HTTP ${response.status}`
        );
      }

      if (data.error) {
        throw new Error(
          data.error.message ||
          `RPC error: ${method}`
        );
      }

      return data.result;
    }

    // ==================================================
    // DEXSCREENER
    // ==================================================

    const dexUrl =
      "https://api.dexscreener.com/tokens/v1/solana/" +
      encodeURIComponent(token);

    const dexResponse = await fetch(dexUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control":
          "no-cache, no-store, max-age=0"
      }
    });

    let pairs = [];

    if (dexResponse.ok) {
      try {
        pairs = await dexResponse.json();
      } catch {
        pairs = [];
      }
    }

    if (
      !Array.isArray(pairs) ||
      pairs.length === 0
    ) {
      return res.status(404).json({
        success: false,
        error:
          "No market data found for this token"
      });
    }

    // ==================================================
    // SELECT BEST SOLANA PAIR
    // ==================================================

    const solanaPairs = pairs.filter(
      p =>
        String(p?.chainId || "").toLowerCase() ===
        "solana"
    );

    const validPairs =
      solanaPairs.length > 0
        ? solanaPairs
        : pairs;

    const pair =
      validPairs
        .filter(
          p =>
            Number(
              p?.liquidity?.usd || 0
            ) > 0
        )
        .sort(
          (a, b) =>
            Number(
              b?.liquidity?.usd || 0
            ) -
            Number(
              a?.liquidity?.usd || 0
            )
        )[0] ||
      validPairs[0];

    if (!pair) {
      return res.status(404).json({
        success: false,
        error:
          "No usable trading pair found"
      });
    }

    // ==================================================
    // MARKET
    // ==================================================

    const priceUsd =
      Number(pair?.priceUsd || 0);

    const liquidity =
      Number(pair?.liquidity?.usd || 0);

    const volume24h =
      Number(pair?.volume?.h24 || 0);

    const volume6h =
      Number(pair?.volume?.h6 || 0);

    const volume1h =
      Number(pair?.volume?.h1 || 0);

    const priceChange24h =
      Number(pair?.priceChange?.h24 || 0);

    const priceChange1h =
      Number(pair?.priceChange?.h1 || 0);

    const marketCap =
      Number(
        pair?.marketCap ??
        pair?.fdv ??
        0
      );

    const fdv =
      Number(pair?.fdv || 0);

    const volumeLiquidityRatio =
      liquidity > 0
        ? volume24h / liquidity
        : 0;

    // ==================================================
    // TRADING
    // ==================================================

    const buys1h =
      Number(
        pair?.txns?.h1?.buys || 0
      );

    const sells1h =
      Number(
        pair?.txns?.h1?.sells || 0
      );

    const buys5m =
      Number(
        pair?.txns?.m5?.buys || 0
      );

    const sells5m =
      Number(
        pair?.txns?.m5?.sells || 0
      );

    const totalTrades =
      buys1h + sells1h;

    const totalTrades5m =
      buys5m + sells5m;

    const buyPressure =
      totalTrades > 0
        ? Number(
            (
              (buys1h /
                totalTrades) *
              100
            ).toFixed(2)
          )
        : 0;

    const buyPressure5m =
      totalTrades5m > 0
        ? Number(
            (
              (buys5m /
                totalTrades5m) *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // PAIR AGE
    // ==================================================

    const pairCreatedAt =
      Number(
        pair?.pairCreatedAt || 0
      );

    const pairAgeMinutes =
      pairCreatedAt > 0
        ? Math.max(
            0,
            (
              scannedAt -
              pairCreatedAt
            ) / 60000
          )
        : null;

    const pairAgeHours =
      pairAgeMinutes !== null
        ? pairAgeMinutes / 60
        : null;

    // ==================================================
    // SUPPLY
    // ==================================================

    const supplyResult =
      await rpc(
        "getTokenSupply",
        [
          token,
          {
            commitment: "confirmed"
          }
        ],
        scannedAt + 1
      );

    const supply =
      Number(
        supplyResult?.value?.uiAmount || 0
      );

    const decimals =
      Number(
        supplyResult?.value?.decimals || 0
      );

    // ==================================================
    // TOKEN MINT ACCOUNT
    // ==================================================

    let mintAuthority = null;
    let freezeAuthority = null;

    try {
      const mintAccount =
        await rpc(
          "getAccountInfo",
          [
            token,
            {
              encoding: "jsonParsed",
              commitment: "confirmed"
            }
          ],
          scannedAt + 2
        );

      const parsed =
        mintAccount?.value
          ?.data
          ?.parsed
          ?.info;

      mintAuthority =
        parsed?.mintAuthority || null;

      freezeAuthority =
        parsed?.freezeAuthority || null;
    } catch {
      mintAuthority = null;
      freezeAuthority = null;
    }

    // ==================================================
    // LARGEST TOKEN ACCOUNTS
    // ==================================================

    let largestAccounts = [];

    try {
      const largestResult =
        await rpc(
          "getTokenLargestAccounts",
          [
            token,
            {
              commitment: "confirmed"
            }
          ],
          scannedAt + 3
        );

      // IMPORTANT:
      // getTokenLargestAccounts returns:
      // { value: [...] }
      largestAccounts =
        Array.isArray(
          largestResult?.value
        )
          ? largestResult.value
          : [];
    } catch {
      largestAccounts = [];
    }

    // ==================================================
    // TOKEN ACCOUNT ADDRESSES
    // ==================================================

    const addresses =
      largestAccounts
        .map(
          account =>
            account?.address
        )
        .filter(Boolean);

    // ==================================================
    // GET TOKEN ACCOUNT OWNERS
    // ==================================================

    let ownerAccounts = [];

    if (addresses.length > 0) {
      try {
        const ownerAccountsResult =
          await rpc(
            "getMultipleAccounts",
            [
              addresses,
              {
                encoding: "jsonParsed",
                commitment: "confirmed"
              }
            ],
            scannedAt + 4
          );

        // ==================================================
        // IMPORTANT FIX
        //
        // getMultipleAccounts returns:
        //
        // {
        //   value: [...]
        // }
        //
        // NOT [...]
        // ==================================================

        ownerAccounts =
          Array.isArray(
            ownerAccountsResult?.value
          )
            ? ownerAccountsResult.value
            : [];
      } catch {
        ownerAccounts = [];
      }
    }

    // ==================================================
    // HOLDER AGGREGATION
    // ==================================================

    const holdersMap =
      new Map();

    largestAccounts.forEach(
      (account, index) => {

        const accountInfo =
          ownerAccounts[index];

        const owner =
          accountInfo
            ?.data
            ?.parsed
            ?.info
            ?.owner;

        const amount =
          Number(
            account?.uiAmount || 0
          );

        if (
          !owner ||
          amount <= 0
        ) {
          return;
        }

        holdersMap.set(
          owner,
          (
            holdersMap.get(owner) ||
            0
          ) + amount
        );
      }
    );

    // ==================================================
    // HOLDERS ARRAY
    // ==================================================

    const holders =
      Array.from(
        holdersMap.entries()
      )
        .map(
          ([address, amount]) => ({
            address,
            amount,
            percentage:
              supply > 0
                ? Number(
                    (
                      (amount /
                        supply) *
                      100
                    ).toFixed(4)
                  )
                : 0
          })
        )
        .sort(
          (a, b) =>
            b.amount -
            a.amount
        );

    // ==================================================
    // HOLDER CONCENTRATION
    // ==================================================

    const top1Percentage =
      holders[0]?.percentage || 0;

    const top3Percentage =
      holders
        .slice(0, 3)
        .reduce(
          (sum, holder) =>
            sum +
            holder.percentage,
          0
        );

    const top5Percentage =
      holders
        .slice(0, 5)
        .reduce(
          (sum, holder) =>
            sum +
            holder.percentage,
          0
        );

    const top10Percentage =
      holders
        .slice(0, 10)
        .reduce(
          (sum, holder) =>
            sum +
            holder.percentage,
          0
        );

    const top20Percentage =
      holders
        .slice(0, 20)
        .reduce(
          (sum, holder) =>
            sum +
            holder.percentage,
          0
        );

    const whale5 =
      holders.filter(
        holder =>
          holder.percentage >= 5
      ).length;

    const uniqueOwners =
      holders.length;

    // ==================================================
    // TOP WALLETS
    // ==================================================

    const topWallets =
      holders
        .slice(0, 20)
        .map(
          (holder, index) => ({
            rank: index + 1,
            address:
              holder.address,
            amount:
              holder.amount,
            percentage:
              holder.percentage
          })
        );

    // ==================================================
    // HELIUS ENHANCED TRANSACTIONS
    // ==================================================

    let enhancedTransactions = [];

    try {
      const txUrl =
        "https://api.helius.xyz/v0/addresses/" +
        encodeURIComponent(token) +
        "/transactions?api-key=" +
        encodeURIComponent(heliusKey) +
        "&limit=100";

      const txResponse =
        await fetch(
          txUrl,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              "Cache-Control":
                "no-cache, no-store, max-age=0"
            }
          }
        );

      if (txResponse.ok) {
        const txData =
          await txResponse.json();

        if (
          Array.isArray(txData)
        ) {
          enhancedTransactions =
            txData;
        }
      }
    } catch {
      enhancedTransactions = [];
    }

    // ==================================================
    // SORT TRANSACTIONS
    // ==================================================

    enhancedTransactions.sort(
      (a, b) =>
        Number(
          a?.timestamp || 0
        ) -
        Number(
          b?.timestamp || 0
        )
    );

    // ==================================================
    // CREATOR / DEV DETECTION
    // ==================================================

    let creatorAddress = null;
    let creatorTransaction = null;

    for (
      const tx of enhancedTransactions
    ) {

      const feePayer =
        tx?.feePayer ||
        tx?.fee_payer ||
        tx?.signer ||
        tx?.signers?.[0] ||
        null;

      if (feePayer) {

        creatorAddress =
          feePayer;

        creatorTransaction =
          tx;

        break;
      }
    }

    // ==================================================
    // FIRST BUYERS
    // ==================================================

    const firstBuyerMap =
      new Map();

    for (
      const tx of enhancedTransactions
    ) {

      const tokenTransfers =
        Array.isArray(
          tx?.tokenTransfers
        )
          ? tx.tokenTransfers
          : [];

      const txType =
        String(
          tx?.type || ""
        ).toUpperCase();

      const isPotentialBuy =
        txType === "SWAP" ||
        txType === "UNKNOWN" ||
        txType === "";

      if (!isPotentialBuy) {
        continue;
      }

      for (
        const transfer of tokenTransfers
      ) {

        const mint =
          transfer?.mint;

        if (
          String(mint) !==
          String(token)
        ) {
          continue;
        }

        const to =
          transfer?.toUserAccount ||
          transfer?.toTokenAccount ||
          null;

        const amount =
          Number(
            transfer?.tokenAmount || 0
          );

        if (
          !to ||
          amount <= 0
        ) {
          continue;
        }

        if (
          creatorAddress &&
          to === creatorAddress
        ) {
          continue;
        }

        if (
          to === token
        ) {
          continue;
        }

        if (
          !firstBuyerMap.has(to)
        ) {

          firstBuyerMap.set(
            to,
            {
              address: to,
              amount,
              transactions: 1,
              firstSeen:
                Number(
                  tx?.timestamp ||
                  0
                ),
              signature:
                tx?.signature ||
                tx?.transactionSignature ||
                null
            }
          );

        } else {

          const existing =
            firstBuyerMap.get(to);

          existing.amount += amount;
          existing.transactions += 1;
        }
      }
    }

    const firstBuyers =
      Array.from(
        firstBuyerMap.values()
      )
        .sort(
          (a, b) =>
            a.firstSeen -
            b.firstSeen
        )
        .slice(0, 20)
        .map(
          (buyer, index) => ({
            rank: index + 1,
            address:
              buyer.address,
            amount:
              buyer.amount,
            transactions:
              buyer.transactions,
            firstSeen:
              buyer.firstSeen
                ? new Date(
                    buyer.firstSeen *
                      1000
                  ).toISOString()
                : null,
            signature:
              buyer.signature
          })
        );

    // ==================================================
    // FIRST BUYERS CONCENTRATION
    // ==================================================

    const firstBuyerTotal =
      firstBuyers.reduce(
        (sum, buyer) =>
          sum +
          Number(
            buyer.amount || 0
          ),
        0
      );

    const firstBuyerPercentage =
      supply > 0
        ? Number(
            (
              (firstBuyerTotal /
                supply) *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // DEV HOLDING
    // ==================================================

    let devHolding = 0;
    let devHoldingPercentage = 0;

    if (creatorAddress) {

      const devHolder =
        holders.find(
          holder =>
            holder.address ===
            creatorAddress
        );

      if (devHolder) {

        devHolding =
          devHolder.amount;

        devHoldingPercentage =
          devHolder.percentage;
      }
    }

    // ==================================================
    // DEV STATUS
    // ==================================================

    let developerStatus =
      "Creator not confidently detected";

    if (creatorAddress) {

      if (
        devHoldingPercentage > 20
      ) {

        developerStatus =
          "🚨 Creator wallet holds a very large supply";

      } else if (
        devHoldingPercentage > 10
      ) {

        developerStatus =
          "⚠️ Creator wallet still holds significant supply";

      } else if (
        devHoldingPercentage > 0
      ) {

        developerStatus =
          "Creator detected with limited remaining holdings";

      } else {

        developerStatus =
          "Creator detected but no significant current holding found";
      }
    }

    // ==================================================
    // RISK FLAGS
    // ==================================================

    const riskFlags = [];

    if (
      liquidity < 10000
    ) {

      riskFlags.push(
        "🚨 Extremely low liquidity"
      );

    } else if (
      liquidity < 20000
    ) {

      riskFlags.push(
        "⚠️ Low liquidity"
      );
    }

    if (
      liquidity > 0 &&
      volumeLiquidityRatio > 50
    ) {

      riskFlags.push(
        "🚨 Extreme volume/liquidity ratio"
      );

    } else if (
      liquidity > 0 &&
      volumeLiquidityRatio > 40
    ) {

      riskFlags.push(
        "⚠️ Very high volume/liquidity ratio"
      );
    }

    if (
      buyPressure < 40
    ) {

      riskFlags.push(
        "🚨 Heavy selling pressure"
      );

    } else if (
      buyPressure < 48
    ) {

      riskFlags.push(
        "⚠️ Selling pressure is elevated"
      );
    }

    if (
      top1Percentage > 30
    ) {

      riskFlags.push(
        "🚨 Top holder concentration is very high"
      );

    } else if (
      top1Percentage > 20
    ) {

      riskFlags.push(
        "⚠️ Top holder concentration is elevated"
      );
    }

    if (
      top5Percentage > 65
    ) {

      riskFlags.push(
        "🚨 Top 5 holders control a large supply"
      );

    } else if (
      top5Percentage > 50
    ) {

      riskFlags.push(
        "⚠️ High top 5 concentration"
      );
    }

    if (mintAuthority) {

      riskFlags.push(
        "⚠️ Mint authority is still active"
      );
    }

    if (freezeAuthority) {

      riskFlags.push(
        "⚠️ Freeze authority is still active"
      );
    }

    if (
      pairAgeMinutes !== null &&
      pairAgeMinutes < 10
    ) {

      riskFlags.push(
        "⚠️ Extremely new trading pair"
      );

    } else if (
      pairAgeHours !== null &&
      pairAgeHours < 1
    ) {

      riskFlags.push(
        "⚠️ Trading pair is less than 1 hour old"
      );
    }

    if (
      priceChange24h > 1500
    ) {

      riskFlags.push(
        "🚨 Extreme 24H price increase"
      );

    } else if (
      priceChange24h > 500
    ) {

      riskFlags.push(
        "⚠️ Very large 24H price increase"
      );
    }

    if (
      totalTrades > 0 &&
      totalTrades < 50
    ) {

      riskFlags.push(
        "⚠️ Very low trading activity"
      );
    }

    if (
      devHoldingPercentage > 20
    ) {

      riskFlags.push(
        "🚨 Creator still controls significant supply"
      );

    } else if (
      devHoldingPercentage > 10
    ) {

      riskFlags.push(
        "⚠️ Creator still holds meaningful supply"
      );
    }

    if (
      firstBuyerPercentage > 30
    ) {

      riskFlags.push(
        "🚨 First buyer group controls a large supply"
      );

    } else if (
      firstBuyerPercentage > 15
    ) {

      riskFlags.push(
        "⚠️ First buyers hold a significant supply"
      );
    }

    // ==================================================
    // POSITIVE SIGNALS
    // ==================================================

    const positives = [];

    if (
      liquidity >= 100000
    ) {

      positives.push(
        "Strong liquidity"
      );

    } else if (
      liquidity >= 50000
    ) {

      positives.push(
        "Good liquidity"
      );
    }

    if (
      volumeLiquidityRatio >= 2 &&
      volumeLiquidityRatio <= 40
    ) {

      positives.push(
        "Healthy volume/liquidity activity"
      );
    }

    if (
      buyPressure >= 60
    ) {

      positives.push(
        "Strong buying pressure"
      );

    } else if (
      buyPressure >= 55
    ) {

      positives.push(
        "Positive buying pressure"
      );
    }

    if (
      top1Percentage <= 10
    ) {

      positives.push(
        "Low top-holder concentration"
      );
    }

    if (
      top5Percentage <= 30
    ) {

      positives.push(
        "Healthy top-5 concentration"
      );
    }

    if (
      uniqueOwners >= 100
    ) {

      positives.push(
        "Good holder distribution"
      );
    }

    if (
      totalTrades >= 2000
    ) {

      positives.push(
        "Very active trading"
      );
    }

    if (
      devHoldingPercentage <= 5 &&
      creatorAddress
    ) {

      positives.push(
        "Creator has limited remaining holdings"
      );
    }

    if (
      firstBuyers.length >= 5
    ) {

      positives.push(
        "Multiple early buyers detected"
      );
    }

    // ==================================================
    // SCORE
    // ==================================================

    let score = 0;

    // Liquidity: 20
    if (
      liquidity >= 100000
    ) {

      score += 20;

    } else if (
      liquidity >= 50000
    ) {

      score += 16;

    } else if (
      liquidity >= 20000
    ) {

      score += 12;

    } else if (
      liquidity >= 10000
    ) {

      score += 7;
    }

    // Volume: 15
    if (
      volumeLiquidityRatio >= 10 &&
      volumeLiquidityRatio <= 40
    ) {

      score += 15;

    } else if (
      volumeLiquidityRatio >= 5
    ) {

      score += 12;

    } else if (
      volumeLiquidityRatio >= 2
    ) {

      score += 8;

    } else if (
      volumeLiquidityRatio > 0
    ) {

      score += 4;
    }

    // Buy pressure: 15
    if (
      buyPressure >= 60
    ) {

      score += 15;

    } else if (
      buyPressure >= 55
    ) {

      score += 12;

    } else if (
      buyPressure >= 48
    ) {

      score += 9;

    } else if (
      buyPressure >= 40
    ) {

      score += 5;
    }

    // Momentum: 10
    if (
      priceChange24h >= 20 &&
      priceChange24h <= 500
    ) {

      score += 10;

    } else if (
      priceChange24h > 500 &&
      priceChange24h <= 1500
    ) {

      score += 7;

    } else if (
      priceChange24h > 1500
    ) {

      score += 3;

    } else if (
      priceChange24h >= 0
    ) {

      score += 6;

    } else if (
      priceChange24h >= -20
    ) {

      score += 3;
    }

    // Top holder: 10
    if (
      top1Percentage <= 10
    ) {

      score += 10;

    } else if (
      top1Percentage <= 20
    ) {

      score += 8;

    } else if (
      top1Percentage <= 30
    ) {

      score += 5;
    }

    // Top 5: 10
    if (
      top5Percentage <= 30
    ) {

      score += 10;

    } else if (
      top5Percentage <= 50
    ) {

      score += 7;

    } else if (
      top5Percentage <= 65
    ) {

      score += 3;
    }

    // Holder distribution: 10
    if (
      uniqueOwners >= 100
    ) {

      score += 10;

    } else if (
      uniqueOwners >= 50
    ) {

      score += 8;

    } else if (
      uniqueOwners >= 20
    ) {

      score += 5;

    } else {

      score += 2;
    }

    // Trading activity: 10
    if (
      totalTrades >= 2000
    ) {

      score += 10;

    } else if (
      totalTrades >= 1000
    ) {

      score += 8;

    } else if (
      totalTrades >= 300
    ) {

      score += 5;

    } else if (
      totalTrades > 0
    ) {

      score += 2;
    }

    // Creator penalty
    if (
      devHoldingPercentage > 30
    ) {

      score -= 15;

    } else if (
      devHoldingPercentage > 20
    ) {

      score -= 10;

    } else if (
      devHoldingPercentage > 10
    ) {

      score -= 5;
    }

    // First buyer concentration penalty
    if (
      firstBuyerPercentage > 30
    ) {

      score -= 10;

    } else if (
      firstBuyerPercentage > 15
    ) {

      score -= 5;
    }

    // Active authorities penalty
    if (mintAuthority) {
      score -= 5;
    }

    if (freezeAuthority) {
      score -= 5;
    }

    score =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(score)
        )
      );

    // ==================================================
    // VERDICT
    // ==================================================

    let verdict;

    if (
      score >= 75
    ) {

      verdict =
        "🟢 BUY / STRONG WATCH";

    } else if (
      score >= 55
    ) {

      verdict =
        "🟡 WATCH";

    } else if (
      score >= 35
    ) {

      verdict =
        "🟠 HIGH RISK";

    } else {

      verdict =
        "🔴 AVOID";
    }

    // ==================================================
    // ANALYSIS
    // ==================================================

    const analysis = [];

    if (
      liquidity >= 100000
    ) {

      analysis.push(
        "Strong liquidity"
      );

    } else if (
      liquidity >= 50000
    ) {

      analysis.push(
        "Good liquidity"
      );

    } else if (
      liquidity >= 20000
    ) {

      analysis.push(
        "Acceptable liquidity"
      );

    } else {

      analysis.push(
        "⚠️ Liquidity is limited"
      );
    }

    if (
      volumeLiquidityRatio >= 10 &&
      volumeLiquidityRatio <= 40
    ) {

      analysis.push(
        "Very strong volume relative to liquidity"
      );

    } else if (
      volumeLiquidityRatio >= 5
    ) {

      analysis.push(
        "Strong volume"
      );

    } else if (
      volumeLiquidityRatio >= 2
    ) {

      analysis.push(
        "Healthy volume"
      );

    } else {

      analysis.push(
        "⚠️ Low volume relative to liquidity"
      );
    }

    if (
      buyPressure >= 60
    ) {

      analysis.push(
        "Strong buying pressure"
      );

    } else if (
      buyPressure >= 55
    ) {

      analysis.push(
        "Positive buying pressure"
      );

    } else if (
      buyPressure >= 48
    ) {

      analysis.push(
        "Buy/sell pressure is relatively balanced"
      );

    } else {

      analysis.push(
        "⚠️ Selling pressure is stronger"
      );
    }

    if (
      top1Percentage <= 10
    ) {

      analysis.push(
        "Healthy top holder concentration"
      );

    } else if (
      top1Percentage <= 20
    ) {

      analysis.push(
        "Moderate top holder concentration"
      );

    } else {

      analysis.push(
        "⚠️ Elevated top holder concentration"
      );
    }

    if (
      top5Percentage <= 30
    ) {

      analysis.push(
        "Healthy top 5 concentration"
      );

    } else if (
      top5Percentage <= 50
    ) {

      analysis.push(
        "Moderate top 5 concentration"
      );

    } else {

      analysis.push(
        "⚠️ High top 5 concentration"
      );
    }

    if (
      uniqueOwners >= 100
    ) {

      analysis.push(
        "Strong holder distribution"
      );

    } else if (
      uniqueOwners >= 50
    ) {

      analysis.push(
        "Good holder distribution"
      );

    } else {

      analysis.push(
        "⚠️ Limited holder distribution data"
      );
    }

    if (
      creatorAddress
    ) {

      analysis.push(
        developerStatus
      );
    }

    if (
      firstBuyers.length > 0
    ) {

      analysis.push(
        `${firstBuyers.length} early buyer wallets detected`
      );

    } else {

      analysis.push(
        "⚠️ First buyer data could not be confidently detected"
      );
    }

    if (
      mintAuthority
    ) {

      analysis.push(
        "⚠️ Mint authority remains active"
      );
    }

    if (
      freezeAuthority
    ) {

      analysis.push(
        "⚠️ Freeze authority remains active"
      );
    }

    // ==================================================
    // DATA QUALITY
    // ==================================================

    const dataQuality = {

      dexScreener:
        Boolean(pair),

      helius:
        Boolean(
          supplyResult
        ),

      enhancedTransactions:
        enhancedTransactions.length,

      firstBuyersDetected:
        firstBuyers.length,

      creatorDetected:
        Boolean(
          creatorAddress
        ),

      holderAccounts:
        holders.length,

      holderTokenAccountsScanned:
        largestAccounts.length,

      holderOwnersResolved:
        ownerAccounts.filter(
          account =>
            Boolean(
              account
            )
        ).length,

      holderDistributionAvailable:
        holders.length > 0,

      source:
        holders.length > 0
          ? "Helius RPC"
          : "Helius RPC returned no resolved holder owners",

      note:
        "Holder distribution currently represents the largest token accounts returned by Solana RPC, with their token-account owners resolved through getMultipleAccounts."
    };

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({

      success: true,

      scannedAt,

      scannedAtISO:
        new Date(
          scannedAt
        ).toISOString(),

      token: {

        address:
          token,

        name:
          pair?.baseToken
            ?.name || null,

        symbol:
          pair?.baseToken
            ?.symbol || null
      },

      scanner: {

        score,

        verdict,

        analysis,

        redFlags:
          riskFlags,

        positives
      },

      market: {

        priceUsd,

        marketCap,

        fdv,

        liquidityUsd:
          liquidity,

        volume24h,

        volume6h,

        volume1h,

        priceChange24h,

        priceChange1h,

        volumeLiquidityRatio:
          Number(
            volumeLiquidityRatio
              .toFixed(2)
          ),

        pairAgeMinutes:
          pairAgeMinutes !== null
            ? Number(
                pairAgeMinutes
                  .toFixed(2)
              )
            : null,

        pairAgeHours:
          pairAgeHours !== null
            ? Number(
                pairAgeHours
                  .toFixed(2)
              )
            : null,

        dataSource:
          "DexScreener",

        pairAddress:
          pair?.pairAddress ||
          null,

        dexId:
          pair?.dexId ||
          null,

        url:
          pair?.url ||
          null
      },

      trading: {

        buys1h,

        sells1h,

        totalTrades,

        buyPressure,

        buys5m,

        sells5m,

        totalTrades5m,

        buyPressure5m
      },

      holders: {

        supply,

        decimals,

        top1Percentage:
          Number(
            top1Percentage
              .toFixed(2)
          ),

        top3Percentage:
          Number(
            top3Percentage
              .toFixed(2)
          ),

        top5Percentage:
          Number(
            top5Percentage
              .toFixed(2)
          ),

        top10Percentage:
          Number(
            top10Percentage
              .toFixed(2)
          ),

        top20Percentage:
          Number(
            top20Percentage
              .toFixed(2)
          ),

        whale5,

        uniqueOwners,

        mintAuthority,

        freezeAuthority,

        accounts:
          topWallets
      },

      developer: {

        address:
          creatorAddress,

        status:
          developerStatus,

        currentHolding:
          devHolding,

        holdingPercentage:
          Number(
            devHoldingPercentage
              .toFixed(2)
          ),

        transactionSignature:
          creatorTransaction
            ?.signature ||
          creatorTransaction
            ?.transactionSignature ||
          null,

        detectedFrom:
          creatorAddress
            ? "Helius transaction history"
            : null
      },

      firstBuyers: {

        count:
          firstBuyers.length,

        totalAmount:
          firstBuyerTotal,

        percentageOfSupply:
          firstBuyerPercentage,

        accounts:
          firstBuyers
      },

      dataQuality

    });

  } catch (error) {

    return res.status(500).json({

      success: false,

      error:
        String(
          error?.message ||
          error
        ),

      scannedAt:
        Date.now()
    });
  }
}
