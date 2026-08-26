// =========================
// LOGIN
// =========================

async function login() {

  const passwordInput =
    document.getElementById("passwordInput");

  const loginResult =
    document.getElementById("loginResult");

  if (!passwordInput || !loginResult) {
    return;
  }

  const password =
    passwordInput.value.trim();

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

          cache: "no-store",

          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          },

          body: JSON.stringify({
            password
          })
        }
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
        "Login failed"
      );

    }

    // =========================
    // SIMPLE BROWSER SESSION
    // =========================

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
          error.message ||
          "Login failed"
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
    document.getElementById("loginBox");

  const scannerBox =
    document.getElementById("scannerBox");

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
    String(input || "").trim();

  if (!input) {
    return "";
  }

  // Already a contract address
  if (
    !input.includes("http://") &&
    !input.includes("https://")
  ) {

    return input;

  }

  // =========================
  // PUMP.FUN
  // =========================

  const pumpMatch =
    input.match(
      /pump\.fun\/(?:coin\/)?([^/?#]+)/i
    );

  if (pumpMatch) {

    return pumpMatch[1];

  }

  // =========================
  // GENERIC URL FALLBACK
  // =========================

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
// PASTE TOKEN
// =========================

async function pasteToken() {

  const tokenInput =
    document.getElementById(
      "tokenInput"
    );

  if (!tokenInput) {
    return;
  }

  try {

    // =========================
    // MODERN CLIPBOARD API
    // =========================

    const text =
      await navigator.clipboard.readText();

    if (!text) {

      tokenInput.focus();

      return;

    }

    tokenInput.value =
      text.trim();

    tokenInput.focus();

  } catch (error) {

    alert(
      "Unable to access clipboard. Please paste manually."
    );

    tokenInput.focus();

  }

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

  // Clear input
  if (tokenInput) {

    tokenInput.value = "";

  }

  // Clear result
  if (result) {

    result.innerHTML = "";

  }

  // Return cursor
  if (tokenInput) {

    tokenInput.focus();

  }

}


// =========================
// SCAN TOKEN
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
    tokenInput.value.trim();

  // =========================
  // EMPTY INPUT
  // =========================

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

  // =========================
  // EXTRACT CONTRACT
  // =========================

  const token =
    extractTokenAddress(
      input
    );

  if (!token) {

    result.innerHTML = `
      <div class="card result">

        <div class="danger">
          Invalid token address.
        </div>

      </div>
    `;

    tokenInput.focus();

    return;

  }

  // =========================
  // DISABLE SCAN BUTTON
  // =========================

  if (scanButton) {

    scanButton.disabled =
      true;

    scanButton.innerHTML =
      "⏳ Scanning...";

  }

  // =========================
  // SHOW LOADING
  // =========================

  result.innerHTML = `
    <div class="card result">

      <div class="small">
        SCANNING...
      </div>

      <h2>
        🔎 Analyzing Token
      </h2>

      <p>
        Fetching LIVE market data,
        trading activity and
        holder information...
      </p>

    </div>
  `;

  try {

    // ==================================================
    // IMPORTANT
    // Every scan gets a unique timestamp.
    //
    // This prevents browser/CDN cache from returning
    // the previous result when scanning the SAME token.
    // ==================================================

    const cacheBuster =
      Date.now();

    const scanUrl =
      "/api/scan?token=" +
      encodeURIComponent(token) +
      "&_t=" +
      cacheBuster;

    const response =
      await fetch(
        scanUrl,
        {
          method: "GET",

          cache: "no-store",

          headers: {
            "Cache-Control":
              "no-cache, no-store, max-age=0",

            "Pragma":
              "no-cache",

            "Expires":
              "0"
          }
        }
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

    // =========================
    // SERVER ERROR
    // =========================

    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data.error ||
        "Scanner error"
      );

    }

    // =========================
    // DISPLAY NEW RESULT
    // =========================

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

    // =========================
    // ENABLE BUTTON AGAIN
    // =========================

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

  // =========================
  // BASIC DATA
  // =========================

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

  // =========================
  // CURRENT TIME
  // =========================

  const updatedAt =
    new Date().toLocaleTimeString(
      "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    );

  // =========================
  // RESULT
  // =========================

  result.innerHTML = `

    <div class="card result">

      <!-- =================================
           TOKEN
      ================================== -->

      <div class="small">
        TOKEN
      </div>

      <h2>
        ${tokenName}
        (${tokenSymbol})
      </h2>

      <p class="small">
        🔄 Updated: ${updatedAt}
      </p>


      <hr>


      <!-- =================================
           SCANNER RESULT
      ================================== -->

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


      <!-- =================================
           MARKET
      ================================== -->

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
        market.volumeLiquidityRatio !==
        undefined
          ? `
            <p>
              <strong>
                Volume/Liquidity:
              </strong>
              ${formatNumber(
                market.volumeLiquidityRatio
              )}x
            </p>
          `
          : ""
      }

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


      <!-- =================================
           TRADING
      ================================== -->

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


      <!-- =================================
           HOLDERS
      ================================== -->

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


      <!-- =================================
           ANALYSIS
      ================================== -->

      <div class="small">
        ANALYSIS
      </div>

      ${renderAnalysis(
        scanner.analysis
      )}


      <hr>


      <!-- =================================
           CONTRACT
      ================================== -->

      <div class="small">
        CONTRACT ADDRESS
      </div>

      <p
        style="
          word-break: break-all;
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

function renderAnalysis(
  analysis
) {

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

function formatNumber(
  value
) {

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

function formatInteger(
  value
) {

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

function formatPercent(
  value
) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {

    return "0%";

  }

  return (
    number
      .toFixed(2)
      .replace(
        /\.00$/,
        ""
      ) + "%"
  );

}


// =========================
// FORMAT PRICE
// =========================

function formatPrice(
  value
) {

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

function escapeHtml(
  value
) {

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

  // =========================
  // ENTER = LOGIN
  // =========================

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

  // =========================
  // ENTER = SCAN
  // =========================

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
