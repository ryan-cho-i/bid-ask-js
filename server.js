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

const findMatch = async (ticker, highestBidPrice, lowestAskPrice) => {
  if (highestBidPrice > lowestAskPrice) {
    const multi = redisClient.multi();

    // Remove the highest bid from the sorted set
    multi.zrem(`${ticker}-bids`, highestBidPrice, (err) => {
      if (err) {
        console.error("Error removing highest bid:", err);
      }
    });

    // Remove the lowest ask from the sorted set
    multi.zrem(`${ticker}-asks`, lowestAskPrice, (err) => {
      if (err) {
        console.error("Error removing lowest ask:", err);
      }
    });

    return "your match!";
  } else {
    return "there is no match";
  }
};

// Get Bid Responses
app.post("/bidresponse", async (req, res) => {
  const { ticker, id, price } = req.body;

  // give them count
  const cnt = await redisClient.incr(`${ticker}-cnt`);

  await redisClient.zadd(
    `${ticker}-bid`,
    price * 10000 - cnt,
    JSON.stringify({ id: id, price: price, order: cnt })
  );

  const multi = redisClient.multi();

  // Retrieve the lowest ask (lowest price) from the sorted set
  multi.zrange(`${ticker}-asks`, 0, 0, "WITHSCORES");

  // Retrieve the highest bid (highest price) from the sorted set
  multi.zrevrange(`${ticker}-bids`, 0, 0, "WITHSCORES");

  multi.exec((err, results) => {
    const lowestAsk = results[0];
    const highestBid = results[1];

    if (
      highestBid &&
      highestBid.length > 0 &&
      lowestAsk &&
      lowestAsk.length > 0
    ) {
      const highestBidPrice = parseFloat(highestBid[0]);
      const lowestAskPrice = parseFloat(lowestAsk[0]);

      if (highestBidPrice > lowestAskPrice) {

        const multi = redisClient.multi();

        // Remove the highest bid from the sorted set
        multi.zrem(`${ticker}-bids`, highestBid[0], (err) => {
          if (err) {
            console.error("Error removing highest bid:", err);
            return res
              .status(500)
              .json({ error: "Error removing highest bid." });
          }})

        // Remove the lowest ask from the sorted set
        multi.zrem(`${ticker}-asks`, lowestAsk[0], (err) => {
        if (err) {
            console.error("Error removing lowest ask:", err);
            return res
            .status(500)
            .json({ error: "Error removing lowest ask." });
        }})

        // Return the removed highest bid and lowest ask as the response
        return res.json({
            highestBid: JSON.parse(highestBidPrice),
            lowestAsk: JSON.parse(lowestAskPrice),
        });
          }};
    }
  });
});

// Get Ask Responses
app.post("/askresponse/:ticker", async (req, res) => {});

// Send Trade Request

async function getBidResponse(url, data) {
  try {
    const response = await axios.get(url, { params: data });

    // Prevent Race Condition using Redis
    const cnt = await redisClient.incr("cnt");

    redisClient
      .multi()
      .zadd(
        "bidResponses",
        response.data.price * 1000 - cnt,
        JSON.stringify({
          id: response.data.id,
          price: response.data.price,
          order: cnt,
        })
      )
      .exec((err, results) => {
        if (err) {
          console.error("Redis Error:", err);
          return;
        }
      });
  } catch (error) {
    console.error("Error making GET request:", error.message);
  }
}

app.post("/bidRequest/:people", async (req, res) => {
  const people = req.params.people;
  redisClient
    .multi()
    .del("bidResponses")
    .set("cnt", 0)
    .exec(async () => {
      const urlList = [];
      for (let i = 0; i < people; i++) {
        urlList.push(`http://localhost:3002/processBid/${i}`);
      }

      try {
        //  Send bid Request Simultaneously
        await Promise.all(urlList.map((url) => getBidResponse(url, {})));

        const ranking = await redisClient
          .zrevrange("bidResponses", 0, -1)
          .then((result) => {
            return result.map((data) => JSON.parse(data));
          });

        console.log(ranking);
        await axios.post("http://localhost:3001/send-to-kafka/", {
          ranking,
        });
        res.json(ranking);
      } catch (error) {
        console.error("Error in handling bid request:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server Listening on PORT ${PORT}`);
});
