# Firestore でデータを取得する

## サンプルデータを投入する

次のコマンドで Firestore にサンプルデータを投入することができます。

```console
$ yarn db:restore
```

次は投入されたデータを JSON 形式で表現したものです。

```json
{
  "SF": {
    "name": "San Francisco",
    "state": "CA",
    "country": "USA",
    "capital": false,
    "population": 860000
  },
  "LA": {
    "name": "Los Angeles",
    "state": "CA",
    "country": "USA",
    "capital": false,
    "population": 3900000
  },
  "WC": {
    "name": "Washington, D.C.",
    "state": null,
    "country": "USA",
    "capital": true,
    "population": 680000
  },
  "TOK": {
    "name": "Tokyo",
    "state": null,
    "country": "Japan",
    "capital": true,
    "population": 9000000
  },
  "BJ": {
    "name": "Beijing",
    "state": null,
    "country": "China",
    "capital": true,
    "population": 21500000
  }
}
```

## ドキュメントを取得する

次の例は、`get()`を使用して単一のドキュメントを取得する方法を示しています。

```ts
const docRef = this.f_db.collection('cities').doc('SF');
docRef
  .get()
  .then((doc) => {
    if (doc.exists) {
      console.log('Document data:', doc.data());
    } else {
      // このケースでの doc.data() は undefined になる
      console.log('No such document!');
    }
  })
  .catch((err) => {
    console.log('Error getting document:', err);
  });
```

## コレクションから複数のドキュメントを取得する

コレクションに対してクエリを実行することにより、1 回のリクエストで複数のドキュメントを取得することができます。また`where()`を使用して特定の条件を満たすドキュメントを取得することもできます。

```ts
this.f_db.collection('cities')
  .where('capital', '==', true)
  .get()
  .then((snapshot) => {
    snapshot.forEach((doc) => {
      // クエリしたスナップショットの doc.data() は undefined になることはない
      console.log(doc.id, ' => ', doc.data());
    });
  })
  .catch((err) => {
    console.log('Error getting documents: ', err);
  });
```

## コレクションのすべてのドキュメントを取得する

`where()`フィルタを省略することによって、コレクション内のすべてのドキュメントを取得することもできます。

```ts
this.f_db
  .collection('cities')
  .get()
  .then((snapshot) => {
    snapshot.forEach((doc) => {
      console.log(doc.id, ' => ', doc.data());
    });
  });
```
