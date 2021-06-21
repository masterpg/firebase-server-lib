import * as td from 'testdouble'
import { CoreStorageNode, CoreStorageSchema, Pager } from '../../../../../src/app/services'
import { CoreStorageServiceDI, CoreStorageServiceModule } from '../../../../../src/app/services/core-storage'
import { CoreStorageTestHelper, CoreStorageTestService } from '../../../../helpers/app'
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
    expect(pager.size).toBe(100)
    expect(pager.num).toBe(1)
    expect(pager.totalPages).toBe(3)
    expect(pager.totalItems).toBe(210)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 1, 100)

    nodes = await pager.next()
    expect(nodes.length).toBe(100)
    expect(pager.num).toBe(2)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 101, 100)

    nodes = await pager.next()
    expect(nodes.length).toBe(10)
    expect(pager.num).toBe(3)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 201, 10)
  })

  it('start + next - sizeの指定あり', async () => {
    const { tmp } = await setupNodes(110)

    // sizeを指定する
    const pager = new Pager(storageService, storageService.getDescendants, { size: 50 })

    let nodes = await pager.start({ id: tmp.id })
    expect(nodes.length).toBe(50)
    expect(pager.token).toBeDefined()
    expect(pager.size).toBe(50)
    expect(pager.num).toBe(1)
    expect(pager.totalPages).toBe(3)
    expect(pager.totalItems).toBe(110)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 1, 50)

    nodes = await pager.next()
    expect(nodes.length).toBe(50)
    expect(pager.num).toBe(2)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 51, 50)

    nodes = await pager.next()
    expect(nodes.length).toBe(10)
    expect(pager.num).toBe(3)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 101, 10)
  })

  it('startWith + next', async () => {
    const { tmp } = await setupNodes(110)

    const pager = new Pager(storageService, storageService.getDescendants, { size: 50 })

    // ページ番号を指定する
    let nodes = await pager.startWith(2, { id: tmp.id })
    expect(nodes.length).toBe(50)
    expect(pager.token).toBeDefined()
    expect(pager.size).toBe(50)
    expect(pager.num).toBe(2) // 指定されたページ番号になっている
    expect(pager.totalPages).toBe(3)
    expect(pager.totalItems).toBe(110)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 51, 50)

    nodes = await pager.next()
    expect(nodes.length).toBe(10)
    expect(pager.num).toBe(3)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 101, 10)
  })

  it('fetch', async () => {
    const { tmp } = await setupNodes(110)

    const pager = new Pager(storageService, storageService.getDescendants, { size: 50 })

    await pager.start({ id: tmp.id })

    let nodes = await pager.fetch(3)
    expect(nodes.length).toBe(10)
    expect(pager.num).toBe(3)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 101, 10)

    nodes = await pager.fetch(1)
    expect(nodes.length).toBe(50)
    expect(pager.num).toBe(1)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 1, 50)

    nodes = await pager.fetch(2)
    expect(nodes.length).toBe(50)
    expect(pager.num).toBe(2)
    expect(pager.hasNext()).toBeTruthy()
    verifyNodes(nodes, 51, 50)
  })

  it('fetch - 範囲外のページ番号を指定した場合', async () => {
    const { tmp } = await setupNodes(110)

    const pager = new Pager(storageService, storageService.getDescendants, { size: 50 })
    await pager.start({ id: tmp.id })

    // 総ページ数を検証
    expect(pager.totalPages).toBe(3)

    // 範囲外のページを指定
    const nodes = await pager.fetch(4)
    expect(nodes.length).toBe(0)
  })

  it('fetchAll', async () => {
    const { tmp } = await setupNodes(110)

    const pager = new Pager(storageService, storageService.getDescendants, { size: 50 })

    const nodes = await pager.fetchAll({ id: tmp.id })
    expect(nodes.length).toBe(110)
    expect(pager.token).toBeDefined()
    expect(pager.size).toBe(50)
    expect(pager.num).toBe(3)
    expect(pager.totalPages).toBe(3)
    expect(pager.totalItems).toBe(110)
    expect(pager.hasNext()).toBeFalsy()
    verifyNodes(nodes, 1, 110)
  })

  it('トークンを使用しない', async () => {
    // Elasticsearchの`max_result_window`の設定値を超えたノードを追加
    const { tmp } = await setupNodes(10010)

    // トークンを使用しないよう指定
    const pager = new Pager(storageService, storageService.getDescendants, { size: 5000, useToken: false })

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
