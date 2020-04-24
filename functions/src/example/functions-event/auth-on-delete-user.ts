import * as functions from 'firebase-functions'
import { FunctionsEventDI, FunctionsEventServiceModule } from '../services'
import { createNestApplication } from '../base'

const authOnDeleteUser = functions.auth.user().onDelete(async (user, context) => {
  const nestApp = await createNestApplication(FunctionsEventServiceModule)
  const functionsEvent = nestApp.get(FunctionsEventDI.symbol) as FunctionsEventDI.type
  await functionsEvent.authOnDeleteUser(user, context)
})
export default authOnDeleteUser
