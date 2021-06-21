import * as td from 'testdouble'
import { CoreStorageSchema, PagingSegment } from '../../../../../src/app/services'
import { CoreStorageServiceDI, CoreStorageServiceModule } from '../../../../../src/app/services/core-storage'
import { CoreStorageTestHelper, CoreStorageTestService } from '../../../../helpers/app'
import { ElasticPointInTime, ElasticSearchHit, generatePagingData, searchAllHitsByQuery } from '../../../../../src/app/services/base/elastic'
import { Test, TestingModule } from '@nestjs/testing'
import dayjs = require('dayjs')
import { initApp } from '../../../../../src/app/base'

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Tests
//
//========================================================================

describe('generatePagingData', () => {
  interface Person {
    name: string
    age: number
  }

  function setupEntities(num: number) {
    const entities: ElasticSearchHit<Person>[] = []
    for (let i = 1; i <= num; i++) {
      const doc = {
        name: `name${i.toString().padStart(num.toString().length, '0')}`,
        age: i,
      }
      entities.push({
        sort: [doc.age, doc.name],
        _source: doc,
      } as any)
    }
    return entities
  }

  it('ベーシックケース', async () => {
    const PageSize = 5
    const OriginalTotalItems = 20
    const Excludes = [3, 5, 6, 12, 13, 15, 16, 19, 20]
    const hits = setupEntities(OriginalTotalItems)

    const actual = generatePagingData(hits, PageSize, hit => {
      return !Excludes.includes(hit._source.age)
    })

    expect(actual.totalPages).toBe(3)
    expect(actual.hits.length).toBe(11)
    // 1ページ目
    expect(actual.segments[0]).toEqual<PagingSegment>({
      size: 8,
    })
    expect(actual.hits[0]._source.name).toBe('name01')
    expect(actual.hits[1]._source.name).toBe('name02')
    expect(actual.hits[2]._source.name).toBe('name04')
    expect(actual.hits[3]._source.name).toBe('name07')
    expect(actual.hits[4]._source.name).toBe('name08')
    // 2ページ目
    expect(actual.segments[1]).toEqual<PagingSegment>({
      size: 9,
      search_after: [8, 'name08'],
    })
    expect(actual.hits[5]._source.name).toBe('name09')
    expect(actual.hits[6]._source.name).toBe('name10')
    expect(actual.hits[7]._source.name).toBe('name11')
    expect(actual.hits[8]._source.name).toBe('name14')
    expect(actual.hits[9]._source.name).toBe('name17')
    // 3ページ目
    expect(actual.segments[2]).toEqual<PagingSegment>({
      size: 3,
      search_after: [17, 'name17'],
    })
    expect(actual.hits[10]._source.name).toBe('name18')

    // 各ページ条件のsizeを合計すると20件になる
    // ※20件のうち11件が対象
    const originalTotalItems = actual.segments.reduce((result, item) => result + item.size, 0)
    expect(originalTotalItems).toBe(OriginalTotalItems)
  })

  it('最終ページに端数がある場合', async () => {
    const PageSize = 3
    const OriginalTotalItems = 7
    const hits = setupEntities(OriginalTotalItems)

    const actual = generatePagingData(hits, PageSize)

    expect(actual.totalPages).toBe(3)
    expect(actual.hits.length).toBe(7)
    // 1ページ目
    expect(actual.segments[0]).toEqual<PagingSegment>({
      size: 3,
    })
    expect(actual.hits[0]._source.name).toBe('name1')
    expect(actual.hits[1]._source.name).toBe('name2')
    expect(actual.hits[2]._source.name).toBe('name3')
    // 2ページ目
    expect(actual.segments[1]).toEqual<PagingSegment>({
      size: 3,
      search_after: [3, 'name3'],
    })
    expect(actual.hits[3]._source.name).toBe('name4')
    expect(actual.hits[4]._source.name).toBe('name5')
    expect(actual.hits[5]._source.name).toBe('name6')
    // 3ページ目
    expect(actual.segments[2]).toEqual<PagingSegment>({
      size: 1,
      search_after: [6, 'name6'],
    })
    expect(actual.hits[6]._source.name).toBe('name7')

    // 各ページ条件のsizeを合計すると7件になる
    const originalTotalItems = actual.segments.reduce((result, item) => result + item.size, 0)
    expect(originalTotalItems).toBe(OriginalTotalItems)
  })

  it('最終ページに端数がない場合', async () => {
    const PageSize = 3
    const OriginalTotalItems = 6
    const hits = setupEntities(OriginalTotalItems)
    const pit: ElasticPointInTime = { id: 'abcdefg', keep_alive: '1m' }

    const actual = generatePagingData(hits, PageSize)

    expect(actual.hits.length).toBe(6)
    expect(actual.totalPages).toBe(2)
    // 1ページ目
    expect(actual.segments[0]).toEqual<PagingSegment>({
      size: 3,
    })
    expect(actual.hits[0]._source.name).toBe('name1')
    expect(actual.hits[1]._source.name).toBe('name2')
    expect(actual.hits[2]._source.name).toBe('name3')
    // 2ページ目
    expect(actual.segments[1]).toEqual<PagingSegment>({
      size: 3,
      search_after: [3, 'name3'],
    })
    expect(actual.hits[3]._source.name).toBe('name4')
    expect(actual.hits[4]._source.name).toBe('name5')
    expect(actual.hits[5]._source.name).toBe('name6')

    // 各ページのsizeを合計すると6件になる
    const originalTotalItems = actual.segments.reduce((result, item) => result + item.size, 0)
    expect(originalTotalItems).toBe(OriginalTotalItems)
  })

  it('ドキュメントが0件だった場合', async () => {
    const PageSize = 5
    const hits: ElasticSearchHit<Person>[] = []

    const encoded = generatePagingData(hits, PageSize)

    expect(encoded.totalPages).toBe(0)
    expect(encoded.hits.length).toBe(0)
    expect(encoded.segments).toEqual([])
  })

  it('対象エンティティが0件だった場合', async () => {
    const PageSize = 5
    const OriginalTotalItems = 20
    const hits = setupEntities(OriginalTotalItems)

    const encoded = generatePagingData(hits, PageSize, hit => {
      // 全ドキュメントを対象外とする
      return false
    })

    expect(encoded.totalPages).toBe(0)
    expect(encoded.hits.length).toBe(0)
    expect(encoded.segments).toEqual([])
  })

  it('大量データの場合', async () => {
    const PageSize = 100
    const OriginalTotalItems = 10000
    const Excludes = Array.from(
      new Set(
        [...Array(100)].map(() => {
          const Max = 10000
          const Min = 1
          return Math.floor(Math.random() * (Max + 1 - Min)) + Min
        })
      )
    )
    const TotalItems = OriginalTotalItems - Excludes.length
    const TotalPages = Math.ceil(TotalItems / PageSize)
    const hits = setupEntities(OriginalTotalItems)

    const actual = generatePagingData(hits, PageSize, hit => {
      return !Excludes.includes(hit._source.age)
    })

    expect(actual.totalPages).toBe(TotalPages)
    expect(actual.hits.length).toBe(TotalItems)

    // 各ページのsizeを合計すると10000件になる
    const originalTotalItems = actual.segments.reduce((result, item) => result + item.size, 0)
    expect(originalTotalItems).toBe(OriginalTotalItems)
  })
})

describe('searchAllHitsByQuery', () => {
  let testingModule!: TestingModule
  let storageService!: CoreStorageTestService
  let h!: CoreStorageTestHelper

  const NodeNum = 20100

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [CoreStorageServiceModule],
    }).compile()

    storageService = testingModule.get<CoreStorageTestService>(CoreStorageServiceDI.symbol)
    h = new CoreStorageTestHelper(storageService)

    await h.removeAllNodes()
  })

  afterEach(() => {
    td.reset()
  })

  async function setupAppNodes() {
    const tmp = await storageService.createDir({ dir: `tmp` })

    const body: any[] = []
    for (let i = 1; i <= NodeNum; i++) {
      const id = CoreStorageSchema.generateId()
      const now = dayjs()
      const path = `${tmp.path}/dir${i.toString().padStart(5, '0')}`
      body.push({ index: { _index: CoreStorageSchema.IndexAlias, _id: id } })
      body.push({
        ...storageService.toDocNode({
          nodeType: 'Dir',
          ...CoreStorageSchema.toPathData(path),
          contentType: '',
          size: 0,
          share: {},
          createdAt: now,
          updatedAt: now,
        }),
      })
    }
    await storageService.client.bulk({ refresh: true, body })
  }

  it('ベーシックケース - インデックス名を指定した場合', async () => {
    await setupAppNodes()

    const actual = await searchAllHitsByQuery(storageService.client, CoreStorageSchema.IndexAlias, {
      body: {
        query: {
          term: { dir: `tmp` },
        },
        sort: [{ path: 'asc', _id: 'asc' }],
      },
    })

    expect(actual.hits.length).toBe(NodeNum)
    expect(actual.total).toBe(NodeNum)
  })

  it('ベーシックケース - pitを指定した場合', async () => {
    await setupAppNodes()
    const pit = await ElasticPointInTime.open(storageService.client, CoreStorageSchema.IndexAlias)

    const actual = await searchAllHitsByQuery(storageService.client, pit, {
      body: {
        query: {
          term: { dir: `tmp` },
        },
        sort: [{ path: 'asc', _id: 'asc' }],
      },
    })

    expect(actual.hits.length).toBe(NodeNum)
    expect(actual.total).toBe(NodeNum)
  })

  it('取得件数を指定した場合', async () => {
    await setupAppNodes()

    const actual = await searchAllHitsByQuery(
      storageService.client,
      CoreStorageSchema.IndexAlias,
      {
        body: {
          query: {
            term: { dir: `tmp` },
          },
          sort: [{ path: 'asc', _id: 'asc' }],
        },
      },
      { size: 10100 }
    )

    expect(actual.hits.length).toBe(10100)
    expect(actual.total).toBe(NodeNum)
  })
})
