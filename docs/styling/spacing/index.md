# Spacing

## CSS クラス

本プロジェクトで定義した 0〜12 の範囲のサイズで要素にマージンまたはパディングを設定することができます。

**margin** または **padding** は`app-{property}{direction}-{size}`のフォーマットにしたがったクラスを指定することで設定できます。

`{property}`、`{direction}`、`{size}`で指定する値を以下に示します。

### property

- `m` - `margin`
- `p` - `padding`

### direction

- `t` - `margin-top` or `padding-top`
- `b` - `margin-bottom` or `padding-bottom`
- `l` - `margin-left` or `padding-left`
- `r` - `margin-right` or `padding-right`
- `x` -《`margin-left` and `margin-right`》or《`padding-left` and `padding-right`》
- `y` -《`margin-top` and `margin-bottom`》or《`padding-top` and `padding-bottom`》
- `a` - `margin` or `padding` の全方向(`top` and `right` and `bottom` and `left`)

### size

- `0〜48(偶数)` - `margin` or `padding` に `0〜48px` を設定

### CSS クラス指定例

上部にサイズ`2px`のパディングを指定

```html
<div class="app-pt-2">hello</div>
```

左右にサイズ`4px`のマージンを指定

```html
<div class="app-mx-4">hello</div>
```

全方向(`top`, `right`, `bottom`, `left`)にサイズ`20px`のマージンを指定

```html
<div class="app-ma-20">hello</div>
```
