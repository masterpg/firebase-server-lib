import { GQLStorageNode, gql } from '@/gql'
import { StorageNode, StorageNodeBag } from '@/logic/types'

/**
 * `GQLStorageNode`を`StorageNode`へ変換します。
 * @param gqlNode
 */
export function toStorageNode(gqlNode: GQLStorageNode): StorageNode {
  return {
    nodeType: gqlNode.nodeType,
    name: gqlNode.name,
    dir: gqlNode.dir,
    path: gqlNode.path,
    children: [],
  }
}

/**
 * `GQLStorageNode`の配列を`StorageNodeBag`へ変換します。
 * @param gqlNodes
 */
export function toStorageNodeBag(gqlNodes: GQLStorageNode[]): StorageNodeBag {
  const bag = { list: [], map: {} } as StorageNodeBag

  for (const gqlNode of gqlNodes) {
    const node = toStorageNode(gqlNode)
    bag.list.push(node)
    bag.map[node.path] = node
  }

  for (const node of bag.list) {
    const parent = bag.map[node.dir]
    if (parent) {
      parent.children.push(node)
      node.parent = parent
    }
  }

  return bag
}

/**
 * パス末尾のスラッシュを除去します。
 * @param nodePath
 */
export function removeEndSlash(nodePath?: string): string {
  if (!nodePath) return ''
  return nodePath.replace(/\/$/, '')
}

/**
 * アップロードファイルの情報です。
 */
export interface UploadFileParam {
  data: Blob | Uint8Array | ArrayBuffer | File
  name: string
  dirPath: string
  type?: string
}

/**
 * アップロードの管理を行うマネージャクラスです。
 */
export abstract class StorageUploadManager {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(owner: Element) {
    this.m_uploadFileInput = document.createElement('input')
    this.m_uploadFileInput.style.display = 'none'
    this.m_uploadFileInput.setAttribute('type', 'file')
    this.m_uploadFileInput.addEventListener('change', this.m_uploadFileInputOnChange.bind(this))
    owner.appendChild(this.m_uploadFileInput)
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private m_uploadingFiles: StorageFileUploader[] = []

  /**
   * アップロード中のファイルです。
   */
  get uploadingFiles(): StorageFileUploader[] {
    return this.m_uploadingFiles
  }

  /**
   * アップロード対象のファイル数です。
   */
  get totalUploadCount(): number {
    return this.uploadingFiles.length
  }

  /**
   * アップロードされたファイル数です。
   */
  get uploadedCount(): number {
    return this.uploadingFiles.reduce((result, file) => {
      result += file.completed ? 1 : 0
      return result
    }, 0)
  }

  /**
   * アップロード対象となる全ファイルのバイト数です。
   */
  get totalUploadSize(): number {
    return this.uploadingFiles.reduce((result, file) => {
      result += file.size
      return result
    }, 0)
  }

  /**
   * アップロード対象となる全ファイルでアップロードされたバイト数です。
   */
  get uploadedSize(): number {
    return this.uploadingFiles.reduce((result, file) => {
      result += file.uploadedSize
      return result
    }, 0)
  }

  /**
   * アップロードの進捗率です。
   */
  get progress(): number {
    if (this.uploadedSize === 0) return 0
    return this.uploadedSize / this.totalUploadSize
  }

  private m_uploading = false

  /**
   * アップロード中を表すフラグです。
   */
  get uploading(): boolean {
    return this.m_uploading
  }

  /**
   * アップロードの完了を表すフラグです。
   */
  get completed(): boolean {
    for (const file of this.uploadingFiles) {
      if (!file.completed) {
        return false
      }
    }
    return true
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected uploadBasePath: string = ''

  private m_uploadFileInput!: HTMLInputElement

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * 状態をクリアします。
   */
  clear(): void {
    this.m_uploadFileInput.value = ''
    this.m_uploadingFiles.splice(0)
    this.uploadBasePath = ''
    this.m_uploading = false
  }

  /**
   * OSのファイル選択ダイアログを表示します。
   * @param uploadBasePath
   */
  openFilesSelectDialog(uploadBasePath: string): void {
    this.m_openFileSelectDialog(uploadBasePath, false)
  }

  /**
   * OSのフォルダ選択ダイアログを表示します。
   * @param uploadBasePath
   */
  openDirSelectDialog(uploadBasePath: string): void {
    this.m_openFileSelectDialog(uploadBasePath, true)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  protected abstract createUploadingFiles(files: File[]): StorageFileUploader[]

  protected abstract beforeUpload(): Promise<void>

  /**
   * 指定されたファイルのディレクトリ構造をもとにアップロード先のディレクトリを取得します。
   * @param file
   */
  protected getUploadDirPath(file: File): string {
    let result = this.uploadBasePath
    if ((file as any).webkitRelativePath) {
      const relativePathSegments = (file as any).webkitRelativePath.split('/')
      const relativePath = relativePathSegments.slice(0, relativePathSegments.length - 1).join('/')
      result = `${result}/${relativePath}`
    }
    return result
  }

  private m_openFileSelectDialog(uploadBasePath: string, isDir: boolean): void {
    this.m_uploadFileInput.value = ''
    this.uploadBasePath = removeEndSlash(uploadBasePath)

    if (isDir) {
      this.m_uploadFileInput.setAttribute('webkitdirectory', '')
    } else {
      this.m_uploadFileInput.removeAttribute('webkitdirectory')
    }

    const event = document.createEvent('MouseEvents')
    event.initEvent('click', true, false)
    this.m_uploadFileInput.dispatchEvent(event)
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private async m_uploadFileInputOnChange(e) {
    const files: File[] = Array.from(e.target!.files)
    if (files.length === 0) {
      return
    }

    // ファイルアップローダーを作成(まだアップロードは実行しない)
    this.m_uploadingFiles.push(...this.createUploadingFiles(files))

    // ファイルアップローダー配列をソート
    this.m_uploadingFiles.sort((a, b) => {
      if (a.completed && !b.completed) {
        return 1
      } else if (!a.completed && b.completed) {
        return -1
      }

      if (a.name < b.name) {
        return -1
      } else if (a.name > b.name) {
        return 1
      } else {
        return 0
      }
    })

    // 状態をアップロード中に設定
    this.m_uploading = files.length > 0

    // アップロード前処理を実行
    await this.beforeUpload()

    // アップロード先のディレクトリを作成
    const createdDirPaths = this.m_uploadingFiles.reduce<string[]>((result, item) => {
      if (item.dirPath) {
        result.push(`${item.dirPath}/`)
      }
      return result
    }, [])
    if (createdDirPaths.length > 0) {
      await gql.createUserStorageDirs(createdDirPaths)
    }

    // 実際にアップロードを実行
    for (const uploadingFile of this.m_uploadingFiles) {
      if (uploadingFile.completed) continue
      uploadingFile.execute().catch(err => {
        console.error(err)
      })
    }
  }
}

/**
 * ファイルアップローダーの基底クラスです。
 */
export abstract class StorageFileUploader {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(uploadParam: UploadFileParam) {
    this.uploadParam = uploadParam
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  abstract readonly uploadedSize: number

  abstract readonly progress: number

  abstract readonly completed: boolean

  abstract readonly failed: boolean

  get name(): string {
    return this.uploadParam.name
  }

  get dirPath(): string {
    return this.uploadParam.dirPath
  }

  get path(): string {
    return `${removeEndSlash(this.uploadParam.dirPath)}/${this.name}`
  }

  get size(): number {
    if (this.uploadParam.data instanceof File || this.uploadParam.data instanceof Blob) {
      return this.uploadParam.data.size
    } else {
      return this.uploadParam.data.byteLength
    }
  }

  get type(): string {
    return this.uploadParam.type || ''
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected uploadParam: UploadFileParam

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  abstract execute(): Promise<void>
}
