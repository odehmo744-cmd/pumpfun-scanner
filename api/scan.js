export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return Response.json(
        { error: "Missing token address" },
        { status: 400 }
      );
    }

    // Get Solana token data from DEX Screener
    const response = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(token)}`
    );

    if (!response.ok) {
      return Response.json(
        { error: "DEX Screener request failed" },
        { status: response.status }
      );
    }

    const pairs = await response.json();

    if (!pairs || pairs.length === 0) {
      return Response.json(
        { error: "Token not found on DEX Screener" },
        { status: 404 }
      );
    }

    // Select the pair with the highest liquidity
    const pair = [...pairs].sort(
      (a, b) =>
        (b.liquidity?.usd || 0) -
        (a.liquidity?.usd || 0)
    )[0];

    const txns = pair.txns || {};
    const volume = pair.volume || {};

    return Response.json({
      success: true,

      token: {
        address: pair.baseToken?.address,
        name: pair.baseToken?.name,
        symbol: pair.baseToken?.symbol
      },

      market: {
        priceUsd: pair.priceUsd,
        marketCap: pair.marketCap,
        fdv: pair.fdv,
        liquidityUsd: pair.liquidity?.usd,
        pairCreatedAt: pair.pairCreatedAt
      },

      trading: {
        volume5m: volume.m5 || 0,
        volume1h: volume.h1 || 0,
        volume6h: volume.h6 || 0,
        volume24h: volume.h24 || 0,

        buys5m: txns.m5?.buys || 0,
        sells5m: txns.m5?.sells || 0,

        buys1h: txns.h1?.buys || 0,
        sells1h: txns.h1?.sells || 0
      },

      dex: {
        name: pair.dexId,
        url: pair.url
      }
    });

  } catch (error) {
    return Response.json(
      {
        error: "Internal server error",
        message: error.message
      },
      { status: 500 }
    );
  }
}
