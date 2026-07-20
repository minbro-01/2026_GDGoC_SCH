import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";
import { signToken } from "../src/middleware/auth.js";

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("scenario API requires auth and does not serialize future outcomes", async () => {
  process.env.JWT_SECRET = "judgment-route-test-secret";
  await withServer(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/judgment/scenarios`);
    assert.equal(unauthorized.status, 401);

    const token = signToken({ id: 42, email: "learner@example.com" });
    const response = await fetch(`${baseUrl}/api/judgment/scenarios/AAPL-covid2020`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.scenario.id, "AAPL-covid2020");
    assert.equal("afterReturns" in body.scenario, false);
    assert.equal(JSON.stringify(body).includes("afterReturns"), false);
  });
});
