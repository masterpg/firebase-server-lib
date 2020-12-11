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
    displayName: '一般ユーザー',
    fullName: '一般 太郎',
    disabled: false,
    customClaims: {},
  },
  {
    uid: 'app.admin',
    email: 'app.admin@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'アプリケーション管理ユーザー',
    fullName: '管理 太郎',
    disabled: false,
    customClaims: { isAppAdmin: true },
  },
  {
    uid: 'keepalive',
    email: 'keepalive@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'キープアライブユーザー',
    fullName: '生存 太郎',
    disabled: false,
    customClaims: { isAppAdmin: true, authStatus: AuthStatus.Available },
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
