function scanToken() {
  const input = document.getElementById("tokenInput").value.trim();
  const result = document.getElementById("result");

  if (!input) {
    result.innerHTML = `
      <div class="card">
        <div class="danger">Please enter a Pump.fun link or Contract Address.</div>
      </div>
    `;
    return;
  }

  result.innerHTML = `
    <div class="card">
      <div class="small">Status</div>
      <h2>Scanner Ready</h2>
      <p>Token input received successfully.</p>
      <p class="small">${input}</p>
    </div>
  `;
}
