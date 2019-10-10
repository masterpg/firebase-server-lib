# Firestore にデータを追加する

Firestore にデータを書き込む方法はいくつかあります。

- ドキュメントに ID を明示的に指定し、ドキュメントのデータを設定する。
- コレクションにデータが設定されたドキュメントを追加する。この場合、Firestore は ID を自動的に生成します。
- 自動的に生成された ID を持つ空のドキュメントを作成し、あとでこのドキュメントにデータを設定する。

このガイドでは、Firestore で個々のドキュメントを設定、追加、更新する方法を説明します。データを一括で書き込む場合は、「[トランザクションと一括書き込み](/firestore/manage-data/transaction/index.md)」を参照ください。

## ドキュメントを設定する

単一のドキュメントを作成または上書きするには、`set()`メソッドを使用します。

```ts
// cities コレクションにドキュメントを追加
this.f_db
  .collection('cities')
  .doc('OSK')
  .set({
    name: 'Osaka',
    state: null,
    country: 'Japan',
  })
  .then(() => {
    console.log('Document successfully written!');
  })
  .catch((error) => {
    console.error('Error writing document: ', error);
  });
```

ドキュメントが存在しない場合、ドキュメントが新規に作成されることになります。

次の例ではドキュメントが存在する場合、既存ドキュメントに新規データをマージするよう`{ merge: true }`を指定しています。マージする指定がない場合、指定のないフィールドはドキュメントから削除されます。

```ts
const cityRef = this.f_db.collection('cities').doc('BJ');
const setWithMerge = cityRef.set({ capital: true }, { merge: true });
```

## データ型

Firestore では、文字列、ブール値、日付、NULL、ネストされた配列、オブジェクトなど、さまざまなデータ型をドキュメントに書き込むことができます Firestore はコーディングで指定された数字の種類に関係なく、常に倍精度として数値を保存します。

```ts
const docData = {
  stringExample: 'Hello world!',
  booleanExample: true,
  numberExample: 3.14159265,
  dateExample: new Date('December 10, 1815'),
  arrayExample: [5, true, 'hello'],
  nullExample: null,
  objectExample: {
    a: 5,
    b: {
      nested: 'foo',
    },
  },
};

this.f_db
  .collection('data')
  .doc('one')
  .set(docData)
  .then(() => {
    console.log('Document successfully written!');
  });
```

## ドキュメントを追加する

`set()`を使用してドキュメントを作成する場合、このドキュメントに ID を指定する必要があります。次に例を示します。

```ts
this.f_db
  .collection('cities')
  .doc('new-city-id')
  .set(data);
```

ただし、ID を指定するのではなく、自動的に生成してもらいた場合があります。この場合は`add()`を使用します。

```ts
this.f_db.collection('cities')
  .add({
    name: 'Fukuoka',
    country: 'Japan',
  })
  .then((docRef) => {
    // 生成されたIDを表示
    console.log('Document written with ID: ', docRef.id);
  })
  .catch((err) => {
    console.error('Error adding document: ', err);
  });
```

自動生成されたIDを持つドキュメントを最初に作成して、あとからこのドキュメントにデータ設定したいというケースもあるでしょう。この場合は`doc()`を使用します。

```ts
// 自動生成されたIDを持つドキュメントを作成
const newCityRef = this.f_db.collection('cities').doc();

// その後...
newCityRef.set(data);
```

`.add(...)`と`.doc().set(...)`は完全に同等なので、用途に合わせて使用してください。

## ドキュメントを更新する

ドキュメント全体を上書きせず、ドキュメントの一部のフィールドを更新するには、`update()` メソッドを使用します。

```ts
const washingtonRef = this.f_db.collection('cities').doc('DC');

// 'DC'の capital を true に設定
return washingtonRef
  .update({
    capital: true,
  })
  .then(() => {
    console.log('Document successfully updated!');
  })
  .catch((err) => {
    console.error('Error updating document: ', err);
  });
```

### ネストされたオブジェクトのフィールドを更新する

ネストされたオブジェクトがドキュメントに含まれている場合、`update()`を呼び出すときにドット表記を使用することでネストされたフィールドを参照できます。

```ts
// サンプルデータを追加/設定
const frankDocRef = this.f_db.collection('users').doc('frank');
frankDocRef.set({
  name: 'Frank',
  favorites: { food: 'Pizza', color: 'Blue', subject: 'recess' },
  age: 12,
});

// 上記サンプルデータの favorites.color を変更
this.f_db.collection('users')
  .doc('frank')
  .update({
    'age': 13,
    'favorites.color': 'Red',
  })
  .then(() => {
    console.log('Document successfully updated!');
  });
```

ドキュメントにサーバーのタイムスタンプを保存するフィールドを追加して、サーバーが更新を受信した時刻を使用することもできます。

```ts
const frankDocRef = this.f_db.collection('users').doc('frank');

// timestamp にサーバーが更新を受信した時刻を使用
const updateTimestamp = frankDocRef.update({
  timestamp: firebase.firestore.FieldValue.serverTimestamp(),
});
```


