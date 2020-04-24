import * as functions from 'firebase-functions'
import { FunctionsEventDI, FunctionsEventServiceModule } from '../services'
import { createNestApplication } from '../base'

const authOnCreateUser = functions.auth.user().onCreate(async (user, context) => {
  const nestApp = await createNestApplication(FunctionsEventServiceModule)
  const functionsEvent = nestApp.get(FunctionsEventDI.symbol) as FunctionsEventDI.type
  await functionsEvent.authOnCreateUser(user, context)
})
export default authOnCreateUser
