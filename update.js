const express = require('express');
const path = require('path')
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const DB = require("monk")(process.env.MONGODB_URL);
const alis = require('alis')
const db = DB.get("alisnotify")

var app = express();

app.get("/update", async (req, res) => {

  const docs = await dbf.find();

  for (let doc of docs){

    try{

      const alisId = doc.user_name;
      const articles = await alis.p.users.user_id.articles.public({
        limit: 1,
        user_id: alisId
      })

      if (typeof articles.Items === "undefined" || articles.Items.length == 0) {
        continue;
      }

      const info = await alis.p.users.user_id.info({user_id: alisId})
      await db.update({user_name: alisId},{$set: {user_display_name: info.user_display_name}});

    } catch(e){

      console.log(`error in update.js id:${alisId}`);
      console.log(e);
    }

  }
}

module.exports = app;
