const express = require('express');
const path = require("path");
const request = require('request');
const {send} = require('micro');
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const alis = require("alis");
const mongodb = require("mongodb");
const DB = require("monk")(process.env.MONGODB_URL);
const db = DB.get("alisnotify");

var twitter = {};
twitter.oauth = {
  consumer_key: process.env.TWIBOT_TWITTER_KEY,
  consumer_secret: process.env.TWIBOT_TWITTER_SECRET,
  token: process.env.TWIBOT_TWITTER_TOKEN,
  token_secret: process.env.TWIBOT_TWITTER_TOKEN_SECRET
};

var app = express();

app.get("/notify", async (req, res) => {

  const docs = await db.find();
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

      const sort_key_now = articles.Items[0].sort_key;
      const url = `https://alis.to/${alisId}/articles/${articles.Items[0].article_id}`;
      const overview = articles.Items[0].overview;
      const title = articles.Items[0].title;
      if (sort_key_now > doc.sort_key){

        const res_update = await db.update({user_name: alisId},{$set: {sort_key: sort_key_now}});

        const info = await alis.p.users.user_id.info({user_id: alisId})
        let message = "[ALIS Notify] 新着記事\n"
        message += `${title}\n${info.user_display_name}(ID: ${alisId})\n****\n`
        if (overview != null){
            message += `${overview.trim()}..\n`
        }
        message += `****\n${url}\n`

        const followers = doc.followers;
        for (let follower of followers){
          await reply(follower.twitter_id, message);
        }
      }
    } catch(e){
      console.log(`error in notify.js. id:${alisId}`);
      console.log(e);
    }
  }
  res.sendStatus(200);

})

async function reply(userid, message){

  // Create object
  var message_obj = new Object();
  message_obj = {
    "event": {
      "type": "message_create",
      "message_create": {
        "target": {
          "recipient_id": userid
        },
        "message_data": {
          "text": message
        }
      }
    }
  }

  var request_options = {
    url: 'https://api.twitter.com/1.1/direct_messages/events/new.json',
    oauth: twitter.oauth,
    json: true,
    headers: {
      'content-type': 'application/json'
    },
    body: message_obj
  }
  // send by POST
  // request.post(request_options, function (error, response, body){});
  await doRequest(request_options);

}

function doRequest(options) {
  return new Promise(function (resolve, reject) {
    request.post(options, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}

module.exports = app;
