import * as RequestParams from '@elastic/elasticsearch/api/requestParams'
import {
  ElasticConstants,
  ElasticPageSegment,
  ElasticPointInTime,
  ElasticSearchAPIResponse,
  ElasticSearchHit,
  ElasticSearchResponse,
  isPagingTimeout,
  openPointInTime,
} from './elastic'
import { PageSegment, PagingAfterInput, PagingAfterResult, PagingFirstInput, PagingFirstResult, PagingResult } from './types'
import { AppError } from '../../base'
import { DeepPartial } from 'web-base-lib'
import { Client as ElasticClient } from '@elastic/elasticsearch'
import { merge } from 'lodash'

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
   *   - pageSize: 1ページ内のアイテム数を指定します。<br>
   *   - useToken:
   *       トークン使用の有無を指定します。トークンを使用するとパフォーマンスは向上しますが、
   *       トークンには有効期限があるため、これを超えてリクエストを行うとタイムアウトした旨
   *       を示すレスポンスが返されます。
   */
  constructor(protected instance: I, protected func: F, options?: { pageSize?: number; useToken?: boolean }) {
    this._pageSize = options?.pageSize
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

  private _pageSize?: number

  /**
   * 1ページ内のアイテム数です。
   */
  get pageSize(): number | undefined {
    return this._pageSize ?? this.paging?.pageSize
  }

  private _pageNum = 0

  /**
   * 現在のページ番号です。
   */
  get pageNum(): number {
    return this._pageNum
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

  /**
   * 取得可能な最大アイテム数です。
   */
  get maxItems(): number {
    return this.paging?.maxItems ?? 0
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
    this._pageNum = pageNum
    this.params = params

    const pageInput: PagingFirstInput = {
      pageSize: this.pageSize,
      pageNum: this._pageNum,
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
    this._pageNum = pageNum
    if (!this.hasPage(this._pageNum)) return []

    const pageInput: PagingAfterInput = {
      pageSegment: this.paging!.pageSegments[this.pageNum - 1],
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
    this._pageNum = 1
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
    return this.fetch(this.pageNum + 1)
  }

  /**
   * 次のページが存在するかを取得します。
   */
  hasNext(): boolean {
    return this.hasPage(this.pageNum + 1)
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

/**
 * Elasticsearchの`max_result_window`で設定されている件数を超えて、
 * 指定されたクエリに該当するドキュメントを全て取得します。
 * @param client
 * @param index
 * @param searchParams
 * @param exceed
 *   Elasticsearchの`max_result_window`で設定されている件数を超えて
 *   指定されたクエリに該当するドキュメントを全て取得するかを指定します。
 * @param options
 *   - chunkSize: 1回の検索で取得するドキュメントの件数を指定します。
 */
async function executeAllDocumentsQuery<DOC = any>(
  client: ElasticClient,
  index: string,
  searchParams: RequestParams.Search,
  exceed: boolean,
  options?: { chunkSize?: number }
): Promise<{ hits: ElasticSearchHit<DOC>[]; total: number; pit: ElasticPointInTime }> {
  const ChunkSize = options?.chunkSize ?? ElasticConstants.ChunkSize
  const MaxLoopCount = Math.ceil(1000000 / ChunkSize)
  let loopCount = 0

  const result: ElasticSearchHit<DOC>[] = []
  let total = 0
  let hits: ElasticSearchHit<DOC>[] = []
  let size = ChunkSize
  let from = 0

  const pit = await openPointInTime(client, index)
  let pageSegment: ElasticPageSegment = { pit }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await client.search<ElasticSearchResponse<DOC>>(
      merge({}, searchParams, {
        size,
        track_total_hits: true,
        body: {
          ...pageSegment,
        },
      })
    )
    total = response.body.hits.total.value
    hits = response.body.hits.hits
    if (!hits.length) break

    result.push(...hits)

    // 次のページングセグメントを取得
    if (exceed) {
      pageSegment = getNextExceedPageSegment(response)
    } else {
      from += ChunkSize
      pageSegment = getNextFromPageSegment(response, from)
      // 総取得件数が取得上限に達している場合、終了
      if (result.length >= ElasticConstants.MaxResultSize) {
        break
      }
      // 次回のドキュメント取得で、総取得件数が取得上限を上回る場合
      else if (result.length + ChunkSize > ElasticConstants.MaxResultSize) {
        size = ElasticConstants.MaxResultSize - result.length
      }
    }

    loopCount++
    if (MaxLoopCount < loopCount) break
  }

  return { hits: result, total, pit }
}

/**
 * Elasticsearchから取得したドキュメントにページ付けを行い、ページングデータを生成します。
 * @param hits
 * @param size 1ページ内のアイテム数を指定します。
 * @param exceed
 *   Elasticsearchの`max_result_window`で設定されている件数を超えて、
 *   最後のドキュメントまでをページングの対象にするかを指定します。
 * @param filter
 */
function createPagingData<DOC extends DeepPartial<DOC>>(
  hits: ElasticSearchHit<DOC>[],
  size: number,
  exceed: boolean,
  filter?: (hit: ElasticSearchHit<DOC>) => boolean
): {
  pageSegments: PageSegment[]
  filteredHits: ElasticSearchHit<DOC>[]
  totalPages: number
} {
  const result: {
    pageSegments: PageSegment[]
    filteredHits: ElasticSearchHit<DOC>[]
    totalPages: number
  } = { pageSegments: [], filteredHits: [], totalPages: 0 }

  if (!hits.length) return result

  let excludeCount = 0
  let chunkCount = 0
  const pageSegments: PageSegment[] = []

  // 1ページ目のページデータに仮データを設定
  pageSegments.push({ size: 0 })

  for (let n = 1; n <= hits.length; n++) {
    const hit = hits[n - 1]

    // 呼び出し元でドキュメントに対する検証を行い、
    // 結果がfalseの場合そのドキュメントは除外する
    const filtered = filter ? filter(hit) : true
    if (filtered) {
      result.filteredHits.push(hit)
      chunkCount++
    } else {
      excludeCount++
    }

    // チャンクカウンタが指定チャンクサイズに到達する、
    // またはカウンタ「n」が最後尾のドキュメントに到達した場合
    if (size === chunkCount || n === hits.length) {
      // チャンクカウンタが1件でもカウントされている場合
      if (chunkCount) {
        // 1つ前のページングセグメントにsizeを設定
        pageSegments[pageSegments.length - 1].size = chunkCount + excludeCount
      }
      // 最後尾のドキュメントではない場合
      if (n < hits.length) {
        // 新しいページングセグメントを追加 ※この段階ではsizeは仮設定
        if (exceed) {
          if (!hit.sort) {
            throw new AppError(`The query needs to be sorted in order to get the document to the last.`)
          }
          pageSegments.push({ size: 0, search_after: hit.sort })
        } else {
          pageSegments.push({ size: 0, from: n })
        }
      }
      // 次のチャンクにむけてカウンタをクリア
      chunkCount = 0
      excludeCount = 0
    }
  }

  // 対象データがなかった場合
  if (pageSegments[0].size === 0) {
    pageSegments.splice(0, 1)
    return result
  }
  // 対象データがあった場合
  else {
    result.pageSegments = pageSegments
    result.totalPages = pageSegments.length
    return result
  }
}

/**
 * 2回目以降のページングクエリを実行します。
 * @param client
 * @param pagingInput
 * @param searchParams
 */
async function executeAfterPagingQuery<DOC = any>(
  client: ElasticClient,
  pagingInput: PagingAfterInput,
  searchParams: RequestParams.Search
): Promise<{ response?: ElasticSearchAPIResponse<DOC>; isPagingTimeout: boolean }> {
  const { pageSegment, token } = pagingInput
  if (!pageSegment) return { isPagingTimeout: false }

  let pit: ElasticPointInTime | undefined
  if (token) {
    pit = { id: token, keep_alive: ElasticPointInTime.DefaultKeepAlive }
  }

  let response: ElasticSearchAPIResponse<DOC>
  try {
    response = await client.search<ElasticSearchResponse<DOC>>(
      merge(searchParams, {
        body: { ...pageSegment, pit },
      })
    )
  } catch (err) {
    if (isPagingTimeout(err)) {
      return { isPagingTimeout: true }
    } else {
      throw err
    }
  }

  return { response, isPagingTimeout: false }
}

/**
 * ページングクエリのレスポンスから、次のページング用のデータを取得します。
 * この関数はElasticsearchの`max_result_window`で設定されている件数の範囲内で
 * ドキュメントを取得する際に使用します。
 * @param response ページングクエリの実行結果であるレスポンスを指定します。
 * @param nextFrom 次のページングクエリを実行する際の開始位置を指定します。
 */
function getNextFromPageSegment<T>(response: ElasticSearchAPIResponse<T>, nextFrom: number): ElasticPageSegment {
  const length = response.body.hits.hits.length
  if (!length) return {}

  let pit: ElasticPointInTime | undefined
  if (response.body.pit_id) {
    pit = { id: response.body.pit_id, keep_alive: ElasticPointInTime.DefaultKeepAlive }
  }

  return { pit, from: nextFrom }
}

/**
 * ページングクエリのレスポンスから、次のページング用のデータを取得します。
 * この関数はElasticsearchの`max_result_window`で設定されている件数を超えて
 * ドキュメントを取得する際に使用します。
 * @param response
 */
function getNextExceedPageSegment<T>(response: ElasticSearchAPIResponse<T>): ElasticPageSegment {
  const length = response.body.hits.hits.length
  if (!length) return {}

  const lastHit = response.body.hits.hits[length - 1]

  let pit: ElasticPointInTime | undefined
  if (response.body.pit_id) {
    pit = { id: response.body.pit_id, keep_alive: ElasticPointInTime.DefaultKeepAlive }
  }

  if (!lastHit.sort) {
    throw new AppError(`The query needs to be sorted in order to get the document to the last.`)
  }

  return { pit, search_after: lastHit.sort }
}

/**
 * 指定されたアイテムリストから1ページ分のアイテムを取り出します。
 * @param items
 * @param pageNum 取得するページ番号を指定します。
 * @param pageSize 1ページ内のアイテム数を指定します。
 */
function extractPageItems<T>(items: T[], pageNum: number, pageSize: number): T[] {
  const startIndex = (pageNum - 1) * pageSize
  const endIndex = startIndex + pageSize
  return items.slice(startIndex, endIndex)
}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  Pager,
  createPagingData,
  executeAfterPagingQuery,
  executeAllDocumentsQuery,
  extractPageItems,
  getNextExceedPageSegment,
  getNextFromPageSegment,
}
