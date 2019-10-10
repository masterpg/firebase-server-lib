<style lang="stylus" scoped></style>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Watch } from 'vue-property-decorator'
import { mixins } from 'vue-class-component'

@Component({
  name: 'storage-dir-list',
  components: {},
})
export default class StorageDirList extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------
}
</script>
