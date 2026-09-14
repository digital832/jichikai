// 出欠回答リンク用のトークン。セッションIDとLINEIDを1本の文字列にまとめてURLに入れられるようにする。
// 秘匿情報ではない（LINEIDそのものは会員個人しか使わないURLの中でしか使われない）ため、暗号化はせず単純なエンコードのみ。

function encode(sessionId, lineUserId) {
  return Buffer.from(`${sessionId}|${lineUserId}`, 'utf8').toString('base64url');
}

function decode(token) {
  const decoded = Buffer.from(token, 'base64url').toString('utf8');
  const [sessionId, lineUserId] = decoded.split('|');
  if (!sessionId || !lineUserId) throw new Error('無効なトークンです');
  return { sessionId, lineUserId };
}

module.exports = { encode, decode };
