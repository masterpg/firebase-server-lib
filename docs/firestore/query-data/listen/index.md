# Firestore でデータを監視する

`onSnapshot()`メソッドを使用すると、ドキュメントを監視することができます。次はドキュメントの変更を監視する例です。

```ts
this.f_db
  .collection('cities')
  .doc('SF')
  .onSnapshot((doc) => {
    console.log('Current data: ', doc.data());
  });
```

## ローカル変更のイベント

ローカルで書き込みが行われると、すぐにスナップショットリスナーが起動します。これは「レイテンシ補正」という重要な機能のためです。書き込みを実行すると、データがバックエンドに送信される前に、新しいデータがリスナーに通知されます。

取得されたドキュメントは`metadata.hasPendingWrites`というプロパティを持ち、これはバックエンドにまだ書き込まれていないローカル変更がドキュメントにあるかどうかを示します。

```ts
this.f_db
  .collection('cities')
  .doc('SF')
  .onSnapshot((snapshot) => {
    const source = snapshot.metadata.hasPendingWrites ? 'Local' : 'Server';
    console.log(source, ' data: ', snapshot.data());
  });

setTimeout(() => {
  const docRef = this.f_db.collection('cities').doc('SF');
  docRef.get().then((doc) => {
    if (!doc.exists) return;
    const city = doc.data()!;
    return docRef.update({ capital: !city.capital });
  });
}, 3000);
```

## メタデータ変更のイベント

ドキュメント、コレクション、またはクエリへの変更を監視する場合、監視リスナーで受け取るイベントの詳細レベルを制御するオプションを渡すことができます。

デフォルトでは、メタデータにのみ影響する変更は監視リスナーに通知されません。メタデータが変更されたイベントを受け取るには、監視リスナーをアタッチするときに`ListenOptions`オブジェクトを渡します。

次の例ではメタデータが変更されたイベントを受け取るために、監視リスナーのアタッチで`includeMetadataChanges: true`を渡しています。

```ts
this.f_db
  .collection('cities')
  .doc('SF')
  .onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
    console.log(`hasPendingWrites: ${snapshot.metadata.hasPendingWrites}, capital: ${snapshot.data()!.capital}`);
  });

setTimeout(() => {
  const docRef = this.f_db.collection('cities').doc('SF');
  docRef.get().then((snapshot) => {
    if (!snapshot.exists) return;
    const city = snapshot.data()!;
    return docRef.update({ capital: !city.capital });
  });
}, 3000);
```

## コレクション内の複数のドキュメントを監視

クエリ結果をリッスンすることで複数のドキュメントを監視することができます。次の例では`state`が`'CA'` のドキュメントを監視しています。

監視リスナはクエリ結果が変更されるたびに（つまり、ドキュメントが追加、削除、変更されたときに）実行されます。

```ts
this.f_db
  .collection('cities')
  .where('state', '==', 'CA')
  .onSnapshot((snapshot) => {
    const cities: string[] = [];
    snapshot.forEach((doc) => {
      cities.push(doc.data()!.name);
    });
    console.log('Current cities in CA: ', cities.join(', '));
  });

setTimeout(() => {
  const docRef = this.f_db.collection('cities').doc('SF');
  docRef.get().then((snapshot) => {
    if (snapshot.exists) {
      if (Math.floor(Math.random() * 2) === 0) {
        return docRef.delete();
      } else {
        const city = snapshot.data()!;
        return docRef.update({ population: city.population + 1 });
      }
    } else {
      return docRef.set({
        name: 'San Francisco',
        state: 'CA',
        country: 'USA',
        capital: false,
        population: 860000,
      });
    }
  });
}, 3000);
```

## スナップショット間で変更があったドキュメントの取得

前回取得したスナップショットから今回取得したスナップショットの間で変更があったドキュメントを取得することができます。

初回に取得されるスナップショットでは、`forEach`による各`change.state`には`'added'`が設定されています。

```ts
this.f_db
  .collection('cities')
  .where('state', '==', 'CA')
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        console.log('New city: ', change.doc.data());
      }
      if (change.type === 'modified') {
        console.log('Modified city: ', change.doc.data());
      }
      if (change.type === 'removed') {
        console.log('Removed city: ', change.doc.data());
      }
    });
  });

setTimeout(() => {
  const docRef = this.f_db.collection('cities').doc('SF');
  docRef.get().then((snapshot) => {
    if (snapshot.exists) {
      if (Math.floor(Math.random() * 2) === 0) {
        return docRef.delete();
      } else {
        const city = snapshot.data()!;
        return docRef.update({ population: city.population + 1 });
      }
    } else {
      return docRef.set({
        name: 'San Francisco',
        state: 'CA',
        country: 'USA',
        capital: false,
        population: 860000,
      });
    }
  });
}, 3000);
```

## 監視リスナーのデタッチ

データを監視する必要がなくなったら、監視リスナーをデタッチしてください。デタッチすることでネットワーク帯域の使用を停止することができます。

`onSnapshot()`の戻り値である`unsubscribe`関数を使用すると、更新のリッスンが停止され、監視リスナーをデタッチすることができます。

```ts
const unsubscribe = this.f_db.collection('cities')
  .onSnapshot(() => {
    // ...
  });

// 更新のリッスンを停止
unsubscribe();
```
