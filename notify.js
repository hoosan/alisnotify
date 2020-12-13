const express = require('express');
const request = require('request');
require("dotenv").config();
const alis = require("alis");
const MongoClient = require('mongodb').MongoClient;

var twitter = {};
twitter.oauth = {
  consumer_key: process.env.TWIBOT_TWITTER_KEY,
  consumer_secret: process.env.TWIBOT_TWITTER_SECRET,
  token: process.env.TWIBOT_TWITTER_TOKEN,
  token_secret: process.env.TWIBOT_TWITTER_TOKEN_SECRET
};

var app = express();

app.get("*", async (req, res) => {

  const client = await MongoClient.connect(process.env.MONGODB_URL, {
    poolSize: 10,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const alisnotify = await client.db("alisnotify");
  const db = await alisnotify.collection("alisnotify");
  const dbra = await alisnotify.collection("recent-article-sort-key");

  try {

    const recent_article = await dbra.findOne();

    const json = await alis.p.articles.recent({limit: 100});
    const items = json.Items || [];

    const recentItems = items.filter((item) => item.sort_key > recent_article.sort_key);

    if (json.Items[0].sort_key > recent_article.sort_key)
    {
      await dbra.update({},{$set: {sort_key: json.Items[0].sort_key }});

      await Promise.all(recentItems.map( async (item) => {
        const an = await db.findOne({user_name: item.user_id}) || {};
        const followers = an.followers || [];
        const url = `https://alis.to/${item.user_id}/articles/${item.article_id}`;
        const message = "[ALIS Notify] 新着記事\n" + `${item.title}\n${an.user_display_name}(ID: ${item.user_id})\n${url}\n`
        await Promise.all(followers.map( async (follower) => await reply(follower.twitter_id, message)))
      }));

    }

    res.sendStatus(200);
  } catch (e) {
    console.log(e)
    res.sendStatus(500)
  }

})

async function testReply(userid, message) {
  console.log(userid, message)
}

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
