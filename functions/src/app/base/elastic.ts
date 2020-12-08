import { ApiResponse, Client as ElasticClient } from '@elastic/elasticsearch'
import { Context } from '@elastic/elasticsearch/lib/Transport'
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

type ElasticTimestamp = { createdAt: string; updatedAt: string }

//========================================================================
//
//  Implementation
//
//========================================================================

function newElasticClient(): ElasticClient {
  return new ElasticClient(config.elastic)
}

//========================================================================
//
//  Exports
//
//========================================================================

export { ElasticClient, ElasticResponse, ElasticTimestamp, SearchBody, SearchResponse, newElasticClient }
