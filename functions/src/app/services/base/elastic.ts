import { ApiResponse, Client as ElasticClient } from '@elastic/elasticsearch'
import { AppError } from '../../base'
import { Context } from '@elastic/elasticsearch/lib/Transport'
import { ResponseError } from '@elastic/elasticsearch/lib/errors'
import { config } from '../../../config'

//========================================================================
//
//  Interfaces
//
//========================================================================

namespace ElasticConstants {
  export const MaxResultSize = 10000
  export const ChunkSize = 3000
}

namespace BaseIndexDefinitions {
  /**
   * `keyword`タイプの文字列を小文字にする機能です。
   */
  export const keyword_lower = {
    type: 'custom',
    filter: ['lowercase'],
  } as const

  /**
   * 次のような変換を行ってくれる機能です。
   *   ウ゛ェ → ヴェ
   *   ＡＢＣ → ABC
   *   ① → 1
   *   ㊤ → 上
   *   ㌶ → ヘクタール
   *   ﾊﾝｶｸｶﾅ → ハンカクカナ
   */
  export const icu_nfkc_normalizer = {
    type: 'icu_normalizer',
    name: 'nfkc',
    mode: 'compose',
  } as const

  /**
   * 仮名をローマ字に変換する機能です。
   */
  export const kana_to_romaji = {
    type: 'mapping',
    mappings: [
      'あ=>a',
      'い=>i',
      'う=>u',
      'え=>e',
      'お=>o',
      'か=>ka',
      'き=>ki',
      'く=>ku',
      'け=>ke',
      'こ=>ko',
      'さ=>sa',
      'し=>shi',
      'す=>su',
      'せ=>se',
      'そ=>so',
      'た=>ta',
      'ち=>chi',
      'つ=>tsu',
      'て=>te',
      'と=>to',
      'な=>na',
      'に=>ni',
      'ぬ=>nu',
      'ね=>ne',
      'の=>no',
      'は=>ha',
      'ひ=>hi',
      'ふ=>fu',
      'へ=>he',
      'ほ=>ho',
      'ま=>ma',
      'み=>mi',
      'む=>mu',
      'め=>me',
      'も=>mo',
      'や=>ya',
      'ゆ=>yu',
      'よ=>yo',
      'ら=>ra',
      'り=>ri',
      'る=>ru',
      'れ=>re',
      'ろ=>ro',
      'わ=>wa',
      'を=>o',
      'ん=>n',
      'が=>ga',
      'ぎ=>gi',
      'ぐ=>gu',
      'げ=>ge',
      'ご=>go',
      'ざ=>za',
      'じ=>ji',
      'ず=>zu',
      'ぜ=>ze',
      'ぞ=>zo',
      'だ=>da',
      'ぢ=>ji',
      'づ=>zu',
      'で=>de',
      'ど=>do',
      'ば=>ba',
      'び=>bi',
      'ぶ=>bu',
      'べ=>be',
      'ぼ=>bo',
      'ぱ=>pa',
      'ぴ=>pi',
      'ぷ=>pu',
      'ぺ=>pe',
      'ぽ=>po',
      'きゃ=>kya',
      'きゅ=>kyu',
      'きょ=>kyo',
      'しゃ=>sha',
      'しゅ=>shu',
      'しょ=>sho',
      'ちゃ=>cha',
      'ちゅ=>chu',
      'ちょ=>cho',
      'にゃ=>nya',
      'にゅ=>nyu',
      'にょ=>nyo',
      'ひゃ=>hya',
      'ひゅ=>hyu',
      'ひょ=>hyo',
      'みゃ=>mya',
      'みゅ=>myu',
      'みょ=>myo',
      'りゃ=>rya',
      'りゅ=>ryu',
      'りょ=>ryo',
      'ぎゃ=>gya',
      'ぎゅ=>gyu',
      'ぎょ=>gyo',
      'じゃ=>ja',
      'じゅ=>ju',
      'じょ=>jo',
      'びゃ=>bya',
      'びゅ=>byu',
      'びょ=>byo',
      'ぴゃ=>pya',
      'ぴゅ=>pyu',
      'ぴょ=>pyo',
      'ふぁ=>fa',
      'ふぃ=>fi',
      'ふぇ=>fe',
      'ふぉ=>fo',
      'ふゅ=>fyu',
      'うぃ=>wi',
      'うぇ=>we',
      'うぉ=>wo',
      'つぁ=>tsa',
      'つぃ=>tsi',
      'つぇ=>tse',
      'つぉ=>tso',
      'ちぇ=>che',
      'しぇ=>she',
      'じぇ=>je',
      'てぃ=>ti',
      'でぃ=>di',
      'でゅ=>du',
      'とぅ=>tu',
      'ぢゃ=>ja',
      'ぢゅ=>ju',
      'ぢょ=>jo',
      'ぁ=>a',
      'ぃ=>i',
      'ぅ=>u',
      'ぇ=>e',
      'ぉ=>o',
      'っ=>t',
      'ゃ=>ya',
      'ゅ=>yu',
      'ょ=>yo',
      'ア=>a',
      'イ=>i',
      'ウ=>u',
      'エ=>e',
      'オ=>o',
      'カ=>ka',
      'キ=>ki',
      'ク=>ku',
      'ケ=>ke',
      'コ=>ko',
      'サ=>sa',
      'シ=>shi',
      'ス=>su',
      'セ=>se',
      'ソ=>so',
      'タ=>ta',
      'チ=>chi',
      'ツ=>tsu',
      'テ=>te',
      'ト=>to',
      'ナ=>na',
      'ニ=>ni',
      'ヌ=>nu',
      'ネ=>ne',
      'ノ=>no',
      'ハ=>ha',
      'ヒ=>hi',
      'フ=>fu',
      'ヘ=>he',
      'ホ=>ho',
      'マ=>ma',
      'ミ=>mi',
      'ム=>mu',
      'メ=>me',
      'モ=>mo',
      'ヤ=>ya',
      'ユ=>yu',
      'ヨ=>yo',
      'ラ=>ra',
      'リ=>ri',
      'ル=>ru',
      'レ=>re',
      'ロ=>ro',
      'ワ=>wa',
      'ヲ=>o',
      'ン=>n',
      'ガ=>ga',
      'ギ=>gi',
      'グ=>gu',
      'ゲ=>ge',
      'ゴ=>go',
      'ザ=>za',
      'ジ=>ji',
      'ズ=>zu',
      'ゼ=>ze',
      'ゾ=>zo',
      'ダ=>da',
      'ヂ=>ji',
      'ヅ=>zu',
      'デ=>de',
      'ド=>do',
      'バ=>ba',
      'ビ=>bi',
      'ブ=>bu',
      'ベ=>be',
      'ボ=>bo',
      'パ=>pa',
      'ピ=>pi',
      'プ=>pu',
      'ペ=>pe',
      'ポ=>po',
      'キャ=>kya',
      'キュ=>kyu',
      'キョ=>kyo',
      'シャ=>sha',
      'シュ=>shu',
      'ショ=>sho',
      'チャ=>cha',
      'チュ=>chu',
      'チョ=>cho',
      'ニャ=>nya',
      'ニュ=>nyu',
      'ニョ=>nyo',
      'ヒャ=>hya',
      'ヒュ=>hyu',
      'ヒョ=>hyo',
      'ミャ=>mya',
      'ミュ=>myu',
      'ミョ=>myo',
      'リャ=>rya',
      'リュ=>ryu',
      'リョ=>ryo',
      'ギャ=>gya',
      'ギュ=>gyu',
      'ギョ=>gyo',
      'ジャ=>ja',
      'ジュ=>ju',
      'ジョ=>jo',
      'ビャ=>bya',
      'ビュ=>byu',
      'ビョ=>byo',
      'ピャ=>pya',
      'ピュ=>pyu',
      'ピョ=>pyo',
      'ファ=>fa',
      'フィ=>fi',
      'フェ=>fe',
      'フォ=>fo',
      'フュ=>fyu',
      'ウィ=>wi',
      'ウェ=>we',
      'ウォ=>wo',
      'ヴァ=>va',
      'ヴィ=>vi',
      'ヴ=>v',
      'ヴェ=>ve',
      'ヴォ=>vo',
      'ツァ=>tsa',
      'ツィ=>tsi',
      'ツェ=>tse',
      'ツォ=>tso',
      'チェ=>che',
      'シェ=>she',
      'ジェ=>je',
      'ティ=>ti',
      'ディ=>di',
      'デュ=>du',
      'トゥ=>tu',
      'ヂャ=>ja',
      'ヂュ=>ju',
      'ヂョ=>jo',
      'ァ=>a',
      'ィ=>i',
      'ゥ=>u',
      'ェ=>e',
      'ォ=>o',
      'ッ=>t',
      'ャ=>ya',
      'ュ=>yu',
      'ョ=>yo',
    ],
  } as const

  /**
   * 空白文字を除去する機能です。
   */
  export const whitespace_remove = {
    type: 'pattern_replace',
    pattern: '(\\s|　)',
    replacement: '',
  } as const

  /**
   * 読み方が2種類以上ある単語を定義し吸収する機能です。
   * ※「日本」は「nippon」または「nihon」と読むことがある。
   */
  export const synonym = {
    type: 'synonym',
    lenient: true,
    synonyms: ['nippon, nihon'],
  } as const

  /**
   * サジェスト検索に必要なものを定義したanalysisです。
   */
  export const suggest_analysis = {
    char_filter: {
      icu_nfkc_normalizer,
      kana_to_romaji,
    },
    tokenizer: {
      kuromoji_normal_tokenizer: {
        mode: 'normal',
        type: 'kuromoji_tokenizer',
      },
    },
    filter: {
      // 漢字をローマ字の読み仮名に変換する機能です。
      // ※「寿司」は「sushi」に変換されます。
      readingform: {
        type: 'kuromoji_readingform',
        use_romaji: true,
      },
      // 指定した範囲の文字列を1文字ずつ分割します。
      // ※ { "min_gram": 2, max_gram: 4 } と指定した場合、
      //   「sushi」は「su、sus、sush」に分割されます。
      edge_ngram: {
        type: 'edge_ngram',
        min_gram: 1,
        max_gram: 20,
      },
      synonym,
    },
    analyzer: {
      suggest_index_analyzer: {
        type: 'custom',
        char_filter: ['icu_nfkc_normalizer'],
        tokenizer: 'kuromoji_normal_tokenizer',
        filter: ['lowercase', 'edge_ngram'],
      },
      suggest_search_analyzer: {
        type: 'custom',
        char_filter: ['icu_nfkc_normalizer'],
        tokenizer: 'kuromoji_normal_tokenizer',
        filter: ['lowercase'],
      },
      readingform_index_analyzer: {
        type: 'custom',
        char_filter: ['icu_nfkc_normalizer', 'kana_to_romaji'],
        tokenizer: 'kuromoji_normal_tokenizer',
        filter: ['lowercase', 'readingform', 'asciifolding', 'synonym', 'edge_ngram'],
      },
      readingform_search_analyzer: {
        type: 'custom',
        char_filter: ['icu_nfkc_normalizer', 'kana_to_romaji'],
        tokenizer: 'kuromoji_normal_tokenizer',
        filter: ['lowercase', 'readingform', 'asciifolding', 'synonym'],
      },
    },
  } as const

  /**
   * 日本語検索用analysis
   *
   * ■ kuromoji_search_tokenizer
   * ・discard_compound_token
   *   同義語展開時に生成された元々の複合語の存在により発生する同義語展開処理の失敗を回避するために設定。
   *   (例: 東京大学の分割結果は「東京、大学、東京大学」となり、そのうち「東京大学」は元々の複合語)
   *   このオプションはバージョン7.9 (>=7.9) から使用可能。これより前のバージョンの場合、後に登場する
   *   「kuromoji_index_synonym, kuromoji_search_synonym」でlenientをtrueにし、同義語展開の失敗を無視
   *   するといった対応が必要。
   *
   * ■ ja_index_synonym, ja_search_synonym
   *   読み方が2種類以上ある単語を定義し吸収する機能です。
   *   ※「アメリカ」は「米国」と呼ばれることがある。
   *
   *   ここではインデックス用と検索用で別のsynonymを定義し、検索側のみ同義語辞書を配置しています。イン
   *   デックス側に同義語辞書を配置しない理由として、インデックスサイズを抑えられたり、同義語のメンテ
   *   ナンス時にドキュメントの再インデックスが必要にならないなど、総合的なメリットが大きいためです。
   *
   * ■ kuromoji_index_analyzer, kuromoji_search_analyzer
   *   ここではインデックス用と検索用のanalyzerを定義しています。両者の違いはsynonymのみになります。
   *
   *  ・kuromoji_iteration_mark
   *    日本語の踊り字 (々、ヽ、ゝ など) を正規化するフィルタです。
   *    (例: "常々" → "常常")
   *  ・kuromoji_baseform
   *    動詞や形容詞などの活用で語尾が変わっている単語をすべて基本形に揃えるフィルタです。
   *    (例: "大きく" → "大きい")
   *  ・kuromoji_part_of_speech
   *    助詞などの不要な品詞を指定に基づいて削除するフィルタです。
   *    (例: "東京の紅葉情報" → 助詞の"の"を削除)
   *  ・kuromoji_stemmer
   *    語尾の長音を削除するフィルタです。
   *    (例: "コンピューター" → "コンピュータ")
   *  ・cjk_width
   *    半角・全角などを統一するフィルターです。
   *  ・ja_stop
   *    日本語用のストップワード除去フィルタです。デフォルトのままでも"あれ"、"それ"などを除去してくれます。
   *  ・lowercase
   *    トークンの文字を全て小文字に変換するフィルタです。
   */
  export const kuromoji_search_analysis = {
    char_filter: {
      icu_nfkc_normalizer,
    },
    tokenizer: {
      kuromoji_search_tokenizer: {
        mode: 'search',
        type: 'kuromoji_tokenizer',
        discard_compound_token: true,
        // "単語,分割されてほしい単語列,読みの単語列,品詞名"
        user_dictionary_rules: ['東京スカイツリー,東京 スカイツリー,トウキョウ スカイツリー,カスタム名詞'],
      },
    },
    filter: {
      kuromoji_index_synonym: {
        type: 'synonym',
        lenient: false,
        synonyms: [],
      },
      kuromoji_search_synonym: {
        type: 'synonym_graph',
        lenient: false,
        synonyms: ['米国,アメリカ', '英国,イギリス', '東京大学,東大'],
      },
    },
    analyzer: {
      kuromoji_index_analyzer: {
        type: 'custom',
        char_filter: ['kuromoji_iteration_mark', 'icu_nfkc_normalizer'],
        tokenizer: 'kuromoji_search_tokenizer',
        filter: ['kuromoji_baseform', 'kuromoji_part_of_speech', 'kuromoji_stemmer', 'cjk_width', 'ja_stop', 'lowercase', 'kuromoji_index_synonym'],
      },
      kuromoji_search_analyzer: {
        type: 'custom',
        char_filter: ['kuromoji_iteration_mark', 'icu_nfkc_normalizer'],
        tokenizer: 'kuromoji_search_tokenizer',
        filter: ['kuromoji_baseform', 'kuromoji_part_of_speech', 'kuromoji_stemmer', 'cjk_width', 'ja_stop', 'lowercase', 'kuromoji_search_synonym'],
      },
    },
  } as const

  export const TimestampEntityProps = {
    createdAt: {
      type: 'date',
    },
    updatedAt: {
      type: 'date',
    },
  } as const
}

interface SearchBody {
  query: {
    match: { foo: string }
  }
}

interface ShardsResponse {
  total: number
  successful: number
  failed: number
  skipped: number
}

interface Explanation {
  value: number
  description: string
  details: Explanation[]
}

type ElasticSearchHit<DOC> = {
  _index: string
  _type: string
  _id: string
  _score: number
  _source: DOC
  _version?: number
  _explanation?: Explanation
  fields?: any
  highlight?: any
  inner_hits?: any
  matched_queries?: string[]
  sort?: any[]
}

interface ElasticSearchResponse<DOC> {
  pit_id?: string
  took: number
  timed_out: boolean
  _scroll_id?: string
  _shards: ShardsResponse
  hits: {
    total: {
      value: number
      relation: 'eq' | 'gte'
    }
    max_score: number
    hits: ElasticSearchHit<DOC>[]
  }
  aggregations?: any
}

interface ElasticMSearchResponse<DOC> {
  responses: ElasticSearchResponse<DOC>[]
}

type ElasticSearchAPIResponse<DOC = any> = ApiResponse<ElasticSearchResponse<DOC>, Context>

type ElasticMSearchAPIResponse<DOC = any> = ApiResponse<ElasticMSearchResponse<DOC>, Context>

type ElasticBulkAPIResponse<DOC = any> = ApiResponse<Record<string, any>, Context>

type ElasticSearchResponseOrHits<DOC> = ElasticSearchAPIResponse<DOC> | ElasticMSearchAPIResponse<DOC> | ElasticSearchHit<DOC>[]

interface ElasticPageSegment {
  pit?: ElasticPointInTime
  search_after?: string[]
  from?: number
}

interface ElasticPointInTime {
  id: string
  keep_alive: string
}

namespace ElasticPointInTime {
  export const DefaultKeepAlive = '1m'
}

//========================================================================
//
//  Implementation
//
//========================================================================

function newElasticClient(): ElasticClient {
  return new ElasticClient(config.elastic)
}

async function openPointInTime(client: ElasticClient, index: string, keepAlive?: string): Promise<ElasticPointInTime> {
  const keep_alive = keepAlive || ElasticPointInTime.DefaultKeepAlive
  const res = await client.openPointInTime({ index, keep_alive })
  return { id: res.body.id, keep_alive }
}

async function closePointInTime(client: ElasticClient, pitId: string): Promise<boolean> {
  const res = await client.closePointInTime({
    body: { id: pitId },
  })
  return res.body.succeeded
}

function isPagingTimeout(error: ResponseError): boolean {
  const rootCause: { type: string; reason: string }[] | undefined = error.meta.body.error?.root_cause
  if (!rootCause || !rootCause.length) return false
  return rootCause[0].type === 'search_context_missing_exception'
}

function validateBulkResponse(response: ElasticBulkAPIResponse): void {
  if (!response.body.errors) return
  throw new AppError('Elasticsearch Bulk API Error', response.body.items)
}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  BaseIndexDefinitions,
  ElasticBulkAPIResponse,
  ElasticClient,
  ElasticConstants,
  ElasticMSearchAPIResponse,
  ElasticMSearchResponse,
  ElasticPageSegment,
  ElasticPointInTime,
  ElasticSearchAPIResponse,
  ElasticSearchHit,
  ElasticSearchResponse,
  ElasticSearchResponseOrHits,
  SearchBody,
  closePointInTime,
  isPagingTimeout,
  newElasticClient,
  openPointInTime,
  validateBulkResponse,
}
