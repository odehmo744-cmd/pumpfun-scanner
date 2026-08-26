export default async function handler(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return Response.json(
      { error: "Missing token address" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(token)}`,
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );

    const data = await response.json();

    return Response.json({
      success: true,
      data: data
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
