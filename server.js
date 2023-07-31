// npm i dotenv
require("dotenv").config();

// npm init -y
// npm i express
const express = require("express");
const app = express();
app.use(express.json());

// npm i axios
const axios = require("axios");

// npm i ioredis
// redis-server
// redis-cli
const Redis = require("ioredis");
const { json } = require("body-parser");
const redisClient = new Redis();

app.post("/bidresponse", async (req, res) => {
  try {
    const { ticker, id, price } = req.body;
    const cnt = await redisClient.incr(`${ticker}-cnt`);
    await redisClient.zadd(
      `${ticker}-bid`,
      price * 10000 - cnt,
      JSON.stringify({ id, price, order: cnt })
    );

    redisClient
      .multi()
      .zrange(`${ticker}-asks`, 0, 0, "WITHSCORES")
      .zrevrange(`${ticker}-bids`, 0, 0, "WITHSCORES")
      .exec(async (err, results) => {
        const lowestAsk = results[0];
        const highestBid = results[1];

        if (highestBid?.length > 0 && lowestAsk?.length > 0) {
          const highestBidPrice = parseFloat(highestBid[0]);
          const lowestAskPrice = parseFloat(lowestAsk[0]);

          if (highestBidPrice > lowestAskPrice) {
            try {
              redisClient
                .multi()
                .zrem(`${ticker}-bids`, highestBid[0])
                .zrem(`${ticker}-asks`, lowestAsk[0])
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
          }
        }
      });
  } catch (error) {
    console.error("Error in /bidresponse endpoint:", error);
    return res.status(500).json({ error: "Error in /bidresponse endpoint." });
  }
});

// Get Ask Responses
app.post("/askresponse/:ticker", async (req, res) => {});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server Listening on PORT ${PORT}`);
});
