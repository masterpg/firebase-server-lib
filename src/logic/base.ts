import Vue from 'vue'

let db: firebase.firestore.Firestore

export abstract class BaseLogic extends Vue {
  //----------------------------------------------------------------------
  //
  //  Constructors
  //
  //----------------------------------------------------------------------

  constructor() {
    super()
    this.m_initFirestore()
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected get db(): firebase.firestore.Firestore {
    return db
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * Firestoreを初期化します。
   */
  private m_initFirestore(): void {
    // Firestoreのインスタンスが既に初期化されている場合、処理を抜ける
    if (db) return

    // Firestoreインスタンスを初期化
    db = firebase.firestore()
  }
}
