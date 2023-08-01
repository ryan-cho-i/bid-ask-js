require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());

const axios = require("axios");
const Redis = require("ioredis");
const { json } = require("body-parser");
const redisClient = new Redis();

async function handleResponse(req, res, orderType) {
  try {
    const { ticker, id, price } = req.body;
    const cnt = await redisClient.incr(`${ticker}-${orderType}-cnt`);
    const orderScore =
      orderType === "bid" ? price * 10000 - cnt : price * 10000 + cnt;

    await redisClient.zadd(
      `${ticker}-${orderType}`,
      orderScore,
      JSON.stringify({ id: id, price: price, order: cnt })
    );

    redisClient
      .multi()
      .zrevrange(`${ticker}-bid`, 0, -1, "WITHSCORES")
      .zrange(`${ticker}-ask`, 0, -1, "WITHSCORES")
      .exec(async (err, results) => {
        if (err) {
          console.error("Redis Error:", err);
          return;
        }

        console.log(results[0]);
        console.log(results[1]);

        // Check that both bid and ask sets have at least one element
        if (results[0][1].length == 0 || results[1][1].length == 0) {
          return res.json({ success: "good" });
        }

        const highestBid = JSON.parse(results[0][1][0]);
        const lowestAsk = JSON.parse(results[1][1][0]);

        const highestBidPrice = parseFloat(highestBid.price);
        const lowestAskPrice = parseFloat(lowestAsk.price);

        if (highestBidPrice < lowestAskPrice) {
          return res.json({ success: "good" });
        }

        try {
          redisClient
            .multi()
            .zrem(`${ticker}-bid`, JSON.stringify(highestBid))
            .zrem(`${ticker}-ask`, JSON.stringify(lowestAsk))
            .exec((err) => {
              if (err) {
                console.error("Error executing transaction:", err);
                return res
                  .status(500)
                  .json({ error: "Error executing transaction." });
              }
              return res.json({
                highestBid: highestBidPrice,
                lowestAsk: lowestAskPrice,
              });
            });
        } catch (error) {
          console.error("Error removing highest bid or lowest ask:", error);
          return res
            .status(500)
            .json({ error: "Error removing highest bid or lowest ask." });
        }
      });
  } catch (error) {
    console.error(`Error in /${orderType}response endpoint:`, error);
    return res
      .status(500)
      .json({ error: `Error in /${orderType}response endpoint.` });
  }
}

app.post("/bidresponse", async (req, res) => {
  handleResponse(req, res, "bid");
});

app.post("/askresponse", async (req, res) => {
  handleResponse(req, res, "ask");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server Listening on PORT ${PORT}`);
  await redisClient.flushdb();
  console.log("Redis database flushed successfully.");
});
