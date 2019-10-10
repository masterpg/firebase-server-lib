declare module 'testcafe-vue-selectors' {
  import { Selector } from 'testcafe'

  type SelectorParams = Parameters<Selector>

  interface VueSelector extends Selector {
    getVue(fn: (params: { props: any; state: any; computed: any; ref: any }) => any): Promise<any>
  }

  type VueSelectorResultConverter<T> = { [K in keyof T]: T[K] extends (...args: infer P) => Selector ? (...args: P) => VueSelector | any : T[K] } & {
    withText(text: string): VueSelector | any
    withText(re: RegExp): VueSelector | any
    filter(cssSelector: string): VueSelector | any
    filter(filterFn: (node: Element, idx: number) => boolean, dependencies?: { [key: string]: any }): VueSelector | any
    find(cssSelector: string): VueSelector | any
    find(filterFn: (node: Element, idx: number, originNode: Element) => boolean, dependencies?: { [key: string]: any }): VueSelector | any
    parent(): VueSelector | any
    parent(index: number): VueSelector | any
    parent(cssSelector: string): VueSelector | any
    child(): VueSelector | any
    child(index: number): VueSelector | any
    child(cssSelector: string): VueSelector | any
    sibling(): VueSelector | any
    sibling(index: number): VueSelector | any
    sibling(cssSelector: string): VueSelector | any
    nextSibling(): VueSelector | any
    nextSibling(index: number): VueSelector | any
    nextSibling(cssSelector: string): VueSelector | any
    prevSibling(): VueSelector | any
    prevSibling(index: number): VueSelector | any
    prevSibling(cssSelector: string): VueSelector | any
  }

  export default function VueSelector(...args: SelectorParams): VueSelectorResultConverter<VueSelector>
}
