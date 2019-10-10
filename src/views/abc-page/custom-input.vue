<style lang="stylus" scoped></style>

<template>
  <div>
    <q-input v-model="m_computedValue" outlined dense />
  </div>
</template>

<script lang="ts">
import { Component, Prop, Watch } from 'vue-property-decorator'
import { BaseComponent } from '@/components'
import { mixins } from 'vue-class-component'

@Component({ name: 'custom-input' })
export default class CustomInput extends mixins(BaseComponent) {
  @Prop({ default: '' })
  private value!: string

  private m_value = ''

  private get m_computedValue(): string {
    return this.m_value
  }

  private set m_computedValue(value: string) {
    this.m_value = value
    // ■ コンポーネントでv-modelを使う
    //    https://jp.vuejs.org/v2/guide/components.html#コンポーネントで-v-model-を使う
    // ・`value`というプロパティ名はv-modelで使用される特別な名前である。
    // ・`input`というイベントはv-modelで使用される特別なイベントである。
    // ・`value`プロパティの値は直接変更できない。例: this.value = 'hoge'
    // ・`value`プロパティの値を変更するには`input`イベントに新しい値を設定してイベントを発火する必要がある。
    this.$emit('input', value)
  }

  @Watch('value', { immediate: true })
  private m_valueChanged(newValue: string, oldValue: string) {
    this.m_value = newValue
  }
}
</script>
