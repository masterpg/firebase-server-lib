import { Component } from 'vue-property-decorator'
import { NoCache } from '@/base/decorators'
import { ResizableMixin } from '@/components/resizable-mixin'
import Vue from 'vue'

/**
 * コンポーネントの基底クラスです。
 */
@Component
class BaseComponent extends Vue {}

/**
 * Mixinのサンプルです。
 * @param superclass
 */
export const SampleMixin = <T extends new (...args: any[]) => {}>(superclass: T) =>
  class extends superclass {
    constructor(...args: any[]) {
      super(args)
    }
  }

export { BaseComponent, NoCache, ResizableMixin }
