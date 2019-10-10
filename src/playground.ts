import '@quasar/extras/roboto-font/roboto-font.css'
import '@quasar/extras/material-icons/material-icons.css'

import '@/index.styl'

import { QBtn, QCard, QCardActions, QCardSection, Quasar } from 'quasar'
import { i18n, initI18n } from '@/base/i18n'
import PlaygroundPage from '@/playground.vue'
import Vue from 'vue'

Vue.use(Quasar, {
  config: {},
  components: {
    QBtn,
    QCard,
    QCardActions,
    QCardSection,
  },
  directives: {},
  plugins: {},
})

Vue.use(Quasar, {
  config: {},
})

async function init() {
  await initI18n()

  new Vue({
    el: '#app',
    render: h => h(PlaygroundPage),
    i18n,
  })
}
init()
