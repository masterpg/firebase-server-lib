# トランザクションと一括書き込み

Firestore はデータを読み書きするアトミックオペレーション[^※1]をサポートしています。複数のオペレーションを内包した一連のアトミックオペレーションでは、すべてのオペレーションが正常に完了するか、または何も行われないかのどちらかになります。Firestore には 2 種類のアトミックオペレーションがあります。

- **トランザクション**: [トランザクション](#transactions)は、1 つ以上のドキュメントに対して「**読み書き**」を行う一連のオペレーションです。

- **一括書き込み**: [一括書き込み](#batched-writes)は、1 つ以上のドキュメントに対して「**書き込み**」を行う一連のオペレーションです。

1 回のトランザクションまたは一括書き込みでは、最大 500 のドキュメントに書き込みを行うことができます。書き込みに関連するその他の制限については、[割り当てと制限](https://firebase.google.com/docs/firestore/quotas?hl=ja#writes_and_transactions)をご覧ください。

<br>

[^※1]: アトミックオペレーションとは、いくつかのオペレーションを組み合わせたもので、外部から見た場合それらがひとつのオペレーションに見えることをいう。

## <div id="transactions">トランザクションでデータを更新する</div>

Firestore では複数のオペレーションを 1 つのトランザクションにまとめることができます。例えばカウンターを実装する場合、トランザクションの中で最新のカウンタを**読み込み**、さらにカウンタをインクリメントして**書き込む**といった一連のオペレーションをアトミックに実行できます。

トランザクションは、任意の数の`get()`オペレーションと、その後に続く任意の数の書き込みオペレーション（`set()`、`update()`、`delete()`など）で構成されます。

オペレーションが他のオペレーションとコンフリクトした場合、Firestore はトランザクション全体を再実行します。たとえば、トランザクションがドキュメントを読み込んでいる間に、別のクライアントがそのドキュメントを変更すると、Firestore はトランザクションを再実行します。この機能により、常に整合性のある最新データに対してトランザクションが実行されます。

トランザクションでは、一連の書き込みが部分的に適用されることはありません。一連の書き込みは、すべての書き込みが完了するか、何も書き込まれないかのいずれかになります。

トランザクションを使用する場合は、次の点に注意してください。

- 読み取りオペレーションは書き込みオペレーションの前に実行する必要があります。
- トランザクションが読み取るドキュメントに対してコンフリクトが発生した場合、トランザクションが複数回実行されることがあります。
- トランザクションの中ではデータを直接変更してはなりません（これにつては後ほど説明します）。
- クライアントがオフラインの場合、トランザクションは失敗します。

次はトランザクションを作成して実行する例です。

```ts
const sfDocRef = this.f_db.collection('cities').doc('SF');

return this.f_db
  .runTransaction((transaction) => {
    // コンフリクトがあるとこのブロックは複数回実行されることがある
    return transaction.get(sfDocRef).then((sfDoc) => {
      if (!sfDoc.exists) {
        throw 'Document does not exist!';
      }
      const newPopulation = sfDoc.data()!.population + 1;
      transaction.update(sfDocRef, { population: newPopulation });
    });
  })
  .then(() => {
    console.log('Transaction successfully committed!');
  })
  .catch((error) => {
    console.log('Transaction failed: ', error);
  });
```

### トランザクションの中ではデータを直接変更してはいけない

トランザクションの中で、トランザクションを使用せず直接データを変更するとコンフリクトが発生し、トランザクションが再実行されます。ただし再実行が確実に成功する保証はないため、このようなことは行わないでください。

次はトランザクションの中でデータを直接変更しています。このコードを実行すると、トランザクションが複数回実行された後、最終的にトランザクションが失敗することが確認できます。

```ts
const sfDocRef = this.f_db.collection('cities').doc('SF');

let counter = 1;
return this.f_db
  .runTransaction((transaction) => {
    console.log('Number of executions of transaction:', counter++);
    return transaction.get(sfDocRef).then((sfDoc) => {
      if (!sfDoc.exists) {
        throw 'Document does not exist!';
      }
      // トランザクションの中でtransactionを使用せず、直接データをupdateする
      const randPopulation = Math.floor(Math.random() * 1000000);
      return sfDocRef.update({ population: randPopulation }).then(() => {
        // 上記コードで直接データをupdateした後、
        // 下記コードでtransactionを使用してデータをupdateすると、
        // データ変更のコンフリクトが発生してトランザクションが失敗する
        const newPopulation = sfDoc.data()!.population + 1;
        transaction.update(sfDocRef, { population: newPopulation });
      });
    });
  })
  .then(() => {
    console.log('Transaction successfully committed!');
  })
  .catch((error) => {
    console.log('Transaction failed: ', error);
  });
```

## <div id="batched-writes">一括書き込み</div>

一連のオペレーションが最新の読み込みを必要としない場合、バッチとして実行することができます。バッチは`set()`、`update()`、`delete()`オペレーションを組み合わせて構成することができます。バッチは複数のドキュメントに対する書き込みをアトミックオペレーションとして実行できます。

一括書き込みは Firestore へ大規模なデータセットを移行する場合に便利です。一括書き込みには最大 500 のオペレーションを含めることができ、これにより接続のオーバーヘッドが軽減され、データ移行をより迅速に行うことができます。

一括書き込みは次のような特性があります。

* トランザクションよりも失敗が少なく、コーディングもよりシンプルになります。
* 最新の読み込みを必要としないためコンフリクトの問題が発生しません。逆に読み込んだデータが最新の保証はありません。
* ユーザーの端末がオフラインの場合でも実行できます。

次はバッチの例になります。

```ts
// 書き込み用のバッチを取得
const batch = this.f_db.batch();

// 'NYC'を追加または更新
const nycRef = this.f_db.collection('cities').doc('NYC');
batch.set(nycRef, { name: 'New York City' });

// 'SF'の人口を更新
const sfRef = this.f_db.collection('cities').doc('SF');
batch.update(sfRef, { population: 1000000 });

// 'LA'を削除
const laRef = this.f_db.collection('cities').doc('LA');
batch.delete(laRef);

// バッチのコミット
batch.commit().then(() => {
  // ...
});
```
