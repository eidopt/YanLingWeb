# 工具/效率类小程序设计规范

## 设计哲学

工具/效率小程序的核心是**清晰、快速、专注**。设计需要：

- 功能优先（去掉一切装饰，突出核心功能）
- 信息密度高（一屏展示尽可能多的有用信息）
- 操作高效（减少步骤，常用操作一键触达）
- 反馈即时（操作后立即给出结果和反馈）

## 色彩方案

### 方案 A: 极简工具型

```
主色:     #333333  (墨黑)
辅色:     #666666  (中灰)
强调色:   #07C160  (微信绿 — 完成/成功)
背景色:   #F6F6F6  (浅灰)
卡片背景: #FFFFFF
主文字:   #333333
次文字:   #666666
辅助文字: #999999
分割线:   #E5E5E5
错误:     #FA5151
警告:     #FFC300
成功:     #07C160
```

### 方案 B: 专业效率型（记账、日程、项目管理）

```
主色:     #0052D9  (专业蓝)
辅色:     #4D8BF5  (浅蓝)
强调色:   #FF6B00  (行动橙)
背景色:   #F5F7FA
卡片背景: #FFFFFF
主文字:   #1A1A1A
次文字:   #5A5A5A
辅助文字: #999999
分割线:   #E8ECF1
正向数据: #07C160  (增长绿)
负向数据: #FA5151  (下降红)
```

### 方案 C: 生活记录型（打卡、习惯、健身）

```
主色:     #00B578  (活力绿)
辅色:     #38CB7D  (浅绿)
强调色:   #FF5C5C  (激励红)
背景色:   #F5F7F5
卡片背景: #FFFFFF
主文字:   #2C3E2C
次文字:   #5A6E5A
辅助文字: #8FA08F
分割线:   #E5EBE5
打卡成功: #00B578
连续天数: #FF9500  (金色)
```

## 字体规范

| 层级       | 大小            | 字重 | 用途                             |
| ---------- | --------------- | ---- | -------------------------------- |
| 数据大字   | 56rpx           | 700  | 核心数据展示（余额、步数、天数） |
| 页面标题   | 36rpx           | 600  | 页面/区域标题                    |
| 列表标题   | 30rpx           | 500  | 列表项主信息                     |
| 列表副信息 | 26rpx           | 400  | 列表项辅助信息                   |
| 正文       | 28rpx           | 400  | 输入内容、说明文字               |
| 辅助文字   | 24rpx           | 400  | 时间、备注、提示                 |
| 小字       | 22rpx           | 400  | 标签、角标                       |
| 数字       | 等宽或 DIN 字体 | 各级 | 金额、数据、日期                 |

> **工具类特别注意**: 数字和金额要使用等宽字体或 DIN 风格，避免数字跳动。

## 核心页面模板

### 1. 记账首页 (pages/home/home) — 工具类典型

```xml
<!-- pages/home/home.wxml -->
<view class="page-home">
  <t-navbar title="记账" />

  <!-- 本月概览 -->
  <view class="overview-card">
    <view class="overview-header">
      <text class="overview-month">{{currentMonth}}月</text>
      <t-icon name="chevron-down" size="28rpx" bind:tap="showMonthPicker" />
    </view>
    <view class="overview-amounts">
      <view class="amount-item">
        <text class="amount-label">支出</text>
        <text class="amount-value expense">¥{{monthExpense}}</text>
      </view>
      <view class="amount-divider"></view>
      <view class="amount-item">
        <text class="amount-label">收入</text>
        <text class="amount-value income">¥{{monthIncome}}</text>
      </view>
      <view class="amount-divider"></view>
      <view class="amount-item">
        <text class="amount-label">结余</text>
        <text class="amount-value {{monthBalance >= 0 ? 'income' : 'expense'}}">¥{{monthBalance}}</text>
      </view>
    </view>
    <!-- 预算进度 -->
    <view class="budget-bar" wx:if="{{budget > 0}}">
      <view class="budget-info">
        <text>月预算</text>
        <text>已用 {{budgetPercent}}%</text>
      </view>
      <view class="budget-track">
        <view class="budget-fill {{budgetPercent > 80 ? 'warning' : ''}}" style="width: {{budgetPercent}}%"></view>
      </view>
      <text class="budget-remaining">剩余 ¥{{budgetRemaining}}</text>
    </view>
  </view>

  <!-- 分类统计 -->
  <view class="stats-card">
    <view class="stats-header">
      <text class="stats-title">支出分类</text>
      <t-tabs value="{{statsTab}}" bind:change="onStatsTabChange" size="small" theme="tag">
        <t-tab-panel label="本周" value="week" />
        <t-tab-panel label="本月" value="month" />
        <t-tab-panel label="本年" value="year" />
      </t-tabs>
    </view>
    <view class="category-stats">
      <view class="category-item" wx:for="{{categoryStats}}" wx:key="name">
        <view class="category-left">
          <view class="category-icon" style="background: {{item.color}}">
            <t-icon name="{{item.icon}}" size="32rpx" color="#fff" />
          </view>
          <text class="category-name">{{item.name}}</text>
        </view>
        <view class="category-right">
          <view class="category-bar">
            <view class="category-bar-fill" style="width: {{item.percent}}%; background: {{item.color}}"></view>
          </view>
          <text class="category-amount">¥{{item.amount}}</text>
          <text class="category-percent">{{item.percent}}%</text>
        </view>
      </view>
    </view>
  </view>

  <!-- 今日明细 -->
  <view class="records-section">
    <view class="section-header">
      <text class="section-title">今日明细</text>
      <text class="section-total">支出 ¥{{todayTotal}}</text>
    </view>
    <view class="record-list">
      <view class="record-item" wx:for="{{todayRecords}}" wx:key="id" bind:tap="editRecord" data-id="{{item.id}}">
        <view class="record-icon" style="background: {{item.categoryColor}}">
          <t-icon name="{{item.categoryIcon}}" size="32rpx" color="#fff" />
        </view>
        <view class="record-info">
          <text class="record-category">{{item.category}}</text>
          <text class="record-note" wx:if="{{item.note}}">{{item.note}}</text>
        </view>
        <text class="record-amount {{item.type}}">¥{{item.amount}}</text>
      </view>
    </view>

    <!-- 历史日期分组 -->
    <view wx:for="{{historyDays}}" wx:key="date" class="history-day">
      <view class="day-header">
        <text class="day-date">{{item.date}}</text>
        <text class="day-total">支出 ¥{{item.total}}</text>
      </view>
      <view class="record-item" wx:for="{{item.records}}" wx:for-item="record" wx:key="id" bind:tap="editRecord" data-id="{{record.id}}">
        <view class="record-icon" style="background: {{record.categoryColor}}">
          <t-icon name="{{record.categoryIcon}}" size="32rpx" color="#fff" />
        </view>
        <view class="record-info">
          <text class="record-category">{{record.category}}</text>
          <text class="record-note" wx:if="{{record.note}}">{{record.note}}</text>
        </view>
        <text class="record-amount {{record.type}}">¥{{record.amount}}</text>
      </view>
    </view>
  </view>

  <!-- 记账按钮 -->
  <view class="fab" bind:tap="addRecord">
    <t-icon name="add" size="48rpx" color="#fff" />
  </view>
</view>
```

```css
/* pages/home/home.wxss */
.page-home {
  min-height: 100vh;
  background: #f6f6f6;
  padding-bottom: 120rpx;
}

.overview-card {
  margin: 20rpx 24rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
}

.overview-header {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 20rpx;
}

.overview-month {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}

.overview-amounts {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.amount-item {
  flex: 1;
  text-align: center;
}

.amount-label {
  font-size: 24rpx;
  color: #999;
  display: block;
  margin-bottom: 8rpx;
}

.amount-value {
  font-size: 40rpx;
  font-weight: 700;
  display: block;
}

.amount-value.expense {
  color: #fa5151;
}

.amount-value.income {
  color: #07c160;
}

.amount-divider {
  width: 1rpx;
  height: 60rpx;
  background: #eee;
}

.budget-bar {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #eee;
}

.budget-info {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}

.budget-track {
  height: 12rpx;
  background: #f0f0f0;
  border-radius: 6rpx;
  overflow: hidden;
}

.budget-fill {
  height: 100%;
  background: #07c160;
  border-radius: 6rpx;
  transition: width 0.3s;
}

.budget-fill.warning {
  background: #fa5151;
}

.budget-remaining {
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
  display: block;
}

.stats-card {
  margin: 0 24rpx 20rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.stats-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.category-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.category-item:last-child {
  border-bottom: none;
}

.category-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
  width: 160rpx;
}

.category-icon {
  width: 48rpx;
  height: 48rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-name {
  font-size: 26rpx;
  color: #333;
}

.category-right {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.category-bar {
  flex: 1;
  height: 8rpx;
  background: #f5f5f5;
  border-radius: 4rpx;
  overflow: hidden;
}

.category-bar-fill {
  height: 100%;
  border-radius: 4rpx;
  transition: width 0.3s;
}

.category-amount {
  font-size: 26rpx;
  font-weight: 600;
  color: #333;
  width: 120rpx;
  text-align: right;
}

.category-percent {
  font-size: 22rpx;
  color: #999;
  width: 60rpx;
  text-align: right;
}

.records-section {
  margin: 0 24rpx;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.section-total {
  font-size: 24rpx;
  color: #999;
}

.record-list,
.history-day {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 16rpx;
}

.day-header {
  display: flex;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  font-size: 24rpx;
  color: #999;
}

.record-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid #f5f5f5;
}

.record-item:last-child {
  border-bottom: none;
}

.record-icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.record-info {
  flex: 1;
  min-width: 0;
}

.record-category {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  display: block;
}

.record-note {
  font-size: 24rpx;
  color: #999;
  margin-top: 4rpx;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-amount {
  font-size: 32rpx;
  font-weight: 700;
  flex-shrink: 0;
}

.record-amount.expense {
  color: #fa5151;
}

.record-amount.expense::before {
  content: '-¥';
  font-size: 24rpx;
}

.record-amount.income {
  color: #07c160;
}

.record-amount.income::before {
  content: '+¥';
  font-size: 24rpx;
}

.fab {
  position: fixed;
  right: 32rpx;
  bottom: calc(120rpx + env(safe-area-inset-bottom));
  width: 100rpx;
  height: 100rpx;
  background: #333;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.2);
  z-index: 100;
}
```

### 2. 数据录入页 (pages/record/add) — 快速记账

```xml
<!-- pages/record/add.wxml -->
<view class="page-add">
  <t-navbar title="记一笔" left-arrow />

  <!-- 金额输入 -->
  <view class="amount-section">
    <text class="currency">¥</text>
    <input
      class="amount-input"
      type="digit"
      value="{{amount}}"
      bindinput="onAmountInput"
      placeholder="0.00"
      focus
    />
  </view>

  <!-- 类型切换 -->
  <t-tabs value="{{recordType}}" bind:change="onTypeChange" theme="card">
    <t-tab-panel label="支出" value="expense" />
    <t-tab-panel label="收入" value="income" />
  </t-tabs>

  <!-- 分类选择 -->
  <view class="category-grid">
    <view
      wx:for="{{categories}}"
      wx:key="name"
      class="category-btn {{item.name === selectedCategory ? 'active' : ''}}"
      bind:tap="selectCategory"
      data-name="{{item.name}}"
    >
      <view class="category-btn-icon" style="background: {{item.color}}">
        <t-icon name="{{item.icon}}" size="36rpx" color="#fff" />
      </view>
      <text class="category-btn-name">{{item.name}}</text>
    </view>
  </view>

  <!-- 备注和日期 -->
  <view class="form-section">
    <t-input label="备注" placeholder="添加备注" value="{{note}}" bind:change="onNoteChange" />
    <t-cell title="日期" note="{{date}}" arrow bind:click="showDatePicker" />
    <t-cell title="时间" note="{{time}}" arrow bind:click="showTimePicker" />
  </view>

  <!-- 保存按钮 -->
  <view class="save-section">
    <t-button theme="primary" block size="large" bind:tap="saveRecord" disabled="{{!canSave}}">
      保存
    </t-button>
  </view>
</view>
```

```css
/* pages/record/add.wxss */
.page-add {
  min-height: 100vh;
  background: #f6f6f6;
}

.amount-section {
  display: flex;
  align-items: baseline;
  justify-content: center;
  padding: 60rpx 24rpx 40rpx;
  background: #fff;
}

.currency {
  font-size: 48rpx;
  font-weight: 700;
  color: #333;
  margin-right: 8rpx;
}

.amount-input {
  font-size: 72rpx;
  font-weight: 700;
  color: #333;
  text-align: center;
  width: 400rpx;
}

.category-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 24rpx;
  background: #fff;
  margin-top: 20rpx;
  border-radius: 16rpx;
  margin-left: 24rpx;
  margin-right: 24rpx;
}

.category-btn {
  width: 20%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 0;
  border-radius: 12rpx;
}

.category-btn.active {
  background: #f5f5f5;
}

.category-btn-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8rpx;
}

.category-btn-name {
  font-size: 22rpx;
  color: #666;
}

.form-section {
  margin: 20rpx 24rpx;
  background: #fff;
  border-radius: 16rpx;
}

.save-section {
  padding: 40rpx 24rpx;
}
```

### 3. 打卡/习惯追踪页 (pages/habit/habit)

```xml
<!-- pages/habit/habit.wxml -->
<view class="page-habit">
  <t-navbar title="习惯打卡" />

  <scroll-view scroll-y class="habit-scroll">
    <!-- 今日概览 -->
    <view class="today-card">
      <text class="today-date">{{today}}</text>
      <view class="today-stats">
        <view class="today-stat">
          <text class="stat-num">{{completedCount}}</text>
          <text class="stat-label">已完成</text>
        </view>
        <view class="stat-divider"></view>
        <view class="today-stat">
          <text class="stat-num">{{totalCount}}</text>
          <text class="stat-label">今日目标</text>
        </view>
        <view class="stat-divider"></view>
        <view class="today-stat">
          <text class="stat-num">{{streakDays}}</text>
          <text class="stat-label">连续天数</text>
        </view>
      </view>
    </view>

    <!-- 习惯列表 -->
    <view class="habit-list">
      <view class="habit-item {{item.completed ? 'completed' : ''}}" wx:for="{{habits}}" wx:key="id">
        <view class="habit-left">
          <view class="habit-icon" style="background: {{item.color}}">
            <t-icon name="{{item.icon}}" size="40rpx" color="#fff" />
          </view>
          <view class="habit-info">
            <text class="habit-name">{{item.name}}</text>
            <text class="habit-streak">已连续 {{item.streak}} 天</text>
          </view>
        </view>
        <view class="habit-right">
          <view class="check-btn {{item.completed ? 'checked' : ''}}" bind:tap="toggleHabit" data-id="{{item.id}}">
            <t-icon name="check" size="40rpx" color="#fff" wx:if="{{item.completed}}" />
          </view>
          <text class="habit-count">{{item.completedCount}}/{{item.target}}</text>
        </view>
      </view>
    </view>

    <!-- 本周日历 -->
    <view class="week-calendar">
      <text class="week-title">本周完成情况</text>
      <view class="week-days">
        <view class="week-day" wx:for="{{weekDays}}" wx:key="date">
          <text class="week-day-label">{{item.label}}</text>
          <view class="week-day-dot {{item.allCompleted ? 'completed' : ''}} {{item.isToday ? 'today' : ''}}">
            <text>{{item.day}}</text>
          </view>
          <text class="week-day-count" wx:if="{{item.count}}">{{item.count}}/{{item.total}}</text>
        </view>
      </view>
    </view>
  </scroll-view>

  <!-- 添加习惯 -->
  <view class="fab" bind:tap="addHabit">
    <t-icon name="add" size="48rpx" color="#fff" />
  </view>
</view>
```

```css
/* pages/habit/habit.wxss */
.page-habit {
  min-height: 100vh;
  background: #f5f7f5;
}

.today-card {
  margin: 20rpx 24rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx 24rpx;
  text-align: center;
}

.today-date {
  font-size: 28rpx;
  color: #999;
  margin-bottom: 24rpx;
  display: block;
}

.today-stats {
  display: flex;
  align-items: center;
  justify-content: space-around;
}

.today-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 48rpx;
  font-weight: 700;
  color: #00b578;
}

.stat-label {
  font-size: 24rpx;
  color: #999;
  margin-top: 4rpx;
}

.stat-divider {
  width: 1rpx;
  height: 60rpx;
  background: #eee;
}

.habit-list {
  margin: 0 24rpx 20rpx;
}

.habit-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 12rpx;
}

.habit-item.completed {
  opacity: 0.7;
}

.habit-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.habit-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.habit-name {
  font-size: 30rpx;
  font-weight: 500;
  color: #2c3e2c;
  display: block;
}

.habit-streak {
  font-size: 24rpx;
  color: #8fa08f;
  margin-top: 4rpx;
  display: block;
}

.habit-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.check-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  border: 4rpx solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
}

.check-btn.checked {
  background: #00b578;
  border-color: #00b578;
}

.habit-count {
  font-size: 24rpx;
  color: #999;
  width: 60rpx;
  text-align: right;
}

.week-calendar {
  margin: 0 24rpx 20rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
}

.week-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #2c3e2c;
  margin-bottom: 20rpx;
  display: block;
}

.week-days {
  display: flex;
  justify-content: space-around;
}

.week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.week-day-label {
  font-size: 22rpx;
  color: #999;
}

.week-day-dot {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: #333;
}

.week-day-dot.today {
  border: 3rpx solid #00b578;
}

.week-day-dot.completed {
  background: #00b578;
  color: #fff;
}

.week-day-count {
  font-size: 20rpx;
  color: #999;
}

.fab {
  position: fixed;
  right: 32rpx;
  bottom: calc(48rpx + env(safe-area-inset-bottom));
  width: 100rpx;
  height: 100rpx;
  background: #00b578;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(0, 181, 120, 0.3);
  z-index: 100;
}
```

## 组件搭配建议

| 场景     | 推荐组件                  | 原因                       |
| -------- | ------------------------- | -------------------------- |
| 金额输入 | `input[type="digit"]`     | 数字键盘，支持小数点       |
| 分类选择 | 自定义 grid               | 图标 + 文字，5列网格       |
| 日期选择 | `t-cell` + `bind:click`   | 使用 `wx.chooseDatePicker` |
| 类型切换 | `t-tabs` (card主题)       | 支出/收入切换              |
| 列表项   | `t-cell`                  | 标准列表，支持 arrow/note  |
| 数据展示 | `text` + 自定义样式       | 大数字需要特殊处理         |
| 操作确认 | `t-dialog`                | 删除确认                   |
| 成功反馈 | `t-toast` (theme=success) | 保存成功提示               |
| 步骤引导 | `t-steps`                 | 多步骤操作引导             |
| 浮动按钮 | 自定义 view               | FAB 记账入口               |

## 交互要点

1. **快速记账** → 金额键盘输入 → 选分类 → 保存，3步完成
2. **数据联动** → 切换月份时，概览数据和分类统计同步更新
3. **滑动操作** → 记录列表左滑出现编辑/删除按钮
4. **即时反馈** → 打卡按钮点击后立即变色 + 震动反馈 `wx.vibrateShort`
5. **数据可视化** → 使用 canvas 绘制简单的饼图或柱状图
6. **批量操作** → 长按进入多选模式，批量删除或修改
