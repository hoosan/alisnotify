const express = require('express');
const path = require('path')
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const DB = require("monk")(process.env.MONGODB_URL);
const alis = require('alis')
const db = DB.get("alisnotify")

var app = express();

app.get("*", async (req, res) => {

  try {
    const docs = await db.find();

    await Promise.all(docs.map( async (doc) => {
      const alisId = doc.user_name;
      const articles = await alis.p.users.user_id.articles.public({
        limit: 1,
        user_id: alisId
      })
      const items = articles.Items || [];

      if (items.length === 0) {
        return
      }

      const info = await alis.p.users.user_id.info({user_id: alisId})
      await db.update({user_name: alisId},{$set: {user_display_name: info.user_display_name}});

    }))
    res.sendStatus(200);
  } catch (e) {
    console.log(e)
    res.sendStatus(500);
  }
})

module.exports = app;
