import * as functions from 'firebase-functions'
import { FunctionsEventDI, FunctionsEventServiceModule } from '../services'
import { config } from '../../config'
import { createNestApplication } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

const authOnCreateUser = functions
  .region(config.functions.region)
  .auth.user()
  .onCreate(async (user, context) => {
    const nestApp = await createNestApplication(FunctionsEventServiceModule)
    const functionsEvent = nestApp.get(FunctionsEventDI.symbol) as FunctionsEventDI.type
    await functionsEvent.authOnCreateUser(user, context)
  })

//========================================================================
//
//  Exports
//
//========================================================================

export default authOnCreateUser
