import { PagingAfterInput, PagingAfterResult, PagingFirstInput, PagingFirstResult, PagingResult } from './types'

//========================================================================
//
//  Interfaces
//
//========================================================================

type PagingListItem<F> = F extends (...args: any[]) => Promise<PagingResult<infer R>> ? R : never

//========================================================================
//
//  Implementation
//
//========================================================================

/**
 * ページングを行う関数をラップし、ページング処理をサポートするクラスです。
 */
class Pager<I, F extends (...args: any[]) => Promise<PagingResult>, R extends PagingListItem<F>> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  /**
   * コンストラクタです。
   * @param instance ページングを行う関数のオーナーであるインスタンスを指定します。
   * @param func ページングを行う関数を指定します。
   * @param options
   *   - size: 1ページ内のアイテム数を指定します。<br>
   *   - useToken:
   *       トークン使用の有無を指定します。トークンを使用するとパフォーマンスは向上しますが、
   *       トークンには有効期限があるため、これを超えてリクエストを行うとタイムアウトした旨
   *       を示すレスポンスが返されます。
   */
  constructor(protected instance: I, protected func: F, options?: { size?: number; useToken?: boolean }) {
    this._size = options?.size
    this._useToken = options?.useToken ?? true
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private _started = false

  /**
   * ページングが開始されているかを示すフラグです。
   */
  get started() {
    return this._started
  }

  /**
   * ページングが開始されていないことを示すフラグフラグです。
   */
  get notStarted() {
    return !this._started
  }

  /**
   * ページングで使用されるトークンです。
   */
  get token(): string | undefined {
    return this.paging?.token
  }

  private _size?: number

  /**
   * 1ページ内のアイテム数です。
   */
  get size(): number | undefined {
    return this._size ?? this.paging?.size
  }

  private _num = 0

  /**
   * 現在のページ番号です。
   */
  get num(): number {
    return this._num
  }

  /**
   * 総ページ数です。
   */
  get totalPages(): number {
    return this.paging?.totalPages ?? 0
  }

  /**
   * 総アイテム数です。
   */
  get totalItems(): number {
    return this.paging?.totalItems ?? 0
  }

  private _useToken: boolean

  /**
   * トークンを使用するかを示すフラグです。
   */
  get useToken(): boolean {
    return this._useToken
  }

  private _isPagingTimeout = false

  /**
   * ページングがタイムアウトしてるかを示すフラグです。
   */
  get isPagingTimeout(): boolean {
    return this._isPagingTimeout
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private params?: Parameters<F>

  private paging?: Omit<PagingFirstResult, 'list'>

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * ページングを開始します。開始後は1ページ目のアイテムが取得されます。
   * @param params
   */
  start(...params: Parameters<F>): Promise<R[]> {
    return this.startWith(1, ...params)
  }

  /**
   * ページングを開始します。開始後は指定ページのアイテムが取得されます。
   * @param pageNum 取得するページ番号を指定します。
   * @param params
   */
  async startWith(pageNum: number, ...params: Parameters<F>): Promise<R[]> {
    this._num = pageNum
    this.params = params

    const pageInput: PagingFirstInput = {
      size: this.size,
      num: this._num,
    }
    const { list, ...paging } = (await this.func.call(this.instance, ...this.params, pageInput)) as PagingFirstResult<R>

    this.paging = paging

    if (!paging.totalItems) {
      this._started = false
    } else {
      this._started = true
    }

    return list
  }

  /**
   * 指定されたページのアイテムを取得します。
   * @param pageNum 取得するページ番号を指定します。
   */
  async fetch(pageNum: number): Promise<R[]> {
    this._num = pageNum
    if (!this.hasPage(this._num)) return []

    const pageInput: PagingAfterInput = {
      segment: this.paging!.segments[this.num - 1],
      token: this.useToken ? this.paging!.token : undefined,
    }
    const { list, isPagingTimeout } = (await this.func.call(this.instance, ...this.params!, pageInput)) as PagingAfterResult<R>

    this._isPagingTimeout = Boolean(isPagingTimeout)

    return list
  }

  /**
   * 全ページのアイテムを取得します。
   * @param params
   */
  async fetchAll(...params: Parameters<F>): Promise<R[]> {
    this._num = 1
    this.params = params

    const result: R[] = []
    do {
      const items = this.notStarted ? await this.start(...this.params) : await this.next()
      result.push(...items)
    } while (this.hasNext())

    return result
  }

  /**
   * 次のページのアイテムを取得します。
   */
  async next(): Promise<R[]> {
    if (!this.hasNext()) return []
    return this.fetch(this.num + 1)
  }

  /**
   * 次のページが存在するかを取得します。
   */
  hasNext(): boolean {
    return this.hasPage(this.num + 1)
  }

  /**
   * 指定されたページが存在するかを取得します。
   * @param pageNum ページ番号を指定します。
   */
  hasPage(pageNum: number): boolean {
    if (this.notStarted) return false
    return 0 < pageNum && pageNum <= this.paging!.totalPages
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { Pager }
