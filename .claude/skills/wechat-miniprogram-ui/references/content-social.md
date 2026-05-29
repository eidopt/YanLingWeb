# 内容/社区类小程序设计规范

## 设计哲学

内容/社区小程序的核心是**阅读体验与互动参与**。设计需要：

- 沉浸式阅读（减少干扰，突出内容本身）
- 信息密度适中（既不空旷也不拥挤）
- 互动自然（点赞、评论、分享的交互要轻量）
- 视觉舒适（长时间浏览不疲劳）

## 色彩方案

### 方案 A: 资讯/阅读型

```
主色:     #1E88E5  (知性蓝)
辅色:     #42A5F5  (浅蓝)
强调色:   #FF6D00  (行动橙 — 关注/订阅)
背景色:   #F5F5F5  (柔和灰)
卡片背景: #FFFFFF
主文字:   #212121  (深黑 — 阅读友好)
次文字:   #616161
辅助文字: #9E9E9E
分割线:   #EEEEEE
链接色:   #1E88E5
```

### 方案 B: 社区/社交型

```
主色:     #6C5CE7  (活力紫)
辅色:     #A29BFE  (浅紫)
强调色:   #FF6B6B  (珊瑚红 — 点赞/喜欢)
背景色:   #F8F9FE  (微紫白)
卡片背景: #FFFFFF
主文字:   #2D3436
次文字:   #636E72
辅助文字: #B2BEC3
分割线:   #E8ECF1
在线状态: #00B894  (绿)
```

### 方案 C: 知识/教育型

```
主色:     #2D3436  (墨黑)
辅色:     #0984E3  (学术蓝)
强调色:   #00B894  (成长绿)
背景色:   #FAFAFA
卡片背景: #FFFFFF
主文字:   #2D3436
次文字:   #636E72
辅助文字: #B2BEC3
分割线:   #EAECEE
高亮背景: #FFF8E1  (笔记黄)
```

## 字体规范

| 层级     | 大小  | 字重 | 行高 | 用途                 |
| -------- | ----- | ---- | ---- | -------------------- |
| 文章标题 | 38rpx | 700  | 1.3  | 文章/帖子大标题      |
| 章节标题 | 32rpx | 600  | 1.4  | 文章内小标题         |
| 正文     | 30rpx | 400  | 1.8  | 文章正文（阅读舒适） |
| 列表标题 | 30rpx | 500  | 1.4  | 信息流中的标题       |
| 列表摘要 | 26rpx | 400  | 1.5  | 信息流中的摘要       |
| 辅助信息 | 24rpx | 400  | 1.4  | 作者、时间、来源     |
| 互动数据 | 24rpx | 400  | 1.0  | 点赞数、评论数       |
| 标签     | 22rpx | 400  | 1.0  | 话题标签             |

> **注意**: 正文行高设为 1.8，比其他类型更大，确保长文阅读舒适。

## 核心页面模板

### 1. 信息流首页 (pages/home/home)

```xml
<!-- pages/home/home.wxml -->
<view class="page-home">
  <!-- 顶部标签栏 -->
  <view class="tab-bar">
    <t-tabs value="{{activeTab}}" bind:change="onTabChange" t-class="home-tabs">
      <t-tab-panel label="推荐" value="recommend" />
      <t-tab-panel label="关注" value="follow" />
      <t-tab-panel label="热门" value="hot" />
      <t-tab-panel wx:for="{{customTabs}}" wx:key="id" label="{{item.name}}" value="{{item.id}}" />
    </t-tabs>
  </view>

  <!-- 搜索入口 -->
  <view class="search-entry" bind:tap="goSearch">
    <t-icon name="search" size="32rpx" color="#999" />
        <text class="search-placeholder">搜索内容、用户、话题</text>
  </view>

  <swiper class="content-swiper" current="{{swiperCurrent}}" bind:change="onSwiperChange" circular="{{false}}">
    <!-- 推荐 tab -->
    <swiper-item>
      <scroll-view scroll-y class="feed-scroll" bind:scrolltolower="loadMore" refresher-enabled bind:refresherrefresh="onRefresh" refresher-triggered="{{refreshing}}">
        <!-- 置顶/广告卡片 -->
        <view class="featured-card" wx:if="{{featured}}" bind:tap="goArticle" data-id="{{featured.id}}">
          <image src="{{featured.cover}}" mode="aspectFill" class="featured-cover" />
          <view class="featured-overlay">
            <t-tag theme="danger" variant="light" size="small">置顶</t-tag>
            <text class="featured-title">{{featured.title}}</text>
            <view class="featured-meta">
              <image src="{{featured.author.avatar}}" class="author-avatar-sm" />
              <text>{{featured.author.name}}</text>
              <text>{{featured.readCount}}阅读</text>
            </view>
          </view>
        </view>

        <!-- 内容卡片列表 -->
        <view class="feed-card" wx:for="{{feedList}}" wx:key="id" bind:tap="goArticle" data-id="{{item.id}}">
          <!-- 图文卡片 -->
          <view class="feed-card-body" wx:if="{{item.type === 'article'}}">
            <view class="feed-text">
              <text class="feed-title">{{item.title}}</text>
              <text class="feed-summary">{{item.summary}}</text>
              <view class="feed-meta">
                <view class="feed-author">
                  <image src="{{item.author.avatar}}" class="author-avatar-sm" />
                  <text>{{item.author.name}}</text>
                </view>
                <view class="feed-stats">
                  <text>{{item.readCount}}阅读</text>
                  <text>{{item.commentCount}}评论</text>
                </view>
              </view>
            </view>
            <image src="{{item.cover}}" class="feed-cover" mode="aspectFill" wx:if="{{item.cover}}" />
          </view>

          <!-- 多图卡片 -->
          <view class="feed-card-body multi-image" wx:if="{{item.type === 'multi-image'}}">
            <text class="feed-title">{{item.title}}</text>
            <view class="feed-images">
              <image wx:for="{{item.covers}}" wx:for-item="img" wx:key="*this" src="{{img}}" mode="aspectFill" class="feed-img-multi" />
            </view>
            <view class="feed-meta">
              <view class="feed-author">
                <image src="{{item.author.avatar}}" class="author-avatar-sm" />
                <text>{{item.author.name}}</text>
              </view>
              <view class="feed-stats">
                <text>{{item.readCount}}阅读</text>
              </view>
            </view>
          </view>

          <!-- 话题标签 -->
          <view class="feed-tags" wx:if="{{item.tags.length}}">
            <t-tag wx:for="{{item.tags}}" wx:for-item="tag" wx:key="*this" size="small" variant="outline" theme="primary">#{{tag}}</t-tag>
          </view>
        </view>

        <t-load-more status="{{loadStatus}}" />
      </scroll-view>
    </swiper-item>

    <!-- 其他 tab 内容类似 -->
    <swiper-item>
      <scroll-view scroll-y class="feed-scroll">
        <!-- 关注 tab 内容 -->
      </scroll-view>
    </swiper-item>
  </swiper>
</view>
```

```css
/* pages/home/home.wxss */
.page-home {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
}

.tab-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #fff;
  border-bottom: 1rpx solid #eee;
}

.search-entry {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 16rpx 24rpx;
  padding: 16rpx 24rpx;
  background: #f5f5f5;
  border-radius: 40rpx;
}

.search-placeholder {
  font-size: 28rpx;
  color: #999;
}

.content-swiper {
  flex: 1;
  height: 0;
}

.feed-scroll {
  height: 100%;
}

/* 置顶卡片 */
.featured-card {
  position: relative;
  margin: 16rpx 24rpx;
  border-radius: 16rpx;
  overflow: hidden;
  height: 360rpx;
}

.featured-cover {
  width: 100%;
  height: 100%;
}

.featured-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24rpx;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
}

.featured-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #fff;
  margin: 12rpx 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.featured-meta {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

/* 内容卡片 */
.feed-card {
  background: #fff;
  margin: 0 24rpx 16rpx;
  border-radius: 12rpx;
  padding: 24rpx;
}

.feed-card-body {
  display: flex;
  gap: 20rpx;
}

.feed-card-body.multi-image {
  flex-direction: column;
}

.feed-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.feed-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #212121;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  margin-bottom: 8rpx;
}

.feed-summary {
  font-size: 26rpx;
  color: #616161;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  margin-bottom: 12rpx;
}

.feed-cover {
  width: 220rpx;
  height: 160rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.feed-images {
  display: flex;
  gap: 8rpx;
  margin-bottom: 12rpx;
}

.feed-img-multi {
  flex: 1;
  height: 160rpx;
  border-radius: 8rpx;
}

.feed-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.feed-author {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 24rpx;
  color: #636e72;
}

.author-avatar-sm {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
}

.feed-stats {
  display: flex;
  gap: 16rpx;
  font-size: 22rpx;
  color: #b2bec3;
}

.feed-tags {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
}
```

### 2. 文章详情页 (pages/article/detail)

```xml
<!-- pages/article/detail.wxml -->
<view class="page-article">
  <t-navbar title="" left-arrow transparent="{{isTop}}">
    <view slot="right" class="nav-actions">
      <t-icon name="share" size="44rpx" bind:tap="onShare" />
      <t-icon name="more" size="44rpx" bind:tap="showMoreActions" />
    </view>
  </t-navbar>

  <scroll-view scroll-y class="article-scroll" bind:scroll="onScroll">
    <!-- 封面图 -->
    <image src="{{article.cover}}" mode="widthFix" class="article-cover" wx:if="{{article.cover}}" />

    <view class="article-body">
      <!-- 标题 -->
      <text class="article-title">{{article.title}}</text>

      <!-- 作者信息 -->
      <view class="author-row">
        <view class="author-info" bind:tap="goAuthor" data-id="{{article.author.id}}">
          <image src="{{article.author.avatar}}" class="author-avatar" mode="aspectFill" />
          <view class="author-detail">
            <text class="author-name">{{article.author.name}}</text>
            <text class="author-bio">{{article.author.bio}}</text>
          </view>
        </view>
        <t-button
          theme="primary"
          size="small"
          variant="{{isFollowed ? 'outline' : 'base'}}"
          bind:tap="toggleFollow"
        >
          {{isFollowed ? '已关注' : '+ 关注'}}
        </t-button>
      </view>

      <!-- 文章信息 -->
      <view class="article-meta">
        <text>{{article.publishTime}}</text>
        <text>{{article.readCount}} 阅读</text>
        <text>{{article.wordCount}} 字</text>
      </view>

      <!-- 文章正文 -->
      <view class="article-content">
        <rich-text nodes="{{article.content}}" />
      </view>

      <!-- 标签 -->
      <view class="article-tags" wx:if="{{article.tags.length}}">
        <t-tag wx:for="{{article.tags}}" wx:key="*this" variant="outline" theme="primary" bind:tap="goTag" data-tag="{{item}}">#{{item}}</t-tag>
      </view>

      <!-- 点赞/打赏区 -->
      <view class="action-section">
        <view class="like-action {{isLiked ? 'active' : ''}}" bind:tap="toggleLike">
          <t-icon name="{{isLiked ? 'thumb-up-filled' : 'thumb-up'}}" size="48rpx" />
          <text>{{article.likeCount}}</text>
        </view>
      </view>

      <!-- 评论区 -->
      <view class="comment-section">
        <view class="section-header">
          <text class="section-title">评论 ({{commentCount}})</text>
          <t-tabs value="{{commentSort}}" bind:change="onCommentSortChange" size="small" theme="tag">
            <t-tab-panel label="最热" value="hot" />
            <t-tab-panel label="最新" value="new" />
          </t-tabs>
        </view>

        <view class="comment-list">
          <view class="comment-item" wx:for="{{comments}}" wx:key="id">
            <image src="{{item.user.avatar}}" class="comment-avatar" mode="aspectFill" />
            <view class="comment-body">
              <text class="comment-name">{{item.user.name}}</text>
              <text class="comment-text">{{item.content}}</text>
              <view class="comment-footer">
                <text class="comment-time">{{item.time}}</text>
                <view class="comment-actions">
                  <view class="comment-like" bind:tap="likeComment" data-id="{{item.id}}">
                    <t-icon name="{{item.isLiked ? 'thumb-up-filled' : 'thumb-up'}}" size="28rpx" />
                    <text>{{item.likeCount}}</text>
                  </view>
                  <view class="comment-reply" bind:tap="replyComment" data-id="{{item.id}}">
                    <t-icon name="chat" size="28rpx" />
                    <text>回复</text>
                  </view>
                </view>
              </view>
              <!-- 子评论 -->
              <view class="sub-comments" wx:if="{{item.replies.length}}">
                <view class="sub-comment" wx:for="{{item.replies}}" wx:for-item="reply" wx:key="id">
                  <text class="sub-comment-name">{{reply.user.name}}</text>
                  <text wx:if="{{reply.replyTo}}"> 回复 </text>
                  <text class="sub-comment-name" wx:if="{{reply.replyTo}}">{{reply.replyTo.name}}</text>
                  <text>: {{reply.content}}</text>
                </view>
                <view class="more-replies" wx:if="{{item.replyCount > 2}}" bind:tap="goComments" data-id="{{item.id}}">
                  查看全部{{item.replyCount}}条回复 ›
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </scroll-view>

  <!-- 底部评论栏 -->
  <view class="comment-bar">
    <view class="comment-input" bind:tap="showCommentInput">
      <text class="comment-placeholder">写评论...</text>
    </view>
    <view class="comment-bar-actions">
      <view class="bar-action" bind:tap="toggleLike">
        <t-icon name="{{isLiked ? 'thumb-up-filled' : 'thumb-up'}}" size="44rpx" />
        <text>{{article.likeCount}}</text>
      </view>
      <view class="bar-action" bind:tap="toggleFavorite">
        <t-icon name="{{isFavorited ? 'star-filled' : 'star'}}" size="44rpx" />
      </view>
      <button class="share-btn" open-type="share">
        <t-icon name="share" size="44rpx" />
      </button>
    </view>
  </view>

  <!-- 评论输入弹窗 -->
  <view class="comment-modal" wx:if="{{showInput}}" bind:tap="hideCommentInput">
    <view class="comment-modal-body" catch:tap>
      <textarea
        class="comment-textarea"
        placeholder="{{replyTo ? '回复 ' + replyTo.name : '写下你的评论...'}}"
        value="{{commentText}}"
        bindinput="onCommentInput"
        auto-height
        focus="{{showInput}}"
        maxlength="500"
      />
      <view class="comment-modal-footer">
        <text class="char-count">{{commentText.length}}/500</text>
        <t-button theme="primary" size="small" disabled="{{!commentText.trim()}}" bind:tap="submitComment">发布</t-button>
      </view>
    </view>
  </view>
</view>
```

```css
/* pages/article/detail.wxss */
.page-article {
  min-height: 100vh;
  background: #fff;
}

.article-cover {
  width: 100%;
  display: block;
}

.article-body {
  padding: 32rpx 24rpx;
}

.article-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #212121;
  line-height: 1.3;
  margin-bottom: 24rpx;
  display: block;
}

.author-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.author-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.author-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
}

.author-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #2d3436;
  display: block;
}

.author-bio {
  font-size: 24rpx;
  color: #9e9e9e;
}

.article-meta {
  display: flex;
  gap: 20rpx;
  font-size: 24rpx;
  color: #9e9e9e;
  margin-bottom: 32rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #eee;
}

.article-content {
  font-size: 30rpx;
  line-height: 1.8;
  color: #212121;
}

.article-content p {
  margin-bottom: 24rpx;
}

.article-content image {
  width: 100%;
  border-radius: 8rpx;
  margin: 16rpx 0;
}

.article-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin: 32rpx 0;
}

.action-section {
  display: flex;
  justify-content: center;
  padding: 32rpx 0;
  border-bottom: 1rpx solid #eee;
}

.like-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  color: #636e72;
  font-size: 24rpx;
}

.like-action.active {
  color: #ff6b6b;
}

.comment-section {
  margin-top: 32rpx;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #2d3436;
}

.comment-item {
  display: flex;
  gap: 16rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.comment-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.comment-body {
  flex: 1;
  min-width: 0;
}

.comment-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #2d3436;
  margin-bottom: 8rpx;
  display: block;
}

.comment-text {
  font-size: 28rpx;
  color: #212121;
  line-height: 1.6;
}

.comment-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
}

.comment-time {
  font-size: 22rpx;
  color: #b2bec3;
}

.comment-actions {
  display: flex;
  gap: 24rpx;
}

.comment-like,
.comment-reply {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 24rpx;
  color: #636e72;
}

.sub-comments {
  margin-top: 16rpx;
  padding: 16rpx;
  background: #f8f9fe;
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #2d3436;
  line-height: 1.6;
}

.sub-comment {
  margin-bottom: 8rpx;
}

.sub-comment-name {
  color: #6c5ce7;
  font-weight: 500;
}

.more-replies {
  color: #6c5ce7;
  font-size: 24rpx;
  margin-top: 8rpx;
}

/* 底部评论栏 */
.comment-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 12rpx 24rpx;
  padding-bottom: calc(12rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.06);
  z-index: 200;
}

.comment-input {
  flex: 1;
  padding: 16rpx 24rpx;
  background: #f5f5f5;
  border-radius: 40rpx;
}

.comment-placeholder {
  font-size: 28rpx;
  color: #999;
}

.comment-bar-actions {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.bar-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 20rpx;
  color: #636e72;
}

.share-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  line-height: 1;
}

.share-btn::after {
  display: none;
}

/* 评论输入弹窗 */
.comment-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 300;
  display: flex;
  align-items: flex-end;
}

.comment-modal-body {
  width: 100%;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 24rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}

.comment-textarea {
  width: 100%;
  min-height: 200rpx;
  font-size: 28rpx;
  line-height: 1.6;
  margin-bottom: 16rpx;
}

.comment-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-count {
  font-size: 24rpx;
  color: #999;
}
```

## 组件搭配建议

| 场景     | 推荐组件                       | 原因                 |
| -------- | ------------------------------ | -------------------- |
| 分类标签 | `t-tabs`                       | 文章分类切换         |
| 内容卡片 | 自定义 view                    | 信息密度高，布局灵活 |
| 搜索入口 | `t-icon` + 自定义              | 跳转到独立搜索页     |
| 关注按钮 | `t-button` (outline/base 切换) | 关注状态切换         |
| 评价星级 | `t-rate`                       | 文章/内容评分        |
| 话题标签 | `t-tag` (outline)              | 轻量，不抢内容风头   |
| 下拉刷新 | `t-pull-down-refresh`          | 信息流刷新           |
| 评论排序 | `t-tabs` (tag主题)             | 最热/最新切换        |
| 分享     | `button[open-type="share"]`    | 微信原生分享         |
| 空状态   | 自定义 view + image            | 无内容时引导         |

## 交互要点

1. **信息流无限滚动** → `scroll-view` + `bind:scrolltolower` 分页加载
2. **双击点赞** → 文章详情中，双击正文区域点赞，显示动画
3. **评论回复** → 点击回复，弹出输入框，预填被回复人
4. **图片预览** → 文章内图片点击全屏预览，支持左右滑动
5. **关注状态** → 关注按钮点击后立即切换状态，乐观更新
6. **分享** → 使用微信原生分享，支持分享到朋友圈和好友
7. **文字选择** → 正文支持长按选择文字，复制/分享
