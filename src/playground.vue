<style lang="stylus" scoped>
@import './styles/app.variables.styl'

.hello-world-color {
  color: $indigo-12
}
</style>

<template>
  <q-card class="layout vertical app-pa-20" :class="{ 'app-ma-48': screenSize.pc, 'app-ma-24': screenSize.tab, 'app-ma-12': screenSize.sp }">
    <div class="hello-world-color">{{ $t('hello', { today: $d(new Date(), 'short') }) }}</div>
    <div class="layout horizontal end-justified app-mt-10">
      <q-btn color="primary" label="Sleep" @click="m_sleepButtonOnClick" />
    </div>
  </q-card>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component } from 'vue-property-decorator'
import { mixins } from 'vue-class-component'

@Component({ name: 'playground-page' })
export default class PlaygroundPage extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private async m_sleep(ms: number): Promise<string> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(`I slept for ${ms} ms.`)
      }, ms)
    }) as Promise<string>
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private async m_sleepButtonOnClick() {
    alert(await this.m_sleep(1000))
  }
}
</script>

<i18n>
en:
  hello: "Hello World! Today is {today}."
ja:
  hello: "こんにちは、世界！ 今日は {today} です。"
</i18n>
