const line = require('@line/bot-sdk');

const MULTICAST_MAX = 500;

function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

// 指定したアクセストークン(=そのLINE公式アカウント)で、複数のLINEIDにメッセージを一斉送信する
async function sendMulticast(accessToken, lineUserIds, text) {
  const client = new line.Client({ channelAccessToken: accessToken });
  const batches = chunk(lineUserIds, MULTICAST_MAX);
  for (const batch of batches) {
    await client.multicast(batch, [{ type: 'text', text }]);
  }
}

// 1人ずつ内容が異なるメッセージ（出欠確認リンクなど）を送るためのpush送信
async function sendPush(accessToken, lineUserId, text) {
  const client = new line.Client({ channelAccessToken: accessToken });
  await client.pushMessage(lineUserId, [{ type: 'text', text }]);
}

module.exports = { sendMulticast, sendPush };
