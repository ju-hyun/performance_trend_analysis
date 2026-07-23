// 修正後ブラウザをリフレッシュすると変更事項が反映されます。
window.PTA_CONFIG = {
  // 1. API Proxy用ベースURL (Proxy設定用)
  BASE_URL: 'https://demo.jennifersoft.co.jp/',

  // 2. APIサーバーのドメインまたはIP (Nginx等でプロキシを使用する場合は空にしておく、直接呼び出す場合はアドレスを入力)
  API_DOMAIN: ''

  // 3. API認証用トークンはこのファイルには置かない。
  //    nginx側の /api/ プロキシ設定でリクエスト転送時にサーバー側から付与する。
};
