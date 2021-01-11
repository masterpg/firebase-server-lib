import { ApiResponse, Client as ElasticClient } from '@elastic/elasticsearch'
import { AppError } from './base'
import { Context } from '@elastic/elasticsearch/lib/Transport'
import { ResponseError } from '@elastic/elasticsearch/lib/errors'
import { config } from '../../config'

//========================================================================
//
//  Interfaces
//
//========================================================================

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

interface SearchResponse<T> {
  pit_id?: string
  took: number
  timed_out: boolean
  _scroll_id?: string
  _shards: ShardsResponse
  hits: {
    total: number
    max_score: number
    hits: Array<{
      _index: string
      _type: string
      _id: string
      _score: number
      _source: T
      _version?: number
      _explanation?: Explanation
      fields?: any
      highlight?: any
      inner_hits?: any
      matched_queries?: string[]
      sort?: string[]
    }>
  }
  aggregations?: any
}

type ElasticResponse<T = any> = ApiResponse<SearchResponse<T>, Context>

type ElasticBulkResponse<T = any> = ApiResponse<Record<string, any>, Context>

type ElasticTimestamp = { createdAt: string; updatedAt: string }

interface ElasticPageToken {
  pit: { id: string; keep_alive: string }
  search_after?: string[]
}

//========================================================================
//
//  Implementation
//
//========================================================================

function newElasticClient(): ElasticClient {
  return new ElasticClient(config.elastic)
}

async function openPointInTime(client: ElasticClient, index: string, keepAlive = '1m'): Promise<{ id: string; keep_alive: string }> {
  const res = await client.openPointInTime({
    index,
    keep_alive: keepAlive,
  })
  return { id: res.body.id, keep_alive: keepAlive }
}

async function closePointInTime(client: ElasticClient, pitId: string): Promise<boolean> {
  const res = await client.closePointInTime({
    body: { id: pitId },
  })
  return res.body.succeeded
}

function encodePageToken(pitId: string, sort?: string[]): string {
  return `${pitId}:${JSON.stringify(sort ?? [])}`
}

function decodePageToken(pageToken?: string): ElasticPageToken | Record<string, never> {
  if (!pageToken) return {}

  const [pitId, sort] = pageToken.split(':')

  const pit = {
    id: pitId,
    keep_alive: '1m',
  }

  const search_after = JSON.parse(sort)

  return { pit, search_after }
}

function extractSearchAfter<T>(response: ElasticResponse<T>): { pitId?: string; sort?: string[] } | undefined {
  const length = response.body.hits.hits.length
  if (!length) return {}

  const lastHit = response.body.hits.hits[length - 1]
  return {
    pitId: response.body.pit_id,
    sort: lastHit.sort,
  }
}

function isPaginationTimeout(error: ResponseError): boolean {
  const rootCause: { type: string; reason: string }[] | undefined = error.meta.body.error?.root_cause
  if (!rootCause || !rootCause.length) return false
  return rootCause[0].type === 'search_context_missing_exception'
}

function validateBulkResponse(response: ElasticBulkResponse): void {
  if (!response.body.errors) return
  throw new AppError('Elasticsearch Bulk API Error', response.body.items)
}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  ElasticBulkResponse,
  ElasticClient,
  ElasticPageToken,
  ElasticResponse,
  ElasticTimestamp,
  SearchBody,
  SearchResponse,
  closePointInTime,
  decodePageToken,
  encodePageToken,
  extractSearchAfter,
  isPaginationTimeout,
  newElasticClient,
  openPointInTime,
  validateBulkResponse,
}
