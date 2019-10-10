import { StorageFileUploader, StorageUploadManager, UploadFileParam, removeEndSlash } from '@/logic/modules/storage/base'
import { gql } from '@/gql'

export class UserStorageUploadManager extends StorageUploadManager {
  protected createUploadingFiles(files: File[]): StorageFileUploader[] {
    const result: StorageFileUploader[] = []
    for (const file of files) {
      result.push(
        new UserStorageFileUploader({
          data: file,
          name: file.name,
          dirPath: this.getUploadDirPath(file),
          type: file.type,
        })
      )
    }
    return result
  }

  protected async beforeUpload(): Promise<void> {
    const userBasePath = await gql.userStorageBasePath()
    for (const uploadingFile of this.uploadingFiles) {
      ;(uploadingFile as UserStorageFileUploader).userBasePath = userBasePath
    }
  }
}

class UserStorageFileUploader extends StorageFileUploader {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(uploadParam: UploadFileParam, userBasePath: string = '') {
    super(uploadParam)
    this.userBasePath = removeEndSlash(userBasePath)
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private m_uploadedSize: number = 0

  get uploadedSize(): number {
    return this.m_uploadedSize
  }

  private m_progress: number = 0

  get progress(): number {
    return this.m_progress
  }

  private m_completed: boolean = false

  get completed(): boolean {
    return this.m_completed
  }

  private m_failed: boolean = false

  get failed(): boolean {
    return this.m_failed
  }

  userBasePath: string = ''

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_uploadTask!: firebase.storage.UploadTask

  private m_fileRef!: firebase.storage.Reference

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  execute(): Promise<void> {
    if (!this.userBasePath) {
      return Promise.reject(`"userBasePath" is not set.`)
    }

    // アップロード先の参照を取得
    this.m_fileRef = firebase.storage().ref(`${this.userBasePath}/${this.uploadParam.dirPath}/${this.name}`)
    // アップロード実行
    this.m_uploadTask = this.m_fileRef.put(this.uploadParam.data)

    return new Promise<void>((resolve, reject) => {
      this.m_uploadTask.on(
        firebase.storage.TaskEvent.STATE_CHANGED,
        (snapshot: firebase.storage.UploadTaskSnapshot) => {
          this.m_uploadedSize = snapshot.bytesTransferred
          this.m_progress = snapshot.bytesTransferred / this.m_uploadedSize
        },
        err => {
          this.m_failed = true
          reject(err)
        },
        () => {
          this.m_completed = true
          resolve()
        }
      )
    })
  }
}
