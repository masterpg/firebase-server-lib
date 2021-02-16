import * as chalk from 'chalk'
import * as program from 'commander'
import { AuthStatus, DevUtilsServiceDI, DevUtilsServiceModule, TestUserInput } from '../src/app/services'
import { createNestApplication, initFirebaseApp } from '../src/app/base'

const users: TestUserInput[] = [
  {
    uid: 'general',
    email: 'general@example.com',
    emailVerified: true,
    password: 'passpass',
    userName: 'general',
    fullName: '一般 太郎',
    disabled: false,
  },
  {
    uid: 'app.admin',
    email: 'app.admin@example.com',
    emailVerified: true,
    password: 'passpass',
    userName: 'app.admin',
    fullName: '管理 太郎',
    disabled: false,
    isAppAdmin: true,
  },
  {
    uid: 'keepalive',
    email: 'keepalive@example.com',
    emailVerified: true,
    password: 'passpass',
    userName: 'keepalive',
    fullName: '生存 太郎',
    disabled: false,
    authStatus: 'Available',
    isAppAdmin: true,
  },
]

program
  .command('test-users')
  .description('setting up test users')
  .action(async () => {
    initFirebaseApp()
    const nestApp = await createNestApplication(DevUtilsServiceModule)
    const devUtilsService = nestApp.get(DevUtilsServiceDI.symbol) as DevUtilsServiceDI.type
    await devUtilsService.setTestUsers(...users)
    console.log(chalk.green(`\nThe test users have been successfully set up. Press 'Ctrl+C' to exit.`))
  })

program.parseAsync(process.argv)
