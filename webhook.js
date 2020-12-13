const express = require('express');
const request = require('request');
require("dotenv").config();
const bodyParser = require('body-parser');
const alis = require('alis');
const MongoClient = require('mongodb').MongoClient;

const crypto = require('crypto');

var twitter = {};
twitter.oauth = {
  consumer_key: process.env.TWIBOT_TWITTER_KEY,
  consumer_secret: process.env.TWIBOT_TWITTER_SECRET,
  token: process.env.TWIBOT_TWITTER_TOKEN,
  token_secret: process.env.TWIBOT_TWITTER_TOKEN_SECRET
};

var app = express();

app.get('*', (req, res) => {

  let crc_token = req.query.crc_token;
  if (crc_token) {
    let hash = crypto.createHmac('sha256', process.env.TWIBOT_TWITTER_SECRET).update(crc_token).digest('base64');
    res.status(200);
    res.send({
      response_token: 'sha256=' + hash
    })
  } else {
    res.status(400);
    res.send('Error: crc_token missing from request.')
  }

})

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post("*", async (req, res) => {

  res.setHeader('Content-Type', 'text/plain');

  if (req.body.direct_message_events){

    // Get ID of user
    const sender = req.body.direct_message_events[0].message_create.sender_id;

    // message of DM
    const dmMessage = req.body.direct_message_events[0].message_create.message_data.text;

    if (sender != process.env.MYSELF){

    　if (dmMessage.match(/解除/)){
        await removeFollow(sender, dmMessage);

      } else if (dmMessage.match(/リスト/)){
        await checkFollowList(sender, dmMessage);

      } else if (dmMessage.match(/フォロー/)){
        await register(sender, dmMessage);

      } else if (dmMessage.match(/使い方/)){
        await howToUse(sender);

      } else if (dmMessage.match(/情報/)){
        await userArticles(sender, dmMessage);

      } else {
        const resMessage = `コマンド一覧\n\n・フォロー\n・リスト\n・フォロー解除\n・ユーザー情報\n・使い方\n`
        await reply(sender, resMessage);
      }
    }

  }
  res.sendStatus(200);
});

async function register(twitterId, dmMessage){
  const lines = dmMessage.replace("@", "").split(/["　"" "\n]/);

  var resMessage = "";

  const client = await MongoClient.connect(process.env.MONGODB_URL, {
    poolSize: 10,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const alisnotify = await client.db("alisnotify");
  const db = await alisnotify.collection("alisnotify");
  
  for (let alisId of lines) {

    // 半角英数以外はスキップ
    alisId = alisId.trim();
    if (!(alisId.match(/[0-9a-zA-Z]/))){
      continue;
    }

    try{

      const articles = await alis.p.users.user_id.articles.public({limit: 1, user_id: alisId});
      if (typeof articles.Items === "undefined" || articles.Items.length == 0) {
        resMessage += `${alisId}はALIS未登録ユーザです\n`;
      } else {
        const docs = await db.findOneAndupdate({user_name: alisId}, {limit:1});
        if (docs.length > 0) {
          if (await docs[0].followers.findIndex(({twitter_id}) => twitter_id === twitterId) >= 0){
            resMessage += `${alisId}はフォロー済みです\n`;
          } else {
            resMessage += `${alisId}をフォローしました\n`
            const obj = {twitter_id: twitterId};
            await db.findOneAndupdate({user_name: alisId}, {$push:{followers: obj}});
          }
        } else {
          const info = await alis.p.users.user_id.info({user_id: alisId})
          resMessage += `${alisId}をフォローしました\n`;
          await db.insert({user_name: alisId, followers: [{twitter_id: twitterId}], sort_key: articles.Items[0].sort_key, user_display_name: info.user_display_name})
        }
      }

    } catch(e) {
      console.log("error in register function.");
      console.log(e);
    }
  }
  await reply(twitterId, resMessage);

}

async function checkFollowList(twitterId, dmMessage){

  const client = await MongoClient.connect(process.env.MONGODB_URL, {
    poolSize: 10,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const alisnotify = await client.db("alisnotify");
  const db = await alisnotify.collection("alisnotify");
  
  const lines = dmMessage.split('\n');
  var resMessage = "";

  const docs = await db.find({followers: {$elemMatch: {twitter_id: twitterId}}});

  if (docs.length > 0){
    resMessage += `フォローリスト(${docs.length}人)\n`;
    for (let doc of docs) {
      resMessage += `${doc.user_name}\n`;
    }
  } else {
    resMessage += "誰もフォローしていません\n";
  }
  await reply(twitterId, resMessage);
}

async function removeFollow(twitterId, dmMessage){
  const lines = dmMessage.split('\n');
  var resMessage = "";

  const client = await MongoClient.connect(process.env.MONGODB_URL, {
    poolSize: 10,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const alisnotify = await client.db("alisnotify");
  const db = await alisnotify.collection("alisnotify");
  
  for (let alisId of lines) {

    // 半角英数以外はスキップ
    alisId = alisId.trim();
    if (!(alisId.match(/[0-9a-zA-Z]/))){
      continue;
    }

    const obj = {twitter_id: twitterId};
    const res = await db.findOneAndupdate({user_name: alisId}, {$pull:{followers: obj}});
    if (res.nModified > 0){
      resMessage += `${alisId}のフォローを解除しました\n`;
    } else {
      resMessage += `${alisId}はフォローしていません\n`;
    }
  }
  await reply(twitterId, resMessage);
}

async function howToUse(twitterId){
  const resMessage = "使い方はこちら\nhttps://alis.to/fukurou/articles/2jDXxRyO1M1x\n";
  await reply(twitterId, resMessage);
}

async function userArticles(twitterId, dmMessage){
  const lines = dmMessage.split('\n');
  // var newmessage = `コマンド：ユーザ\n\n`;
  var resMessage = "";

  for (let alisId of lines) {

    alisId = alisId.trim();
    // 半角英数以外はスキップ
    if (!(alisId.match(/[0-9a-zA-Z]/))){
      continue;
    }

    try{

      const res = await alis.p.users.user_id.articles.public({
        limit: 1,
        user_id: alisId
      })

      if (typeof res.Items === "undefined" || res.Items.length == 0) {
        resMessage += `${alisId}はALIS未登録ユーザです\n`;
      } else {
        const info = await alis.p.users.user_id.info({user_id: alisId})
        // console.log(JSON.stringify(info));
        resMessage += `${info.user_display_name}\n`
        resMessage += `id: ${alisId}\n`
        resMessage += `${info.self_introduction}\n`
        resMessage += `https://alis.to/users/${alisId}\n\n`
      }

    } catch(e) {
      console.log("error in userarticles function.");
    }
  }
  await reply(twitterId, resMessage);
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

module.exports = app
