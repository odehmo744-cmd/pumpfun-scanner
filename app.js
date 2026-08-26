// =========================
// LOGIN
// =========================

async function login() {
  const passwordInput =
    document.getElementById(
      "passwordInput"
    );

  const password =
    passwordInput
      .value
      .trim();

  const loginResult =
    document.getElementById(
      "loginResult"
    );

  if (!password) {
    loginResult.innerHTML = `
      <div class="danger">
        Please enter your password.
      </div>
    `;
    return;
  }

  loginResult.innerHTML = `
    <div class="small">
      Checking password...
    </div>
  `;

  try {
    const response =
      await fetch(
        "/api/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              password
            })
        }
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        "Login failed"
      );
    }

    // Simple browser session
    sessionStorage.setItem(
      "scannerAuthenticated",
      "true"
    );

    passwordInput.value = "";

    loginResult.innerHTML = "";

    showScanner();

  } catch (error) {

    loginResult.innerHTML = `
      <div class="danger">
        ❌ ${escapeHtml(
          error.message
        )}
      </div>
    `;

  }
}


// =========================
// SHOW SCANNER
// =========================

function showScanner() {

  const loginBox =
    document.getElementById(
      "loginBox"
    );

  const scannerBox =
    document.getElementById(
      "scannerBox"
    );

  if (loginBox) {
    loginBox.style.display =
      "none";
  }

  if (scannerBox) {
    scannerBox.style.display =
      "block";
  }

}


// =========================
// LOGIN CHECK
// =========================

function checkLogin() {

  const authenticated =
    sessionStorage.getItem(
      "scannerAuthenticated"
    );

  if (
    authenticated === "true"
  ) {
    showScanner();
  }

}


// =========================
// TOKEN EXTRACTION
// =========================

function extractTokenAddress(input) {

  input =
    input.trim();

  if (
    !input.includes("http")
  ) {
    return input;
  }

  // Pump.fun link
  const pumpMatch =
    input.match(
      /pump\.fun\/(?:coin\/)?([^/?#]+)/i
    );

  if (pumpMatch) {
    return pumpMatch[1];
  }

  // Generic URL fallback:
  // Try to extract the last path section.
  try {

    const url =
      new URL(input);

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    if (
      parts.length > 0
    ) {
      return parts[
        parts.length - 1
      ];
    }

  } catch {
    // Not a valid URL
  }

  return input;

}


// =========================
// CLEAR SCANNER
// =========================

function clearScanner() {

  const tokenInput =
    document.getElementById(
      "tokenInput"
    );

  const result =
    document.getElementById(
      "result"
    );

  // Clear token input
  if (tokenInput) {
    tokenInput.value = "";
  }

  // Clear results
  if (result) {
    result.innerHTML = "";
  }

  // Put cursor back in input
  if (tokenInput) {
    tokenInput.focus();
  }

}


// =========================
// SCAN
// =========================

async function scanToken() {

  const tokenInput =
    document.getElementById(
      "tokenInput"
    );

  const result =
    document.getElementById(
      "result"
    );

  const scanButton =
    document.querySelector(
      ".scan-btn"
    );

  if (
    !tokenInput ||
    !result
  ) {
    return;
  }

  const input =
    tokenInput
      .value
      .trim();

  if (!input) {

    result.innerHTML = `
      <div class="card result">
        <div class="danger">
          Please enter a Pump.fun link
          or Contract Address.
        </div>
      </div>
    `;

    tokenInput.focus();

    return;
  }

  const token =
    extractTokenAddress(
      input
    );

  // Prevent multiple scans
  if (scanButton) {

    scanButton.disabled =
      true;

    scanButton.innerHTML =
      "⏳ Scanning...";

  }

  result.innerHTML = `
    <div class="card result">

      <div class="small">
        SCANNING...
      </div>

      <h2>
        🔎 Analyzing Token
      </h2>

      <p>
        Fetching market data,
        trading activity and
        holder information...
      </p>

    </div>
  `;

  try {

    const response =
      await fetch(
        "/api/scan?token=" +
        encodeURIComponent(token)
      );

    let data;

    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        "Invalid response from server"
      );

    }

    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data.error ||
        "Scanner error"
      );

    }

    displayScanResult(
      data
    );

  } catch (error) {

    result.innerHTML = `
      <div class="card result">

        <div class="danger">

          ❌ ${escapeHtml(
            error.message ||
            "Scanner error"
          )}

        </div>

      </div>
    `;

  } finally {

    if (scanButton) {

      scanButton.disabled =
        false;

      scanButton.innerHTML =
        "🔍 Scan Token";

    }

  }

}


// =========================
// DISPLAY RESULT
// =========================

function displayScanResult(data) {

  const result =
    document.getElementById(
      "result"
    );

  if (!result) {
    return;
  }

  const market =
    data.market || {};

  const trading =
    data.trading || {};

  const holders =
    data.holders || {};

  const scanner =
    data.scanner || {};

  const token =
    data.token || {};

  const verdict =
    scanner.verdict ||
    "UNKNOWN";

  const score =
    scanner.score ?? 0;

  const tokenName =
    escapeHtml(
      token.name ||
      "Unknown"
    );

  const tokenSymbol =
    escapeHtml(
      token.symbol ||
      "-"
    );

  const tokenAddress =
    escapeHtml(
      token.address ||
      "-"
    );

  result.innerHTML = `

    <div class="card result">

      <!-- TOKEN -->

      <div class="small">
        TOKEN
      </div>

      <h2>
        ${tokenName}
        (${tokenSymbol})
      </h2>


      <hr>


      <!-- SCANNER RESULT -->

      <div class="small">
        SCANNER RESULT
      </div>

      <h2>
        ${escapeHtml(verdict)}
      </h2>

      <p>
        <strong>Score:</strong>
        ${score}/100
      </p>


      <hr>


      <!-- MARKET -->

      <div class="small">
        MARKET
      </div>

      <p>
        <strong>Price:</strong>
        $${formatPrice(
          market.priceUsd
        )}
      </p>

      <p>
        <strong>Market Cap:</strong>
        $${formatNumber(
          market.marketCap
        )}
      </p>

      <p>
        <strong>Liquidity:</strong>
        $${formatNumber(
          market.liquidityUsd
        )}
      </p>

      <p>
        <strong>24H Volume:</strong>
        $${formatNumber(
          market.volume24h
        )}
      </p>

      <p>
        <strong>24H Change:</strong>
        ${formatPercent(
          market.priceChange24h
        )}
      </p>

      ${
        market.dataSource
          ? `
            <p class="small">
              Data:
              ${escapeHtml(
                market.dataSource
              )}
            </p>
          `
          : ""
      }


      <hr>


      <!-- TRADING -->

      <div class="small">
        TRADING
      </div>

      <p>
        <strong>1H Buys:</strong>
        ${formatInteger(
          trading.buys1h
        )}
      </p>

      <p>
        <strong>1H Sells:</strong>
        ${formatInteger(
          trading.sells1h
        )}
      </p>

      <p>
        <strong>Total Trades:</strong>
        ${formatInteger(
          trading.totalTrades
        )}
      </p>

      <p>
        <strong>Buy Pressure:</strong>
        ${formatPercent(
          trading.buyPressure
        )}
      </p>


      <hr>


      <!-- HOLDERS -->

      <div class="small">
        HOLDERS
      </div>

      <p>
        <strong>Unique Holders:</strong>
        ${formatInteger(
          holders.uniqueOwners
        )}
      </p>

      <p>
        <strong>Top 1:</strong>
        ${formatPercent(
          holders.top1Percentage
        )}
      </p>

      <p>
        <strong>Top 5:</strong>
        ${formatPercent(
          holders.top5Percentage
        )}
      </p>

      <p>
        <strong>Top 10:</strong>
        ${formatPercent(
          holders.top10Percentage
        )}
      </p>


      <hr>


      <!-- ANALYSIS -->

      <div class="small">
        ANALYSIS
      </div>

      ${renderAnalysis(
        scanner.analysis
      )}


      <hr>


      <!-- CONTRACT -->

      <div class="small">
        CONTRACT ADDRESS
      </div>

      <p
        style="
          word-break:
          break-all;
        "
      >
        ${tokenAddress}
      </p>

    </div>

  `;

}


// =========================
// RENDER ANALYSIS
// =========================

function renderAnalysis(analysis) {

  if (
    !Array.isArray(analysis) ||
    analysis.length === 0
  ) {

    return `
      <p>
        No analysis available.
      </p>
    `;

  }

  return analysis
    .map(
      item => `
        <p>
          ${escapeHtml(item)}
        </p>
      `
    )
    .join("");

}


// =========================
// FORMAT NUMBER
// =========================

function formatNumber(value) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "0";
  }

  return number.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2
    }
  );

}


// =========================
// FORMAT INTEGER
// =========================

function formatInteger(value) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "0";
  }

  return Math.round(
    number
  ).toLocaleString(
    "en-US"
  );

}


// =========================
// FORMAT PERCENT
// =========================

function formatPercent(value) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "0%";
  }

  return (
    number.toFixed(2)
    .replace(
      /\.00$/,
      ""
    )
    + "%"
  );

}


// =========================
// FORMAT PRICE
// =========================

function formatPrice(value) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return "0";
  }

  if (
    number < 0.00000001
  ) {
    return number.toFixed(14);
  }

  if (
    number < 0.000001
  ) {
    return number.toFixed(12);
  }

  if (
    number < 0.001
  ) {
    return number.toFixed(9);
  }

  if (
    number < 1
  ) {
    return number.toFixed(6);
  }

  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }
  );

}


// =========================
// ESCAPE HTML
// =========================

function escapeHtml(value) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent =
    String(
      value ?? ""
    );

  return div.innerHTML;

}


// =========================
// ENTER KEY SUPPORT
// =========================

function setupKeyboardEvents() {

  const tokenInput =
    document.getElementById(
      "tokenInput"
    );

  const passwordInput =
    document.getElementById(
      "passwordInput"
    );

  // Enter = Login
  if (passwordInput) {

    passwordInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter"
        ) {

          event.preventDefault();

          login();

        }

      }
    );

  }

  // Enter = Scan
  if (tokenInput) {

    tokenInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter"
        ) {

          event.preventDefault();

          scanToken();

        }

      }
    );

  }

}


// =========================
// PAGE LOAD
// =========================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    checkLogin();

    setupKeyboardEvents();

  }
);
