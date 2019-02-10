const express = require('express');
const path = require("path");
const request = require('request');
const {send} = require('micro');
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const alis = require("alis");
const mongodb = require("mongodb");
const DB = require("monk")(process.env.MONGODB_URL);
const db = DB.get("alisnotify");
const dbra = DB.get("recent-article-sort-key");

var twitter = {};
twitter.oauth = {
  consumer_key: process.env.TWIBOT_TWITTER_KEY,
  consumer_secret: process.env.TWIBOT_TWITTER_SECRET,
  token: process.env.TWIBOT_TWITTER_TOKEN,
  token_secret: process.env.TWIBOT_TWITTER_TOKEN_SECRET
};

var app = express();

app.get("/notify", async (req, res) => {

  const recent_article = await dbra.find();

  await alis.p.articles.recent({limit: 100}).then(async (json)=>{

    if (json.Items[0].sort_key > recent_article[0].sort_key)
    {
      await dbra.update({},{$set: {sort_key: json.Items[0].sort_key }});
    }
    else {
      return;
    }
    for (let i of json.Items){
      if (recent_article[0].sort_key >= i.sort_key)
      {
        break
      }
      const an = await db.find({user_name: i.user_id})
      if (an.length > 0) {

        const url = `https://alis.to/${i.user_id}/articles/${i.article_id}`;
        let message = "[ALIS Notify] 新着記事\n"
        message += `${i.title}\n${an[0].user_display_name}(ID: ${i.user_id})\n****\n`
        if (i.overview != null){
          message += `${i.overview.trim()}..\n`
        }
        message += `****\n${url}\n`
        for (let follower of an[0].followers){
          await reply(follower.twitter_id, message);
        }
      }
    }
  }).catch((err)=>{console.log(err)})
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
