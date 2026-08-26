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
        "/api/login?_t=" +
        Date.now(),
        {
          method: "POST",
          cache: "no-store",

          headers: {
            "Content-Type":
              "application/json",

            "Cache-Control":
              "no-cache, no-store, max-age=0"
          },

          body: JSON.stringify({
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
    loginBox.style.display = "none";
  }

  if (scannerBox) {
    scannerBox.style.display = "block";
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

  if (
    !input.includes("http://") &&
    !input.includes("https://")
  ) {
    return input;
  }

  const pumpMatch =
    input.match(
      /pump\.fun\/(?:coin\/)?([^/?#]+)/i
    );

  if (pumpMatch) {
    return pumpMatch[1];
  }

  try {
    const url =
      new URL(input);

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    if (parts.length > 0) {
      return parts[
        parts.length - 1
      ];
    }
  } catch {}

  return input;
}


// =========================
// PASTE
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
    const text =
      await navigator.clipboard.readText();

    if (!text) {
      tokenInput.focus();
      return;
    }

    tokenInput.value =
      text.trim();

    tokenInput.focus();

  } catch {
    alert(
      "Unable to access clipboard. Please paste manually."
    );

    tokenInput.focus();
  }
}


// =========================
// CLEAR
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

  if (tokenInput) {
    tokenInput.value = "";
  }

  if (result) {
    result.innerHTML = "";
  }

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

  if (!tokenInput || !result) {
    return;
  }

  const input =
    tokenInput.value.trim();

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
    extractTokenAddress(input);

  if (!token) {
    result.innerHTML = `
      <div class="card result">
        <div class="danger">
          Invalid token address.
        </div>
      </div>
    `;

    return;
  }

  if (scanButton) {
    scanButton.disabled = true;
    scanButton.innerHTML =
      "⏳ Scanning LIVE...";
  }

  result.innerHTML = `
    <div class="card result">

      <div class="small">
        LIVE SCAN
      </div>

      <h2>
        🔎 Analyzing Token
      </h2>

      <p>
        Fetching fresh market,
        trading and holder data...
      </p>

    </div>
  `;

  try {
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

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        "Scanner error"
      );
    }

    displayScanResult(data);

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
      scanButton.disabled = false;

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

  const score =
    Number(
      scanner.score ?? 0
    );

  const verdict =
    scanner.verdict ||
    "UNKNOWN";

  const riskLevel =
    scanner.riskLevel ||
    "UNKNOWN";

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

  let updatedAt =
    new Date();

  if (data.scannedAt) {
    updatedAt =
      new Date(
        data.scannedAt
      );
  }

  const updatedTime =
    updatedAt.toLocaleTimeString(
      "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    );

  const updatedDate =
    updatedAt.toLocaleDateString(
      "en-US"
    );

  const redFlags =
    Array.isArray(
      scanner.redFlags
    )
      ? scanner.redFlags
      : [];

  const analysis =
    Array.isArray(
      scanner.analysis
    )
      ? scanner.analysis
      : [];

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

      <p class="small">
        🟢 LIVE DATA
        <br>
        Updated:
        ${updatedDate}
        ${updatedTime}
      </p>


      <hr>


      <!-- SCORE -->

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

      <p>
        <strong>Risk:</strong>
        ${escapeHtml(
          riskLevel
        )}
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
        <strong>5M Volume:</strong>
        $${formatNumber(
          market.volume5m
        )}
      </p>

      <p>
        <strong>1H Volume:</strong>
        $${formatNumber(
          market.volume1h
        )}
      </p>

      <p>
        <strong>24H Volume:</strong>
        $${formatNumber(
          market.volume24h
        )}
      </p>

      <p>
        <strong>5M Change:</strong>
        ${formatPercent(
          market.priceChange5m
        )}
      </p>

      <p>
        <strong>1H Change:</strong>
        ${formatPercent(
          market.priceChange1h
        )}
      </p>

      <p>
        <strong>24H Change:</strong>
        ${formatPercent(
          market.priceChange24h
        )}
      </p>

      <p>
        <strong>Volume/Liquidity:</strong>
        ${formatNumber(
          market.volumeLiquidityRatio
        )}x
      </p>

      ${
        market.pairAgeMinutes !==
        null &&
        market.pairAgeMinutes !==
        undefined
          ? `
            <p>
              <strong>Pair Age:</strong>
              ${formatAge(
                market.pairAgeMinutes
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
        <strong>5M Buys:</strong>
        ${formatInteger(
          trading.buys5m
        )}
      </p>

      <p>
        <strong>5M Sells:</strong>
        ${formatInteger(
          trading.sells5m
        )}
      </p>

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
        <strong>24H Buys:</strong>
        ${formatInteger(
          trading.buys24h
        )}
      </p>

      <p>
        <strong>24H Sells:</strong>
        ${formatInteger(
          trading.sells24h
        )}
      </p>

      <p>
        <strong>1H Buy Pressure:</strong>
        ${formatPercent(
          trading.buyPressure
        )}
      </p>

      <p>
        <strong>5M Buy Pressure:</strong>
        ${formatPercent(
          trading.buyPressure5m
        )}
      </p>


      <hr>


      <!-- HOLDERS -->

      <div class="small">
        HOLDERS
      </div>

      <p>
        <strong>Tracked Owners:</strong>
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


      <!-- RED FLAGS -->

      <div class="small">
        🚨 RED FLAGS
      </div>

      ${
        redFlags.length > 0
          ? renderRedFlags(
              redFlags
            )
          : `
            <p>
              🟢 No major red flags detected.
            </p>
          `
      }


      <hr>


      <!-- ANALYSIS -->

      <div class="small">
        ANALYSIS
      </div>

      ${renderAnalysis(
        analysis
      )}


      <hr>


      <!-- CONTRACT -->

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
// RED FLAGS
// =========================

function renderRedFlags(
  flags
) {
  return flags
    .map(
      flag => `
        <p class="danger">
          🚨 ${escapeHtml(
            flag
          )}
        </p>
      `
    )
    .join("");
}


// =========================
// ANALYSIS
// =========================

function renderAnalysis(
  analysis
) {
  if (
    !Array.isArray(
      analysis
    ) ||
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
          ${escapeHtml(
            item
          )}
        </p>
      `
    )
    .join("");
}


// =========================
// FORMAT AGE
// =========================

function formatAge(
  minutes
) {
  const number =
    Number(minutes);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return "-";
  }

  if (number < 60) {
    return (
      number.toFixed(1) +
      " minutes"
    );
  }

  const hours =
    number / 60;

  if (hours < 24) {
    return (
      hours.toFixed(1) +
      " hours"
    );
  }

  return (
    (hours / 24).toFixed(1) +
    " days"
  );
}


// =========================
// NUMBER
// =========================

function formatNumber(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
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
// INTEGER
// =========================

function formatInteger(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
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
// PERCENT
// =========================

function formatPercent(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return "0%";
  }

  return (
    number
      .toFixed(2)
      .replace(
        /\.00$/,
        ""
      ) +
    "%"
  );
}


// =========================
// PRICE
// =========================

function formatPrice(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    ) ||
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
// KEYBOARD
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

  if (passwordInput) {
    passwordInput.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Enter"
        ) {
          event.preventDefault();
          login();
        }
      }
    );
  }

  if (tokenInput) {
    tokenInput.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Enter"
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
