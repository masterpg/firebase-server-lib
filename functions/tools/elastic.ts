import * as inquirer from 'inquirer'
import { StorageService } from '../src/app/services/base/storage'
import { newElasticClient } from '../src/app/base/elastic'
import { program } from 'commander'

//========================================================================
//
//  Interfaces
//
//========================================================================

const Indices = {
  ...Object.values(StorageService.IndexNames).reduce((result, index) => {
    result[index] = StorageService.IndexMappings
    return result
  }, {} as { [index: string]: any }),
}

//========================================================================
//
//  Implementation
//
//========================================================================

/**
 * Elasticsearchのインデックスにマッピング定義を行います。
 * 既にインデックスが存在する場合は何も行われません。
 */
async function init(): Promise<void> {
  const client = newElasticClient()

  for (const index of Object.values(StorageService.IndexNames)) {
    const existsResponse = await client.indices.exists({ index })
    const exists: boolean = existsResponse.body

    if (!exists) {
      await client.indices.create({
        index,
        body: {
          mappings: StorageService.IndexMappings,
        },
      })
    }
  }
}

/**
 * 指定されたインデックスのマッピング定義をリセットします。
 * この際、既存のインデックスデータは削除されます。
 * @param index
 */
async function reset(index: string): Promise<void> {
  if (!(await confirm(`The existing index "${index}" data will be deleted, is that OK?`))) return

  const client = newElasticClient()

  const existsResponse = await client.indices.exists({ index })
  const exists: boolean = existsResponse.body

  if (exists) {
    await client.indices.delete({ index })
  }

  const mappings = Indices[index]
  if (!mappings) {
    throw new Error(`There is no mapping definition for the index "${index}".`)
  }

  await client.indices.create({
    index,
    body: {
      mappings,
    },
  })
}

//--------------------------------------------------
//  Helper methods
//--------------------------------------------------

async function confirm(message = 'Continue...'): Promise<boolean> {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message,
    },
  ])
  return answers.confirm
}

//========================================================================
//
//  Commands
//
//========================================================================

program
  .command('indices:init')
  .description(`Create an index of the application. If there is already an index, nothing is done.`)
  .action(async () => {
    await init()
  })

program
  .command('indices:reset <index>')
  .description(`Reset the index mapping definition. In doing so, the existing index data will be deleted.`)
  .action(async (index: string) => {
    await reset(index)
  })

program.parseAsync(process.argv)
