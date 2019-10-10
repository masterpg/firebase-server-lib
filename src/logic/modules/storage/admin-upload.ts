import { StorageFileUploader, StorageUploadManager, UploadFileParam } from '@/logic/modules/storage/base'
import axios from 'axios'
import { gql } from '@/gql'

export class AdminStorageUploadManager extends StorageUploadManager {
  protected createUploadingFiles(files: File[]): StorageFileUploader[] {
    const result: StorageFileUploader[] = []
    for (const file of files) {
      result.push(
        new AdminStorageFileUploader({
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
    const inputs: Array<{ filePath: string; contentType: string }> = []
    for (const uploadingFile of this.uploadingFiles) {
      inputs.push({
        filePath: uploadingFile.path,
        contentType: uploadingFile.type,
      })
    }
    const signedUploadUrls = await gql.getSignedUploadUrls(inputs)

    for (let i = 0; i < this.uploadingFiles.length; i++) {
      const uploadingFile = this.uploadingFiles[i] as AdminStorageFileUploader
      uploadingFile.signedUploadUrl = signedUploadUrls[i]
    }
  }
}

class AdminStorageFileUploader extends StorageFileUploader {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(uploadParam: UploadFileParam, signedUploadUrl: string = '') {
    super(uploadParam)
    this.signedUploadUrl = signedUploadUrl
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

  signedUploadUrl: string = ''

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  execute(): Promise<void> {
    if (!this.signedUploadUrl) {
      return Promise.reject(`"signedUploadUrl" is not set.`)
    }

    return new Promise<ArrayBuffer>((resolve, reject) => {
      if (this.uploadParam.data instanceof Blob) {
        const reader = new FileReader()
        reader.onload = () => {
          resolve(reader.result as ArrayBuffer)
        }
        reader.onerror = () => {
          reject(`Error occurred reading file: "${this.path}"`)
        }
        reader.readAsArrayBuffer(this.uploadParam.data)
      } else {
        resolve(this.uploadParam.data)
      }
    })
      .then(data => {
        return axios.request({
          url: this.signedUploadUrl,
          method: 'put',
          data,
          headers: {
            'content-type': 'application/octet-stream',
          },
          onUploadProgress: progressEvent => {
            const { loaded, total } = progressEvent
            this.m_uploadedSize = loaded
            this.m_progress = loaded / total
          },
        })
      })
      .then(() => {
        this.m_completed = true
      })
      .catch(err => {
        this.m_failed = true
        throw err
      })
  }
}
