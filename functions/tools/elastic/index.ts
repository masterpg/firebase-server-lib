import * as chalk from 'chalk'
import * as inquirer from 'inquirer'
import { ArticleTagSchema, StorageSchema, UserSchema } from '../../src/app/services'
import { newElasticClient } from '../../src/app/base/elastic'
import { program } from 'commander'

inquirer.registerPrompt('checkbox-plus', require('inquirer-checkbox-plus-prompt'))

//========================================================================
//
//  Interfaces
//
//========================================================================

const AllAliases = [
  ...Object.values(UserSchema.IndexAliases),
  ...Object.values(StorageSchema.IndexAliases),
  ...Object.values(ArticleTagSchema.IndexAliases),
]

const AllIndices = {
  ...Object.values(UserSchema.IndexAliases).reduce<{ [alias: string]: any }>((result, alias) => {
    result[alias] = UserSchema.IndexDefinition
    return result
  }, {}),
  ...Object.values(StorageSchema.IndexAliases).reduce<{ [alias: string]: any }>((result, alias) => {
    result[alias] = StorageSchema.IndexDefinition
    return result
  }, {}),
  ...Object.values(ArticleTagSchema.IndexAliases).reduce<{ [alias: string]: any }>((result, alias) => {
    result[alias] = ArticleTagSchema.IndexDefinition
    return result
  }, {}),
}

//========================================================================
//
//  Implementation
//
//========================================================================

async function getIndexNames(): Promise<string[]> {
  const client = newElasticClient()

  const response = await client.cat.indices()
  const body = (response.body as any) as string
  const indices = body.split('\n').filter(Boolean)
  return indices.reduce((result, indexInfo) => {
    const indexName = indexInfo.split(' ').filter(Boolean)[2]
    result.push(indexName)
    return result
  }, [] as string[])
}

/**
 * Elasticsearchのインデックスにマッピング定義を行います。
 * 既にインデックスが存在する場合は何も行われません。
 */
async function init(): Promise<void> {
  console.log() // 改行

  const client = newElasticClient()

  for (const alias of AllAliases) {
    const res = await client.indices.existsAlias({ name: alias })
    const exists: boolean = res.body
    if (exists) {
      console.log(`${alias}: exists`)
      continue
    }

    const index = `${alias}-1`
    await client.indices.create({
      index,
      body: {
        ...AllIndices[alias],
      },
    })

    await client.indices.putAlias({ index, name: alias })
    console.log(`${alias}: created`)
  }

  console.log() // 改行
}

/**
 * 再インデックスを行います。
 * @param alias 再インデックスを行うインデックスのエイリアスを指定
 */
async function reindex(alias: string): Promise<void> {
  const indexDefinition = AllIndices[alias]
  if (!indexDefinition) {
    throw new Error(`Could not find the index definition corresponding to the specified alias '${alias}'.`)
  }

  const client = newElasticClient()

  // 指定されたエイリアスに対応するインデックスが存在するか検証
  const res1 = await client.indices.existsAlias({ name: alias })
  const exists = res1.body as boolean
  if (!exists) return

  // 指定されたエイリアスにひも付くインデックス名リストを取得
  const res2 = await client.indices.getAlias({ name: alias })
  const aliases = res2.body as { [index: string]: { aliases: any[] } }[]
  const indexNames = Object.keys(aliases)

  // 取得したインデックス名リストの中で最も大きな連番を取得
  let max = 0
  for (const index of indexNames) {
    const execArray = index.match(new RegExp(`${alias}-(\\d+)$`))
    if (execArray) {
      const num = parseInt(execArray[1])
      max < num && (max = num)
    }
  }

  // 再インデックスを格納するための新しいインデックスを作成
  const newIndexName = `${alias}-${max + 1}`
  console.log(`\n${chalk.green(`Creating a new index '${newIndexName}' ...`)}`)
  try {
    await client.indices.create({
      index: newIndexName,
      body: {
        ...indexDefinition,
      },
    })
  } catch (err) {
    console.log(`\n${chalk.bgRed('Create index error')}: ${chalk.red(JSON.stringify(err.body.error, null, 2))}\n`)
    return
  }

  // 新しいインデックスに再インデックスを実行
  console.log(`\n${chalk.green(`Reindexing from '${alias}' to '${newIndexName}' ...`)}`)
  try {
    await client.reindex({
      body: {
        source: { index: alias },
        dest: { index: newIndexName },
      },
    })
  } catch (err) {
    console.log(`\n${chalk.bgRed('Reindex error')}: ${chalk.red(JSON.stringify(err.meta.body, null, 2))}\n`)
    if (await confirm(`Do you want to delete '${newIndexName}' when the reindex fails?`)) {
      await client.indices.delete({ index: newIndexName })
    }
    return
  }

  // 新しいインデックスにエイリアスを設定
  try {
    const actions = [] as any[]
    for (const indexName of indexNames) {
      actions.push({
        remove: { index: indexName, alias },
      })
    }
    actions.push({
      add: { index: newIndexName, alias },
    })
    await client.indices.updateAliases({ body: { actions } })
  } catch (err) {
    console.error(err)
    return
  }

  // 古いインデックスを削除
  console.log('')
  const answers = await inquirer.prompt([
    {
      type: 'checkbox-plus',
      name: 'indices',
      message: 'If you want to delete the old indices, select the following:',
      highlight: true,
      source: () => {
        return new Promise(resolve => {
          return resolve(indexNames)
        })
      },
    },
  ])
  const deleteIndices = answers.indices as string[]
  if (deleteIndices.length) {
    try {
      await client.indices.delete({ index: deleteIndices })
    } catch (err) {
      console.error(err)
      return
    }
  }

  console.log(chalk.green('\ncompleted'))
}

/**
 * 再インデックス中のタスクをキャンセルします。
 */
async function cancelReindex(): Promise<void> {
  const client = newElasticClient()

  const res = await client.tasks.list({
    detailed: true,
    actions: '*reindex',
  })

  if (!res.body.nodes.tasks) {
    console.log(chalk.green('\nThere were no tasks being reindexed.\n'))
    return
  }

  const tasks = [] as any[]
  for (const taskId of Object.keys(res.body.nodes.tasks)) {
    const task = res.body.nodes.tasks[taskId]
    tasks.push(` {\n   "task_id": "${task.task_id}",\n   "action": "${task.action}",\n   "description": "${task.description}"\n }`)
  }

  // const resTasks: any = [
  //   {
  //     task_id: 'xHjiwThTR1CoDYYgSrOu2Q:22076',
  //     // task_id: 'id0001',
  //     action: 'indices:data/write/reindex',
  //     description: 'reindex from [kibana_sample_data_ecommerce] to [my_reindex][_doc]',
  //   },
  //   {
  //     task_id: 'xHjiwThTR1CoDYYgSrOu2Q:22077',
  //     action: 'indices:data/write/reindex',
  //     description: 'reindex from [kibana_sample_data_ecommerce] to [my_reindex][_doc]',
  //   },
  // ]
  //
  // const tasks = [] as any[]
  // for (const taskId of Object.keys(resTasks)) {
  //   const task = resTasks[taskId]
  //   tasks.push(` {\n   "task_id": "${task.task_id}",\n   "action": "${task.action}",\n   "description": "${task.description}"\n }`)
  // }

  console.log('') // 改行
  const answers = await inquirer.prompt([
    {
      type: 'checkbox-plus',
      name: 'tasks',
      message: 'Select the task you want to cancel:',
      highlight: true,
      pageSize: Number.MAX_SAFE_INTEGER,
      source: () => {
        return new Promise(resolve => {
          return resolve(tasks)
        })
      },
    },
  ])

  const taskIds: string[] = answers.tasks.map((taskStr: string) => {
    return JSON.parse(taskStr).task_id
  })

  try {
    await Promise.all(
      taskIds.map(async task_id => {
        await client.tasks.cancel({
          task_id,
          wait_for_completion: true,
        })
      })
    )
  } catch (err) {
    console.log(`\n${chalk.bgRed('Reindex cancel error')}: ${chalk.red(JSON.stringify(err.meta.body.error, null, 2))}\n`)
    return
  }

  console.log(chalk.green('\ncompleted'))
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
  .command('init')
  .description(`Create an index of the application. If there is already an index, nothing is done.`)
  .action(async () => {
    await init()
  })

program
  .command('reindex <alias>')
  .description(`Create an index with the latest index definition and reindex it here.`)
  .action(async (alias: string) => {
    await reindex(alias)
  })

program
  .command('reindex:cancel')
  .description(`Cancels a running reindex.`)
  .action(async () => {
    await cancelReindex()
  })

program.parseAsync(process.argv)
