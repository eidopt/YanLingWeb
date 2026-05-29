# 电商/商城类小程序设计规范

## 设计哲学

电商小程序的核心目标是**促进转化**。设计需要：

- 制造紧迫感（限时、库存紧张、热卖）
- 建立信任（评价、销量、保障标识）
- 降低决策成本（清晰的价格、快速购买入口）
- 视觉吸引力（高质量商品图、促销氛围）

## 色彩方案

### 方案 A: 活力促销型（适合综合电商、社交电商）

```
主色:     #FF4D4F  (热情红 — 促销、行动)
辅色:     #FF7A45  (活力橙 — 强调、标签)
背景色:   #F8F8F8  (浅灰 — 页面底色)
卡片背景: #FFFFFF  (纯白 — 内容区)
主文字:   #1A1A1A  (近黑)
次文字:   #666666  (中灰)
辅助文字: #999999  (浅灰)
分割线:   #EEEEEE  (淡灰)
价格色:   #FF4D4F  (与主色一致 — 价格突出)
原价色:   #BBBBBB  (划线价)
促销标签: #FFF0F0  (浅红底)
```

### 方案 B: 品质简约型（适合品牌电商、精品商城）

```
主色:     #1A1A1A  (高级黑)
辅色:     #C9A96E  (香槟金 — 品质感)
背景色:   #F5F3EF  (暖白)
卡片背景: #FFFFFF
主文字:   #1A1A1A
次文字:   #5A5A5A
辅助文字: #999999
分割线:   #E8E4DE
价格色:   #1A1A1A
原价色:   #C0C0C0
促销标签: #FDF6EC  (浅金底)
```

## 字体规范

| 层级     | 大小  | 字重 | 用途                   |
| -------- | ----- | ---- | ---------------------- |
| 超大标题 | 48rpx | 700  | 首页 Banner 数字、价格 |
| 页面标题 | 36rpx | 600  | 页面/区块标题          |
| 商品标题 | 30rpx | 500  | 商品名称（最多 2 行）  |
| 正文     | 28rpx | 400  | 描述、详情             |
| 辅助文字 | 24rpx | 400  | 标签、时间、来源       |
| 小字     | 22rpx | 400  | 角标、提示             |
| 价格     | 40rpx | 700  | 商品价格（最突出）     |
| 价格小数 | 28rpx | 700  | 价格小数部分           |

## 间距系统

```
页面左右边距:  24rpx
卡片间距:      20rpx
卡片内边距:    24rpx
元素间距:      16rpx
紧凑间距:      8rpx
```

## 圆角规范

```
页面卡片:      16rpx
商品卡片:      12rpx
按钮:          8rpx (直角风格) 或 44rpx (胶囊)
标签:          4rpx
头像:          50% (圆形)
输入框:        8rpx
弹窗:          24rpx
```

## 核心页面模板

### 1. 首页 (pages/home/home)

结构：搜索栏 → 轮播图 → 入口宫格 → 促销区 → 商品瀑布流

```xml
<!-- pages/home/home.wxml -->
<view class="page-home">
  <!-- 搜索栏 (吸顶) -->
  <view class="search-bar">
    <t-search placeholder="搜索商品" shape="round" action="取消" bind:tap="onSearchTap" />
  </view>

  <scroll-view scroll-y class="page-scroll" bind:scrolltolower="loadMore">
    <!-- 轮播图 -->
    <view class="banner-section">
      <t-swiper
        list="{{bannerList}}"
        autoplay
        navigation="{{ { type: 'dots-bar' } }}"
        height="{{320}}"
        bind:click="onBannerClick"
      />
    </view>

    <!-- 入口宫格 (2行 x 5列) -->
    <view class="grid-section">
      <t-grid column="{{5}}" border="{{false}}">
        <t-grid-item wx:for="{{gridItems}}" wx:key="id"
          text="{{item.text}}"
          image="{{item.icon}}"
          bind:click="onGridClick"
          data-id="{{item.id}}"
        />
      </t-grid>
    </view>

    <!-- 限时秒杀区 -->
    <view class="flash-sale" wx:if="{{flashSaleItems.length}}">
      <view class="section-header">
        <view class="section-title">
          <t-icon name="flash" size="40rpx" />
          <text>限时秒杀</text>
        </view>
        <view class="countdown-wrap">
          <text class="countdown-label">距结束</text>
          <t-count-down time="{{countdownTime}}" format="HH:mm:ss" />
        </view>
        <view class="more-link" bind:tap="goFlashSale">更多 ›</view>
      </view>
      <scroll-view scroll-x class="flash-scroll">
        <view class="flash-item" wx:for="{{flashSaleItems}}" wx:key="id" bind:tap="goProduct" data-id="{{item.id}}">
          <image src="{{item.image}}" mode="aspectFill" class="flash-img" />
          <text class="flash-price">¥{{item.price}}</text>
          <text class="flash-original">¥{{item.originalPrice}}</text>
          <view class="progress-bar">
            <view class="progress-fill" style="width: {{item.soldPercent}}%"></view>
          </view>
          <text class="sold-text">已抢{{item.soldPercent}}%</text>
        </view>
      </scroll-view>
    </view>

    <!-- 推荐商品瀑布流 -->
    <view class="product-section">
      <view class="section-header">
        <text class="section-title">为你推荐</text>
      </view>
      <view class="waterfall">
        <view class="waterfall-column">
          <view class="product-card" wx:for="{{productsLeft}}" wx:key="id" bind:tap="goProduct" data-id="{{item.id}}">
            <image src="{{item.image}}" mode="widthFix" class="product-img" />
            <view class="product-info">
              <text class="product-title">{{item.title}}</text>
              <view class="product-tags">
                <t-tag wx:for="{{item.tags}}" wx:for-item="tag" wx:key="*this" theme="warning" variant="light" size="small">{{tag}}</t-tag>
              </view>
              <view class="product-bottom">
                <text class="product-price">¥{{item.price}}</text>
                <text class="product-sales">{{item.sales}}人付款</text>
              </view>
            </view>
          </view>
        </view>
        <view class="waterfall-column">
          <view class="product-card" wx:for="{{productsRight}}" wx:key="id" bind:tap="goProduct" data-id="{{item.id}}">
            <!-- 同上结构 -->
          </view>
        </view>
      </view>
    </view>

    <!-- 加载更多 -->
    <t-load-more status="{{loadStatus}}" />
  </scroll-view>
</view>
```

```css
/* pages/home/home.wxss */
.page-home {
  min-height: 100vh;
  background: #f8f8f8;
}

.search-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 16rpx 24rpx;
  background: #fff;
}

.banner-section {
  padding: 0 24rpx;
  margin-bottom: 20rpx;
}

.grid-section {
  background: #fff;
  margin: 0 24rpx 20rpx;
  border-radius: 16rpx;
  padding: 20rpx 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 24rpx 16rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.flash-sale {
  background: #fff;
  margin: 0 24rpx 20rpx;
  border-radius: 16rpx;
  padding-bottom: 24rpx;
}

.flash-scroll {
  white-space: nowrap;
  padding: 0 24rpx;
}

.flash-item {
  display: inline-block;
  width: 200rpx;
  margin-right: 16rpx;
  text-align: center;
}

.flash-img {
  width: 200rpx;
  height: 200rpx;
  border-radius: 12rpx;
}

.flash-price {
  font-size: 32rpx;
  font-weight: 700;
  color: #ff4d4f;
  display: block;
}

.flash-original {
  font-size: 22rpx;
  color: #bbb;
  text-decoration: line-through;
  display: block;
}

.progress-bar {
  height: 8rpx;
  background: #ffe0e0;
  border-radius: 4rpx;
  margin: 8rpx 0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff7a45, #ff4d4f);
  border-radius: 4rpx;
  transition: width 0.3s;
}

.sold-text {
  font-size: 20rpx;
  color: #ff4d4f;
}

.product-section {
  margin: 0 24rpx;
}

.waterfall {
  display: flex;
  gap: 16rpx;
}

.waterfall-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.product-card {
  background: #fff;
  border-radius: 12rpx;
  overflow: hidden;
}

.product-img {
  width: 100%;
  display: block;
}

.product-info {
  padding: 16rpx;
}

.product-title {
  font-size: 28rpx;
  color: #1a1a1a;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  margin-bottom: 8rpx;
}

.product-tags {
  display: flex;
  gap: 8rpx;
  margin-bottom: 12rpx;
}

.product-bottom {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.product-price {
  font-size: 36rpx;
  font-weight: 700;
  color: #ff4d4f;
}

.product-price::before {
  content: '¥';
  font-size: 24rpx;
}

.product-sales {
  font-size: 22rpx;
  color: #999;
}
```

### 2. 商品详情页 (pages/product/detail)

结构：商品图轮播 → 价格信息 → 规格选择 → 商品详情 → 底部操作栏

```xml
<!-- pages/product/detail.wxml -->
<view class="page-detail">
  <t-navbar title="商品详情" left-arrow />

  <scroll-view scroll-y class="detail-scroll">
    <!-- 商品图片轮播 -->
    <view class="product-gallery">
      <t-swiper
        list="{{product.images}}"
        navigation="{{ { type: 'fraction' } }}"
        height="{{750}}"
        bind:click="previewImage"
      />
    </view>

    <!-- 价格区 -->
    <view class="price-section">
      <view class="price-row">
        <text class="current-price">¥{{product.price}}</text>
        <text class="original-price" wx:if="{{product.originalPrice}}">¥{{product.originalPrice}}</text>
        <t-tag theme="danger" variant="light" wx:if="{{product.discount}}">{{product.discount}}</t-tag>
      </view>
      <text class="product-name">{{product.name}}</text>
      <text class="product-desc">{{product.description}}</text>
      <view class="sales-row">
        <text>已售 {{product.sales}}</text>
        <text>收藏 {{product.favorites}}</text>
      </view>
    </view>

    <!-- 规格选择入口 -->
    <view class="spec-entry" bind:tap="showSpecSheet">
      <t-cell title="已选" note="{{selectedSpec || '请选择规格'}}" arrow />
    </view>

    <!-- 配送信息 -->
    <view class="delivery-section">
      <t-cell title="配送" note="预计{{product.deliveryDate}}送达" />
      <t-cell title="运费" note="{{product.freeShipping ? '免运费' : '¥' + product.shippingFee}}" />
    </view>

    <!-- 商品评价 -->
    <view class="review-section">
      <view class="section-header">
        <text class="section-title">商品评价 ({{reviewCount}})</text>
        <view class="more-link" bind:tap="goReviews">查看全部 ›</view>
      </view>
      <view class="review-tags">
        <t-tag wx:for="{{reviewTags}}" wx:key="*this" variant="outline" size="small" bind:tap="filterReview" data-tag="{{item}}">{{item}}({{item.count}})</t-tag>
      </view>
      <view class="review-item" wx:for="{{topReviews}}" wx:key="id" wx:if="{{index < 2}}">
        <view class="review-user">
          <image src="{{item.avatar}}" class="review-avatar" mode="aspectFill" />
          <text class="review-name">{{item.username}}</text>
          <t-rate value="{{item.rating}}" size="24rpx" disabled />
        </view>
        <text class="review-text">{{item.content}}</text>
        <view class="review-images" wx:if="{{item.images.length}}">
          <image wx:for="{{item.images}}" wx:for-item="img" wx:key="*this" src="{{img}}" mode="aspectFill" class="review-img" bind:tap="previewReviewImage" data-src="{{img}}" />
        </view>
      </view>
    </view>

    <!-- 商品详情图 -->
    <view class="detail-images">
      <view class="section-header">
        <text class="section-title">图文详情</text>
      </view>
      <image wx:for="{{product.detailImages}}" wx:key="*this" src="{{item}}" mode="widthFix" class="detail-img" />
    </view>
  </scroll-view>

  <!-- 底部操作栏 -->
  <view class="bottom-bar">
    <view class="bar-icons">
      <view class="bar-icon" bind:tap="goHome">
        <t-icon name="home" size="44rpx" />
        <text>首页</text>
      </view>
      <view class="bar-icon" bind:tap="toggleFavorite">
        <t-icon name="{{isFavorite ? 'heart-filled' : 'heart'}}" size="44rpx" color="{{isFavorite ? '#ff4d4f' : ''}}" />
        <text>收藏</text>
      </view>
      <view class="bar-icon" bind:tap="goCart">
        <t-icon name="cart" size="44rpx" />
        <text>购物车</text>
        <t-badge count="{{cartCount}}" dot="{{false}}" wx:if="{{cartCount}}" />
      </view>
    </view>
    <view class="bar-buttons">
      <t-button theme="warning" size="large" bind:tap="addToCart">加入购物车</t-button>
      <t-button theme="danger" size="large" bind:tap="buyNow">立即购买</t-button>
    </view>
  </view>

  <!-- 规格选择弹窗 -->
  <t-action-sheet visible="{{specSheetVisible}}" title="选择规格" bind:close="hideSpecSheet">
    <view class="spec-sheet">
      <view class="spec-product">
        <image src="{{product.images[0]}}" class="spec-product-img" mode="aspectFill" />
        <view class="spec-product-info">
          <text class="spec-product-price">¥{{selectedPrice || product.price}}</text>
          <text class="spec-product-stock">库存: {{selectedStock || product.stock}}</text>
        </view>
      </view>
      <view class="spec-group" wx:for="{{specGroups}}" wx:key="name">
        <text class="spec-label">{{item.name}}</text>
        <view class="spec-options">
          <view
            wx:for="{{item.values}}"
            wx:for-item="val"
            wx:key="*this"
            class="spec-option {{val.selected ? 'active' : ''}} {{val.disabled ? 'disabled' : ''}}"
            bind:tap="selectSpec"
            data-group="{{item.name}}"
            data-value="{{val.name}}"
          >
            {{val.name}}
          </view>
        </view>
      </view>
      <view class="spec-quantity">
        <text class="spec-label">购买数量</text>
        <t-stepper value="{{quantity}}" min="1" max="{{selectedStock || product.stock}}" bind:change="onQuantityChange" />
      </view>
      <t-button theme="danger" block size="large" bind:tap="confirmSpec">确定</t-button>
    </view>
  </t-action-sheet>
</view>
```

```css
/* pages/product/detail.wxss */
.page-detail {
  background: #f8f8f8;
  min-height: 100vh;
}

.price-section {
  background: #fff;
  padding: 24rpx;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.current-price {
  font-size: 48rpx;
  font-weight: 700;
  color: #ff4d4f;
}

.current-price::before {
  content: '¥';
  font-size: 28rpx;
}

.original-price {
  font-size: 26rpx;
  color: #bbb;
  text-decoration: line-through;
}

.product-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8rpx;
}

.product-desc {
  font-size: 26rpx;
  color: #666;
  margin-bottom: 12rpx;
}

.sales-row {
  font-size: 24rpx;
  color: #999;
  display: flex;
  gap: 24rpx;
}

.spec-entry,
.delivery-section {
  margin-top: 20rpx;
  background: #fff;
}

.review-section {
  margin-top: 20rpx;
  background: #fff;
  padding: 24rpx;
}

.review-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.review-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #eee;
}

.review-user {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.review-avatar {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
}

.review-name {
  font-size: 26rpx;
  color: #333;
}

.review-text {
  font-size: 28rpx;
  color: #1a1a1a;
  line-height: 1.6;
}

.review-images {
  display: flex;
  gap: 12rpx;
  margin-top: 12rpx;
}

.review-img {
  width: 160rpx;
  height: 160rpx;
  border-radius: 8rpx;
}

.detail-images {
  margin-top: 20rpx;
  background: #fff;
}

.detail-img {
  width: 100%;
  display: block;
}

/* 底部操作栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 12rpx 24rpx;
  padding-bottom: calc(12rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.06);
  z-index: 200;
}

.bar-icons {
  display: flex;
  gap: 32rpx;
  margin-right: 24rpx;
}

.bar-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 20rpx;
  color: #666;
  position: relative;
}

.bar-buttons {
  flex: 1;
  display: flex;
  gap: 16rpx;
}

.bar-buttons .t-button {
  flex: 1;
  border-radius: 44rpx;
}

/* 规格弹窗 */
.spec-sheet {
  padding: 24rpx;
}

.spec-product {
  display: flex;
  gap: 20rpx;
  margin-bottom: 32rpx;
}

.spec-product-img {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
}

.spec-product-price {
  font-size: 40rpx;
  font-weight: 700;
  color: #ff4d4f;
  display: block;
}

.spec-product-stock {
  font-size: 24rpx;
  color: #999;
}

.spec-group {
  margin-bottom: 24rpx;
}

.spec-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 16rpx;
  display: block;
}

.spec-options {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.spec-option {
  padding: 12rpx 32rpx;
  background: #f5f5f5;
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #333;
}

.spec-option.active {
  background: #fff0f0;
  color: #ff4d4f;
  border: 1rpx solid #ff4d4f;
}

.spec-option.disabled {
  color: #ccc;
  background: #f9f9f9;
}

.spec-quantity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 32rpx 0;
}
```

### 3. 购物车页面

```xml
<!-- pages/cart/cart.wxml -->
<view class="page-cart">
  <t-navbar title="购物车" />

  <scroll-view scroll-y class="cart-scroll" wx:if="{{cartItems.length}}">
    <!-- 优惠提示 -->
    <view class="promo-bar" wx:if="{{promoInfo}}">
      <t-notice-bar content="{{promoInfo}}" theme="warning" />
    </view>

    <!-- 商品列表 -->
    <view class="cart-item" wx:for="{{cartItems}}" wx:key="id">
      <view class="cart-checkbox">
        <t-checkbox checked="{{item.checked}}" bind:change="toggleCheck" data-id="{{item.id}}" />
      </view>
      <image src="{{item.image}}" class="cart-img" mode="aspectFill" bind:tap="goProduct" data-id="{{item.productId}}" />
      <view class="cart-info">
        <text class="cart-title">{{item.name}}</text>
        <text class="cart-spec">{{item.spec}}</text>
        <view class="cart-bottom">
          <text class="cart-price">¥{{item.price}}</text>
          <t-stepper value="{{item.quantity}}" min="1" max="{{item.stock}}" bind:change="updateQuantity" data-id="{{item.id}}" />
        </view>
      </view>
      <view class="cart-delete" bind:tap="deleteItem" data-id="{{item.id}}">
        <t-icon name="delete" size="36rpx" color="#999" />
      </view>
    </view>
  </scroll-view>

  <!-- 空状态 -->
  <view class="empty-cart" wx:if="{{!cartItems.length}}">
    <image src="/assets/empty-cart.png" class="empty-img" mode="aspectFit" />
    <text class="empty-text">购物车还是空的</text>
    <t-button theme="primary" size="small" bind:tap="goShopping">去逛逛</t-button>
  </view>

  <!-- 底部结算栏 -->
  <view class="cart-bottom-bar" wx:if="{{cartItems.length}}">
    <view class="select-all">
      <t-checkbox checked="{{allChecked}}" bind:change="toggleAll">全选</t-checkbox>
    </view>
    <view class="settle-info">
      <view class="total-row">
        <text>合计:</text>
        <text class="total-price">¥{{totalPrice}}</text>
      </view>
      <text class="total-desc" wx:if="{{totalDiscount}}">已优惠 ¥{{totalDiscount}}</text>
    </view>
    <t-button theme="danger" size="large" disabled="{{!hasSelected}}" bind:tap="checkout">
      结算({{selectedCount}})
    </t-button>
  </view>
</view>
```

## 组件搭配建议

| 场景     | 推荐组件                      | 原因                                     |
| -------- | ----------------------------- | ---------------------------------------- |
| 商品列表 | `view` + `image` + 自定义布局 | 瀑布流需要自定义，TDesign 无现成商品卡片 |
| 分类筛选 | `t-tabs` + `t-side-bar`       | tabs 做一级分类，side-bar 做二级         |
| 搜索     | `t-search`                    | 原生支持历史记录、热门搜索               |
| 商品规格 | `t-action-sheet` + 自定义内容 | 底部弹出，体验好                         |
| 倒计时   | `t-count-down`                | 原生支持，格式灵活                       |
| 加减数量 | `t-stepper`                   | 购物车标准交互                           |
| 价格展示 | `text` + 自定义样式           | 需要大小数差异化显示                     |
| 评价星级 | `t-rate`                      | 原生支持半星、禁用                       |
| 操作确认 | `t-dialog`                    | 删除确认等场景                           |
| 轮播图   | `t-swiper`                    | 支持卡片模式、多种导航样式               |
| 提示信息 | `t-notice-bar`                | 促销提示、物流通知                       |
| 标签筛选 | `t-tag`                       | 多色、多尺寸                             |
| 分享菜单 | `t-action-sheet`              | 底部弹出操作面板                         |

## 交互要点

1. **商品卡片点击** → 进入详情页，传递商品 ID
2. **加入购物车** → 底部弹出规格选择 → 确认后添加并 toast 提示
3. **购物车滑动删除** → 左滑出现删除按钮，或使用 `t-dialog` 确认
4. **下拉刷新** → 使用 `t-pull-down-refresh` 刷新商品列表
5. **上拉加载** → `scroll-view` 的 `bind:scrolltolower` 触发分页加载
6. **图片预览** → 使用 `wx.previewImage` API 全屏预览商品图
