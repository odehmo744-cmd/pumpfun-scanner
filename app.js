function extractTokenAddress(input) {
  input = input.trim();

  // Direct Solana contract address
  if (!input.includes("http")) {
    return input;
  }

  // Pump.fun /coin/ADDRESS
  const match = input.match(/pump\.fun\/(?:coin\/)?([^/?]+)/i);

  if (match) {
    return match[1];
  }

  return input;
}

async function scanToken() {
  const input = document.getElementById("tokenInput").value.trim();
  const result = document.getElementById("result");

  if (!input) {
    result.innerHTML = `
      <div class="card">
        <div class="danger">
          Please enter a Pump.fun link or Contract Address.
        </div>
      </div>
    `;
    return;
  }

  const token = extractTokenAddress(input);

  result.innerHTML = `
    <div class="card">
      <div class="small">Scanning...</div>
      <h2>🔎 Analyzing token</h2>
      <p>Please wait...</p>
    </div>
  `;

  try {
    const response = await fetch(
      `/api/scan?token=${encodeURIComponent(token)}`
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Scanner error");
    }

    const pair = data.pairs?.[0];

    if (!pair) {
      throw new Error("No market data found.");
    }

    const buys = pair.txns?.h1?.buys || 0;
    const sells = pair.txns?.h1?.sells || 0;
    const volume = pair.volume?.h1 || 0;
    const marketCap = pair.marketCap || pair.fdv || 0;
    const priceChange = pair.priceChange?.h1 || 0;

    result.innerHTML = `
      <div class="card result">

        <div class="small">TOKEN</div>
        <h2>${pair.baseToken?.name || "Unknown"} 
          (${pair.baseToken?.symbol || "-"})</h2>

        <p>
          <strong>Price:</strong>
          $${Number(pair.priceUsd || 0).toFixed(10)}
        </p>

        <p>
          <strong>Market Cap:</strong>
          $${Number(marketCap).toLocaleString()}
        </p>

        <p>
          <strong>1H Volume:</strong>
          $${Number(volume).toLocaleString()}
        </p>

        <p>
          <strong>1H Buys:</strong> ${buys}
        </p>

        <p>
          <strong>1H Sells:</strong> ${sells}
        </p>

        <p>
          <strong>1H Price Change:</strong>
          ${priceChange}%
        </p>

        <hr>

        <div class="small">
          Contract Address
        </div>

        <p style="word-break:break-all;">
          ${pair.baseToken?.address || token}
        </p>

      </div>
    `;

  } catch (error) {

    result.innerHTML = `
      <div class="card">
        <div class="danger">
          ❌ ${error.message}
        </div>
      </div>
    `;
  }
}
