import * as admin from 'firebase-admin'
import { Controller, Get, HttpStatus, NotFoundException, Param, Req, Res, UseInterceptors } from '@nestjs/common'
import { Request, Response } from 'express'
const dayjs = require('dayjs')

@Controller('storage')
export class StorageController {
  @Get('*')
  async getFile(@Req() req: Request, @Res() res: Response, @Param() params: string[]): Promise<Response> {
    const filePath = params[0]
    const bucket = admin.storage().bucket()
    const file = bucket.file(filePath)
    const exists = (await file.exists())[0]
    if (!exists) {
      return res.sendStatus(404)
    }

    const lastModified = dayjs(file.metadata.updated).toString()
    const ifModifiedSince = req.header('If-Modified-Since')
    if (lastModified === ifModifiedSince) {
      return res.sendStatus(304)
    }

    res.setHeader('Last-Modified', lastModified)
    res.setHeader('Content-Type', file.metadata.contentType)
    const fileStream = file.createReadStream()

    fileStream.pipe(res)
    return res
  }
}
