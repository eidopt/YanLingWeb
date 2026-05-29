# 本地生活/服务类小程序设计规范

## 设计哲学

本地生活小程序的核心是**连接线上与线下**。设计需要：

- 地理位置优先（距离、位置感知是核心信息）
- 信任与真实（门店实拍、真实评价、资质展示）
- 流程清晰（预约、下单、到店的每一步都要明确）
- 时间敏感（营业状态、排队情况、预约时间）

## 色彩方案

### 方案 A: 餐饮美食型

```
主色:     #FF6B35  (食欲橙)
辅色:     #FFB800  (温暖黄)
强调色:   #E84427  (辣红 — 促销/热门)
背景色:   #F7F5F2  (暖米白)
卡片背景: #FFFFFF
主文字:   #2D2D2D
次文字:   #666666
辅助文字: #999999
分割线:   #F0EDE8
营业中:   #52C41A  (绿)
休息中:   #999999  (灰)
```

### 方案 B: 生活服务型（美容、家政、维修等）

```
主色:     #2196F3  (信赖蓝)
辅色:     #00BCD4  (清新青)
强调色:   #FF5722  (行动橙)
背景色:   #F5F7FA  (冷灰白)
卡片背景: #FFFFFF
主文字:   #1A1A1A
次文字:   #5A5A5A
辅助文字: #999999
分割线:   #EBEEF5
```

### 方案 C: 到店消费型（超市、便利店、药店）

```
主色:     #07C160  (微信绿 — 熟悉感、信任)
辅色:     #57BE6A  (浅绿)
强调色:   #FA5151  (紧急红)
背景色:   #F6F6F6
卡片背景: #FFFFFF
主文字:   #1A1A1A
次文字:   #666666
辅助文字: #999999
分割线:   #E5E5E5
```

## 字体规范

| 层级        | 大小  | 字重 | 用途                |
| ----------- | ----- | ---- | ------------------- |
| 门店名称    | 34rpx | 600  | 列表/详情中的门店名 |
| 菜品/服务名 | 30rpx | 500  | 菜品、服务项目名称  |
| 正文        | 28rpx | 400  | 描述、地址、说明    |
| 辅助信息    | 24rpx | 400  | 距离、销量、标签    |
| 小字        | 22rpx | 400  | 时间、备注          |
| 价格        | 36rpx | 700  | 价格数字            |
| 评分        | 28rpx | 600  | 评分数字            |

## 核心页面模板

### 1. 首页 (pages/home/home)

结构：定位栏 → 搜索 → 分类入口 → 推荐门店/服务列表

```xml
<!-- pages/home/home.wxml -->
<view class="page-home">
  <!-- 顶部定位栏 -->
  <view class="location-bar">
    <view class="location-info" bind:tap="chooseLocation">
      <t-icon name="location" size="36rpx" />
      <text class="location-text">{{city || '定位中...'}}</text>
      <t-icon name="chevron-down" size="28rpx" />
    </view>
    <t-search placeholder="搜索门店、服务" shape="round" bind:tap="goSearch" />
  </view>

  <scroll-view scroll-y class="page-scroll" refresher-enabled bind:refresherrefresh="onRefresh" refresher-triggered="{{refreshing}}">
    <!-- 分类宫格 -->
    <view class="category-section">
      <t-grid column="{{4}}" border="{{false}}">
        <t-grid-item wx:for="{{categories}}" wx:key="id"
          text="{{item.name}}"
          image="{{item.icon}}"
          bind:click="goCategory"
          data-id="{{item.id}}"
        />
      </t-grid>
    </view>

    <!-- 横幅广告 -->
    <view class="banner-section" wx:if="{{banner}}">
      <image src="{{banner.image}}" mode="widthFix" class="banner-img" bind:tap="onBannerClick" />
    </view>

    <!-- 附近推荐 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">附近推荐</text>
        <t-tabs value="{{nearbyTab}}" bind:change="onNearbyTabChange" theme="tag" size="small">
          <t-tab-panel label="距离最近" value="distance" />
          <t-tab-panel label="好评优先" value="rating" />
          <t-tab-panel label="人气最高" value="popular" />
        </t-tabs>
      </view>

      <!-- 门店列表 -->
      <view class="store-card" wx:for="{{nearbyStores}}" wx:key="id" bind:tap="goStore" data-id="{{item.id}}">
        <image src="{{item.cover}}" class="store-cover" mode="aspectFill" />
        <view class="store-info">
          <view class="store-name-row">
            <text class="store-name">{{item.name}}</text>
            <view class="store-status {{item.isOpen ? 'open' : 'closed'}}">
              {{item.isOpen ? '营业中' : '已休息'}}
            </view>
          </view>
          <view class="store-meta">
            <t-rate value="{{item.rating}}" size="20rpx" disabled />
            <text class="store-rating">{{item.rating}}</text>
            <text class="store-sales">月售{{item.monthlySales}}</text>
            <text class="store-distance">{{item.distance}}</text>
          </view>
          <view class="store-tags">
            <t-tag wx:for="{{item.tags}}" wx:for-item="tag" wx:key="*this" size="small" variant="light" theme="primary">{{tag}}</t-tag>
          </view>
          <view class="store-bottom">
            <text class="store-address" wx:if="{{item.address}}">{{item.address}}</text>
            <text class="delivery-info" wx:if="{{item.deliveryTime}}">约{{item.deliveryTime}}分钟</text>
          </view>
        </view>
      </view>
    </view>

    <t-load-more status="{{loadStatus}}" />
  </scroll-view>
</view>
```

```css
/* pages/home/home.wxss */
.page-home {
  min-height: 100vh;
  background: #f7f5f2;
}

.location-bar {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 24rpx;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 100;
}

.location-info {
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex-shrink: 0;
}

.location-text {
  font-size: 28rpx;
  font-weight: 500;
  color: #2d2d2d;
  max-width: 120rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-section {
  background: #fff;
  margin: 20rpx 24rpx;
  border-radius: 16rpx;
  padding: 20rpx 0;
}

.banner-section {
  padding: 0 24rpx;
  margin-bottom: 20rpx;
}

.banner-img {
  width: 100%;
  border-radius: 12rpx;
}

.section {
  margin: 0 24rpx 20rpx;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #2d2d2d;
}

.store-card {
  display: flex;
  gap: 20rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.store-cover {
  width: 200rpx;
  height: 200rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.store-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.store-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.store-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #2d2d2d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-status {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  flex-shrink: 0;
}

.store-status.open {
  color: #52c41a;
  background: #f0fff0;
}

.store-status.closed {
  color: #999;
  background: #f5f5f5;
}

.store-meta {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 8rpx 0;
}

.store-rating {
  font-size: 26rpx;
  font-weight: 600;
  color: #ff6b35;
}

.store-sales,
.store-distance {
  font-size: 24rpx;
  color: #999;
}

.store-tags {
  display: flex;
  gap: 8rpx;
  margin: 8rpx 0;
}

.store-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.store-address {
  font-size: 24rpx;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.delivery-info {
  font-size: 24rpx;
  color: #ff6b35;
  font-weight: 500;
  flex-shrink: 0;
}
```

### 2. 门店详情页 (pages/store/detail)

```xml
<!-- pages/store/detail.wxml -->
<view class="page-store">
  <t-navbar title="{{store.name}}" left-arrow />

  <scroll-view scroll-y class="store-scroll">
    <!-- 门店封面 -->
    <view class="store-header">
      <image src="{{store.cover}}" mode="aspectFill" class="store-cover-full" />
      <view class="store-overlay">
        <text class="store-name">{{store.name}}</text>
        <view class="store-brief">
          <t-rate value="{{store.rating}}" size="24rpx" disabled />
          <text>{{store.rating}}分</text>
          <text>|</text>
          <text>月售{{store.monthlySales}}</text>
          <text>|</text>
          <text>{{store.distance}}</text>
        </view>
      </view>
    </view>

    <!-- 营业信息 -->
    <view class="info-card">
      <t-cell title="营业时间" note="{{store.businessHours}}" />
      <t-cell title="地址" note="{{store.address}}" arrow bind:click="openLocation" />
      <t-cell title="电话" note="{{store.phone}}" arrow bind:click="callPhone" />
    </view>

    <!-- 服务/菜品分类 -->
    <view class="menu-section">
      <view class="menu-sidebar">
        <scroll-view scroll-y class="sidebar-scroll">
          <view
            wx:for="{{menuCategories}}"
            wx:key="id"
            class="sidebar-item {{item.id === activeCategory ? 'active' : ''}}"
            bind:tap="switchCategory"
            data-id="{{item.id}}"
          >
            <text>{{item.name}}</text>
            <t-badge count="{{item.count}}" wx:if="{{item.count}}" />
          </view>
        </scroll-view>
      </view>
      <view class="menu-content">
        <scroll-view scroll-y class="content-scroll" scroll-into-view="{{scrollToId}}">
          <view wx:for="{{menuCategories}}" wx:key="id" id="cat-{{item.id}}">
            <view class="menu-category-title">{{item.name}}</view>
            <view class="menu-item" wx:for="{{item.items}}" wx:for-item="menuItem" wx:key="id">
              <image src="{{menuItem.image}}" class="menu-item-img" mode="aspectFill" />
              <view class="menu-item-info">
                <text class="menu-item-name">{{menuItem.name}}</text>
                <text class="menu-item-desc">{{menuItem.description}}</text>
                <view class="menu-item-bottom">
                  <view class="menu-item-price">
                    <text class="price-symbol">¥</text>
                    <text class="price-num">{{menuItem.price}}</text>
                    <text class="price-original" wx:if="{{menuItem.originalPrice}}">¥{{menuItem.originalPrice}}</text>
                  </view>
                  <t-stepper value="{{menuItem.quantity}}" min="0" bind:change="onQuantityChange" data-id="{{menuItem.id}}" />
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 评价区 -->
    <view class="review-section">
      <view class="section-header">
        <text class="section-title">用户评价</text>
        <view class="more-link" bind:tap="goReviews">查看全部 ›</view>
      </view>
      <view class="review-summary">
        <text class="review-score">{{store.rating}}</text>
        <view class="review-bars">
          <view class="review-bar-item" wx:for="{{reviewDistribution}}" wx:key="label">
            <text class="bar-label">{{item.label}}</text>
            <view class="bar-track">
              <view class="bar-fill" style="width: {{item.percent}}%"></view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </scroll-view>

  <!-- 底部购物车栏 -->
  <view class="cart-bar" wx:if="{{cartCount > 0}}">
    <view class="cart-icon-wrap" bind:tap="toggleCartSheet">
      <t-icon name="cart" size="48rpx" />
      <t-badge count="{{cartCount}}" />
    </view>
    <view class="cart-total">
      <text class="cart-total-price">¥{{cartTotal}}</text>
      <text class="cart-total-desc">另需配送费¥{{store.deliveryFee}}</text>
    </view>
    <t-button theme="danger" size="large" bind:tap="goCheckout">去结算</t-button>
  </view>
</view>
```

### 3. 预约页面 (pages/booking/booking)

```xml
<!-- pages/booking/booking.wxml -->
<view class="page-booking">
  <t-navbar title="预约服务" left-arrow />

  <scroll-view scroll-y class="booking-scroll">
    <!-- 服务项目 -->
    <view class="booking-card">
      <text class="card-title">选择服务</text>
      <view class="service-list">
        <view
          wx:for="{{services}}"
          wx:key="id"
          class="service-item {{item.selected ? 'active' : ''}}"
          bind:tap="selectService"
          data-id="{{item.id}}"
        >
          <image src="{{item.image}}" class="service-img" mode="aspectFill" />
          <view class="service-info">
            <text class="service-name">{{item.name}}</text>
            <text class="service-duration">约{{item.duration}}分钟</text>
          </view>
          <text class="service-price">¥{{item.price}}</text>
        </view>
      </view>
    </view>

    <!-- 选择日期 -->
    <view class="booking-card">
      <text class="card-title">选择日期</text>
      <scroll-view scroll-x class="date-scroll">
        <view
          wx:for="{{dates}}"
          wx:key="date"
          class="date-item {{item.selected ? 'active' : ''}} {{item.disabled ? 'disabled' : ''}}"
          bind:tap="selectDate"
          data-date="{{item.date}}"
        >
          <text class="date-weekday">{{item.weekday}}</text>
          <text class="date-day">{{item.day}}</text>
          <text class="date-month">{{item.month}}月</text>
        </view>
      </scroll-view>
    </view>

    <!-- 选择时间 -->
    <view class="booking-card">
      <text class="card-title">选择时间</text>
      <view class="time-grid">
        <view
          wx:for="{{timeSlots}}"
          wx:key="time"
          class="time-item {{item.selected ? 'active' : ''}} {{item.disabled ? 'disabled' : ''}}"
          bind:tap="selectTime"
          data-time="{{item.time}}"
        >
          {{item.time}}
        </view>
      </view>
    </view>

    <!-- 选择技师/服务员 -->
    <view class="booking-card" wx:if="{{staffList.length}}">
      <text class="card-title">选择技师</text>
      <scroll-view scroll-x class="staff-scroll">
        <view
          wx:for="{{staffList}}"
          wx:key="id"
          class="staff-item {{item.selected ? 'active' : ''}}"
          bind:tap="selectStaff"
          data-id="{{item.id}}"
        >
          <image src="{{item.avatar}}" class="staff-avatar" mode="aspectFill" />
          <text class="staff-name">{{item.name}}</text>
          <t-rate value="{{item.rating}}" size="18rpx" disabled />
        </view>
      </scroll-view>
    </view>

    <!-- 联系信息 -->
    <view class="booking-card">
      <text class="card-title">联系信息</text>
      <t-input label="姓名" placeholder="请输入您的姓名" value="{{contactName}}" bind:change="onNameChange" />
      <t-input label="手机号" type="number" placeholder="请输入手机号" value="{{contactPhone}}" bind:change="onPhoneChange" />
      <t-input label="备注" placeholder="有什么特殊要求？" value="{{remark}}" bind:change="onRemarkChange" />
    </view>
  </scroll-view>

  <!-- 底部确认栏 -->
  <view class="booking-bottom">
    <view class="booking-total">
      <text>合计: </text>
      <text class="booking-price">¥{{totalPrice}}</text>
    </view>
    <t-button theme="primary" size="large" bind:tap="confirmBooking" disabled="{{!canSubmit}}">
      确认预约
    </t-button>
  </view>
</view>
```

```css
/* pages/booking/booking.wxss */
.page-booking {
  min-height: 100vh;
  background: #f5f7fa;
}

.booking-card {
  background: #fff;
  margin: 20rpx 24rpx;
  border-radius: 16rpx;
  padding: 24rpx;
}

.card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 20rpx;
  display: block;
}

.service-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx;
  border-radius: 12rpx;
  margin-bottom: 12rpx;
  border: 2rpx solid #f0f0f0;
}

.service-item.active {
  border-color: #2196f3;
  background: #f0f8ff;
}

.service-img {
  width: 100rpx;
  height: 100rpx;
  border-radius: 12rpx;
}

.service-info {
  flex: 1;
}

.service-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #1a1a1a;
  display: block;
}

.service-duration {
  font-size: 24rpx;
  color: #999;
}

.service-price {
  font-size: 32rpx;
  font-weight: 700;
  color: #2196f3;
}

.date-scroll {
  white-space: nowrap;
}

.date-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 24rpx;
  margin-right: 16rpx;
  border-radius: 12rpx;
  border: 2rpx solid #f0f0f0;
}

.date-item.active {
  background: #2196f3;
  border-color: #2196f3;
  color: #fff;
}

.date-item.disabled {
  opacity: 0.4;
}

.date-weekday {
  font-size: 22rpx;
}

.date-day {
  font-size: 36rpx;
  font-weight: 700;
  margin: 4rpx 0;
}

.date-month {
  font-size: 22rpx;
}

.time-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.time-item {
  padding: 16rpx 24rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
  border: 2rpx solid #f0f0f0;
  color: #333;
}

.time-item.active {
  background: #2196f3;
  border-color: #2196f3;
  color: #fff;
}

.time-item.disabled {
  color: #ccc;
  background: #f9f9f9;
}

.staff-scroll {
  white-space: nowrap;
}

.staff-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx;
  margin-right: 16rpx;
  border-radius: 12rpx;
  border: 2rpx solid #f0f0f0;
  width: 140rpx;
}

.staff-item.active {
  border-color: #2196f3;
  background: #f0f8ff;
}

.staff-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  margin-bottom: 8rpx;
}

.staff-name {
  font-size: 24rpx;
  color: #333;
  margin-bottom: 4rpx;
}

.booking-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.06);
}

.booking-price {
  font-size: 40rpx;
  font-weight: 700;
  color: #2196f3;
}
```

## 组件搭配建议

| 场景     | 推荐组件                | 原因                         |
| -------- | ----------------------- | ---------------------------- |
| 定位选择 | `t-cell` + 自定义       | 地址选择用 wx.chooseLocation |
| 分类导航 | `t-grid` (4列)          | 图标 + 文字的标准入口        |
| 门店卡片 | 自定义 view             | 信息密度高，需自定义布局     |
| 排序筛选 | `t-tabs` (tag主题)      | 轻量，不占空间               |
| 日期选择 | 自定义横向滚动          | 7天日期选择器                |
| 时间段   | 自定义 grid             | 网格式时间段选择             |
| 步骤流程 | `t-steps`               | 预约流程可视化               |
| 评价展示 | `t-rate` + `t-tag`      | 星级 + 评价标签              |
| 拨打电话 | `t-cell` + `bind:click` | 使用 wx.makePhoneCall        |
| 地图导航 | `t-cell` + `bind:click` | 使用 wx.openLocation         |

## 交互要点

1. **定位感知** → 进入页面自动获取位置，展示附近门店，距离排序
2. **门店状态** → 实时显示营业中/休息中，休息中时禁用下单
3. **预约流程** → 选服务 → 选日期 → 选时间 → 选技师 → 填信息 → 确认
4. **购物车** → 左侧分类 + 右侧列表的点餐模式，底部购物车栏
5. **电话联系** → 点击电话号码调用 `wx.makePhoneCall`
6. **地图导航** → 点击地址调用 `wx.openLocation` 导航到店
