import * as td from 'testdouble'
import { AppError, initApp } from '../../../../../src/app/base'
import { CoreStorageNode, CoreStorageSchema, PageSegment, Pager, createPagingData, executeAllDocumentsQuery } from '../../../../../src/app/services'
import { CoreStorageServiceDI, CoreStorageServiceModule } from '../../../../../src/app/services/core-storage'
import { CoreStorageTestHelper, CoreStorageTestService } from '../../../../helpers/app'
import { ElasticConstants, ElasticSearchHit } from '../../../../../src/app/services/base/elastic'
import { Test, TestingModule } from '@nestjs/testing'
import dayjs = require('dayjs')

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Tests
//
//========================================================================

describe('Pager', () => {
  let testingModule!: TestingModule
  let storageService!: CoreStorageTestService
  let h!: CoreStorageTestHelper

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

  async function setupNodes(num: number) {
    const tmp = await storageService.createDir({ dir: `tmp` })

    const body: any[] = []
    for (let i = 1; i <= num; i++) {
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

    return { tmp }
  }

  function verifyNodes(nodes: CoreStorageNode[], start: number, size: number): void {
    expect(nodes.length).toBe(size)
    for (let i = 1; i <= size; i++) {
      const node = nodes[i - 1]
      const num = start + i - 1
      expect(node.name).toBe(`dir${num.toString().padStart(5, '0')}`)
    }
  }

  it('start + next - sizeの指定なし', async () => {
    const { tmp } = await setupNodes(210)

    // sizeを指定しない
    // ※getDescendantsのデフォルトのsizeが使用される
    const pager = new Pager(storageService, storageService.getDescendants)

    let nodes = await pager.start({ id: tmp.id })
    expect(nodes.length).toBe(100)
    expect(pager.token).toBeDefined()
    expect(pager.pageSize).toBe(100)
    expect(pager.pageNum).toBe(1)
    expect(pager.totalPages).toBe(3)
    expect(pager.totalItems).toBe(210)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 1, 100)

    nodes = await pager.next()
    expect(nodes.length).toBe(100)
    expect(pager.pageNum).toBe(2)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 101, 100)

    nodes = await pager.next()
    expect(nodes.length).toBe(10)
    expect(pager.pageNum).toBe(3)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 201, 10)
  })

  it('start + next - pageSizeの指定あり', async () => {
    const { tmp } = await setupNodes(110)

    // sizeを指定する
    const pager = new Pager(storageService, storageService.getDescendants, { pageSize: 50 })

    let nodes = await pager.start({ id: tmp.id })
    expect(nodes.length).toBe(50)
    expect(pager.token).toBeDefined()
    expect(pager.pageSize).toBe(50)
    expect(pager.pageNum).toBe(1)
    expect(pager.totalPages).toBe(3)
    expect(pager.totalItems).toBe(110)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 1, 50)

    nodes = await pager.next()
    expect(nodes.length).toBe(50)
    expect(pager.pageNum).toBe(2)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 51, 50)

    nodes = await pager.next()
    expect(nodes.length).toBe(10)
    expect(pager.pageNum).toBe(3)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 101, 10)
  })

  it('startWith + next', async () => {
    const { tmp } = await setupNodes(110)

    const pager = new Pager(storageService, storageService.getDescendants, { pageSize: 50 })

    // ページ番号を指定する
    let nodes = await pager.startWith(2, { id: tmp.id })
    expect(nodes.length).toBe(50)
    expect(pager.token).toBeDefined()
    expect(pager.pageSize).toBe(50)
    expect(pager.pageNum).toBe(2) // 指定されたページ番号になっている
    expect(pager.totalPages).toBe(3)
    expect(pager.totalItems).toBe(110)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 51, 50)

    nodes = await pager.next()
    expect(nodes.length).toBe(10)
    expect(pager.pageNum).toBe(3)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 101, 10)
  })

  it('fetch', async () => {
    const { tmp } = await setupNodes(110)

    const pager = new Pager(storageService, storageService.getDescendants, { pageSize: 50 })

    await pager.start({ id: tmp.id })

    let nodes = await pager.fetch(3)
    expect(nodes.length).toBe(10)
    expect(pager.pageNum).toBe(3)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 101, 10)

    nodes = await pager.fetch(1)
    expect(nodes.length).toBe(50)
    expect(pager.pageNum).toBe(1)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 1, 50)

    nodes = await pager.fetch(2)
    expect(nodes.length).toBe(50)
    expect(pager.pageNum).toBe(2)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 51, 50)
  })

  it('fetch - 範囲外のページ番号を指定した場合', async () => {
    const { tmp } = await setupNodes(110)

    const pager = new Pager(storageService, storageService.getDescendants, { pageSize: 50 })
    await pager.start({ id: tmp.id })

    // 総ページ数を検証
    expect(pager.totalPages).toBe(3)

    // 範囲外のページを指定
    const nodes = await pager.fetch(4)
    expect(nodes.length).toBe(0)
  })

  it('fetchAll', async () => {
    const { tmp } = await setupNodes(110)

    const pager = new Pager(storageService, storageService.getDescendants, { pageSize: 50 })

    const nodes = await pager.fetchAll({ id: tmp.id })
    expect(nodes.length).toBe(110)
    expect(pager.token).toBeDefined()
    expect(pager.pageSize).toBe(50)
    expect(pager.pageNum).toBe(3)
    expect(pager.totalPages).toBe(3)
    expect(pager.totalItems).toBe(110)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 1, 110)
  })

  it('トークンを使用しない', async () => {
    // Elasticsearchの`max_result_window`の設定値を超えたノードを追加
    const { tmp } = await setupNodes(10010)

    // トークンを使用しないよう指定
    const pager = new Pager(storageService, storageService.getDescendants, { pageSize: 5000, useToken: false })

    // トークンを使用しないよう設定されていることを検証
    expect(pager.useToken).toBeFalsy()

    const nodes: CoreStorageNode[] = []
    do {
      const _nodes = pager.notStarted
        ? await pager.start({
            id: tmp.id,
          })
        : await pager.next()
      nodes.push(..._nodes)
    } while (pager.hasNext())

    // Elasticsearchの`max_result_window`の設定値を超えたノードが取得できることを検証
    verifyNodes(nodes, 1, 10010)
  })
})

describe('executeAllDocumentsQuery', () => {
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

  it('ベーシックケース - exceedがtrueの場合', async () => {
    await setupAppNodes()

    const actual = await executeAllDocumentsQuery(
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
      true
    )

    expect(actual.hits.length).toBe(NodeNum)
    expect(actual.total).toBe(NodeNum)
    expect(actual.pit).toBeDefined()
  })

  it('ベーシックケース - exceedがfalseの場合', async () => {
    await setupAppNodes()

    const actual = await executeAllDocumentsQuery(
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
      false
    )

    expect(actual.hits.length).toBe(ElasticConstants.MaxResultSize)
    expect(actual.total).toBe(NodeNum)
    expect(actual.pit).toBeDefined()
  })

  it('chunkSizeを指定した場合', async () => {
    await setupAppNodes()

    const actual = await executeAllDocumentsQuery(
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
      true,
      { chunkSize: 1111 }
    )

    expect(actual.hits.length).toBe(NodeNum)
    expect(actual.total).toBe(NodeNum)
    expect(actual.pit).toBeDefined()
  })

  it('クエリにソート順を指定せず、exceedにtrueを指定した場合', async () => {
    await setupAppNodes()

    let actual!: AppError
    try {
      await executeAllDocumentsQuery(
        storageService.client,
        CoreStorageSchema.IndexAlias,
        {
          body: {
            query: {
              term: { dir: `tmp` },
            },
            // sortを指定しない
          },
        },
        true
      )
    } catch (err) {
      actual = err
    }

    expect(actual.cause).toBe(`The query needs to be sorted in order to get the document to the last.`)
  })
})

describe('createPagingData', () => {
  interface Person {
    name: string
    age: number
  }

  function setupEntities(num: number, unsort?: boolean) {
    const entities: ElasticSearchHit<Person>[] = []
    for (let i = 1; i <= num; i++) {
      const doc = {
        name: `name${i.toString().padStart(num.toString().length, '0')}`,
        age: i,
      }
      entities.push({
        sort: unsort ? undefined : [doc.age, doc.name],
        _source: doc,
      } as any)
    }
    return entities
  }

  describe('exceedがtrueの場合', () => {
    it('ベーシックケース', async () => {
      const PageSize = 5
      const OriginalTotalItems = 20
      const Excludes = [3, 5, 6, 12, 13, 15, 16, 19, 20]
      const hits = setupEntities(OriginalTotalItems)

      const actual = createPagingData(hits, PageSize, true, hit => {
        return !Excludes.includes(hit._source.age)
      })

      expect(actual.totalPages).toBe(3)
      expect(actual.filteredHits.length).toBe(11)
      // 1ページ目
      expect(actual.pageSegments[0]).toEqual<PageSegment>({
        size: 8,
      })
      expect(actual.filteredHits[0]._source.name).toBe('name01')
      expect(actual.filteredHits[1]._source.name).toBe('name02')
      expect(actual.filteredHits[2]._source.name).toBe('name04')
      expect(actual.filteredHits[3]._source.name).toBe('name07')
      expect(actual.filteredHits[4]._source.name).toBe('name08')
      // 2ページ目
      expect(actual.pageSegments[1]).toEqual<PageSegment>({
        size: 9,
        search_after: [8, 'name08'],
      })
      expect(actual.filteredHits[5]._source.name).toBe('name09')
      expect(actual.filteredHits[6]._source.name).toBe('name10')
      expect(actual.filteredHits[7]._source.name).toBe('name11')
      expect(actual.filteredHits[8]._source.name).toBe('name14')
      expect(actual.filteredHits[9]._source.name).toBe('name17')
      // 3ページ目
      expect(actual.pageSegments[2]).toEqual<PageSegment>({
        size: 3,
        search_after: [17, 'name17'],
      })
      expect(actual.filteredHits[10]._source.name).toBe('name18')

      // 各ページ条件のsizeを合計すると20件になる
      // ※20件のうち11件が対象
      const originalTotalItems = actual.pageSegments.reduce((result, item) => result + item.size, 0)
      expect(originalTotalItems).toBe(OriginalTotalItems)
    })

    it('最終ページに端数がある場合', async () => {
      const PageSize = 3
      const OriginalTotalItems = 7
      const hits = setupEntities(OriginalTotalItems)

      const actual = createPagingData(hits, PageSize, true)

      expect(actual.totalPages).toBe(3)
      expect(actual.filteredHits.length).toBe(7)
      // 1ページ目
      expect(actual.pageSegments[0]).toEqual<PageSegment>({
        size: 3,
      })
      expect(actual.filteredHits[0]._source.name).toBe('name1')
      expect(actual.filteredHits[1]._source.name).toBe('name2')
      expect(actual.filteredHits[2]._source.name).toBe('name3')
      // 2ページ目
      expect(actual.pageSegments[1]).toEqual<PageSegment>({
        size: 3,
        search_after: [3, 'name3'],
      })
      expect(actual.filteredHits[3]._source.name).toBe('name4')
      expect(actual.filteredHits[4]._source.name).toBe('name5')
      expect(actual.filteredHits[5]._source.name).toBe('name6')
      // 3ページ目
      expect(actual.pageSegments[2]).toEqual<PageSegment>({
        size: 1,
        search_after: [6, 'name6'],
      })
      expect(actual.filteredHits[6]._source.name).toBe('name7')

      // 各ページ条件のsizeを合計すると7件になる
      const originalTotalItems = actual.pageSegments.reduce((result, item) => result + item.size, 0)
      expect(originalTotalItems).toBe(OriginalTotalItems)
    })

    it('最終ページに端数がない場合', async () => {
      const PageSize = 3
      const OriginalTotalItems = 6
      const hits = setupEntities(OriginalTotalItems)

      const actual = createPagingData(hits, PageSize, true)

      expect(actual.filteredHits.length).toBe(6)
      expect(actual.totalPages).toBe(2)
      // 1ページ目
      expect(actual.pageSegments[0]).toEqual<PageSegment>({
        size: 3,
      })
      expect(actual.filteredHits[0]._source.name).toBe('name1')
      expect(actual.filteredHits[1]._source.name).toBe('name2')
      expect(actual.filteredHits[2]._source.name).toBe('name3')
      // 2ページ目
      expect(actual.pageSegments[1]).toEqual<PageSegment>({
        size: 3,
        search_after: [3, 'name3'],
      })
      expect(actual.filteredHits[3]._source.name).toBe('name4')
      expect(actual.filteredHits[4]._source.name).toBe('name5')
      expect(actual.filteredHits[5]._source.name).toBe('name6')

      // 各ページのsizeを合計すると6件になる
      const originalTotalItems = actual.pageSegments.reduce((result, item) => result + item.size, 0)
      expect(originalTotalItems).toBe(OriginalTotalItems)
    })

    it('ドキュメントがソートされていない場合', async () => {
      const PageSize = 5
      const OriginalTotalItems = 20
      const hits = setupEntities(OriginalTotalItems, true) // ソートしないよう指定

      let actual!: AppError
      try {
        createPagingData(hits, PageSize, true)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The query needs to be sorted in order to get the document to the last.`)
    })
  })

  describe('exceedがfalseの場合', () => {
    it('ベーシックケース', async () => {
      const PageSize = 5
      const OriginalTotalItems = 20
      const Excludes = [3, 5, 6, 12, 13, 15, 16, 19, 20]
      const hits = setupEntities(OriginalTotalItems)

      const actual = createPagingData(hits, PageSize, false, hit => {
        return !Excludes.includes(hit._source.age)
      })

      expect(actual.totalPages).toBe(3)
      expect(actual.filteredHits.length).toBe(11)
      // 1ページ目
      expect(actual.pageSegments[0]).toEqual<PageSegment>({
        size: 8,
      })
      expect(actual.filteredHits[0]._source.name).toBe('name01')
      expect(actual.filteredHits[1]._source.name).toBe('name02')
      expect(actual.filteredHits[2]._source.name).toBe('name04')
      expect(actual.filteredHits[3]._source.name).toBe('name07')
      expect(actual.filteredHits[4]._source.name).toBe('name08')
      // 2ページ目
      expect(actual.pageSegments[1]).toEqual<PageSegment>({
        size: 9,
        from: 8,
      })
      expect(actual.filteredHits[5]._source.name).toBe('name09')
      expect(actual.filteredHits[6]._source.name).toBe('name10')
      expect(actual.filteredHits[7]._source.name).toBe('name11')
      expect(actual.filteredHits[8]._source.name).toBe('name14')
      expect(actual.filteredHits[9]._source.name).toBe('name17')
      // 3ページ目
      expect(actual.pageSegments[2]).toEqual<PageSegment>({
        size: 3,
        from: 17,
      })
      expect(actual.filteredHits[10]._source.name).toBe('name18')

      // 各ページ条件のsizeを合計すると20件になる
      // ※20件のうち11件が対象
      const originalTotalItems = actual.pageSegments.reduce((result, item) => result + item.size, 0)
      expect(originalTotalItems).toBe(OriginalTotalItems)
    })

    it('最終ページに端数がある場合', async () => {
      const PageSize = 3
      const OriginalTotalItems = 7
      const hits = setupEntities(OriginalTotalItems)

      const actual = createPagingData(hits, PageSize, false)

      expect(actual.totalPages).toBe(3)
      expect(actual.filteredHits.length).toBe(7)
      // 1ページ目
      expect(actual.pageSegments[0]).toEqual<PageSegment>({
        size: 3,
      })
      expect(actual.filteredHits[0]._source.name).toBe('name1')
      expect(actual.filteredHits[1]._source.name).toBe('name2')
      expect(actual.filteredHits[2]._source.name).toBe('name3')
      // 2ページ目
      expect(actual.pageSegments[1]).toEqual<PageSegment>({
        size: 3,
        from: 3,
      })
      expect(actual.filteredHits[3]._source.name).toBe('name4')
      expect(actual.filteredHits[4]._source.name).toBe('name5')
      expect(actual.filteredHits[5]._source.name).toBe('name6')
      // 3ページ目
      expect(actual.pageSegments[2]).toEqual<PageSegment>({
        size: 1,
        from: 6,
      })
      expect(actual.filteredHits[6]._source.name).toBe('name7')

      // 各ページ条件のsizeを合計すると7件になる
      const originalTotalItems = actual.pageSegments.reduce((result, item) => result + item.size, 0)
      expect(originalTotalItems).toBe(OriginalTotalItems)
    })

    it('最終ページに端数がない場合', async () => {
      const PageSize = 3
      const OriginalTotalItems = 6
      const hits = setupEntities(OriginalTotalItems)

      const actual = createPagingData(hits, PageSize, false)

      expect(actual.filteredHits.length).toBe(6)
      expect(actual.totalPages).toBe(2)
      // 1ページ目
      expect(actual.pageSegments[0]).toEqual<PageSegment>({
        size: 3,
      })
      expect(actual.filteredHits[0]._source.name).toBe('name1')
      expect(actual.filteredHits[1]._source.name).toBe('name2')
      expect(actual.filteredHits[2]._source.name).toBe('name3')
      // 2ページ目
      expect(actual.pageSegments[1]).toEqual<PageSegment>({
        size: 3,
        from: 3,
      })
      expect(actual.filteredHits[3]._source.name).toBe('name4')
      expect(actual.filteredHits[4]._source.name).toBe('name5')
      expect(actual.filteredHits[5]._source.name).toBe('name6')

      // 各ページのsizeを合計すると6件になる
      const originalTotalItems = actual.pageSegments.reduce((result, item) => result + item.size, 0)
      expect(originalTotalItems).toBe(OriginalTotalItems)
    })
  })

  it('ドキュメントが0件だった場合', async () => {
    const PageSize = 5
    const hits: ElasticSearchHit<Person>[] = []

    const encoded = createPagingData(hits, PageSize, false)

    expect(encoded.totalPages).toBe(0)
    expect(encoded.filteredHits.length).toBe(0)
    expect(encoded.pageSegments).toEqual([])
  })

  it('対象アイテムが0件だった場合', async () => {
    const PageSize = 5
    const OriginalTotalItems = 20
    const hits = setupEntities(OriginalTotalItems)

    const encoded = createPagingData(hits, PageSize, false, hit => {
      // 全ドキュメントを対象外とする
      return false
    })

    expect(encoded.totalPages).toBe(0)
    expect(encoded.filteredHits.length).toBe(0)
    expect(encoded.pageSegments).toEqual([])
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

    const actual = createPagingData(hits, PageSize, false, hit => {
      return !Excludes.includes(hit._source.age)
    })

    expect(actual.totalPages).toBe(TotalPages)
    expect(actual.filteredHits.length).toBe(TotalItems)

    // 各ページのsizeを合計すると10000件になる
    const originalTotalItems = actual.pageSegments.reduce((result, item) => result + item.size, 0)
    expect(originalTotalItems).toBe(OriginalTotalItems)
  })
})
