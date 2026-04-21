const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 100,
    messages: [{ role: "user", content: "say hi" }],
  }),
});
console.log("status:", res.status);
console.log("body:", await res.text());
