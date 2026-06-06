import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 预生成的可复用图片素材库（按大类 + 关键词 + 角色建索引）。
 *
 * 模板生成时通过 `TemplateAssetStore.findByIndex(context)` 在这张表里按语义命中
 * 一张现成图直接复用，而不是每个 asset 都重新调 AI 生图。图片本身落盘在
 * `public/template-assets/pool/<category>/<slug>.png`，url 为本地 `/template-assets/...`。
 * 见 memory: template-asset-reuse-plan。
 */
@Entity('asset_library_images')
@Index(['slug'], { unique: true })
@Index(['category'])
@Index(['role'])
export class AssetLibraryImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 稳定唯一标识，如 `fruit-apple-product`。预生成脚本据此判重 / 断点续跑。 */
  @Column()
  slug: string;

  /** 大类，如 fruit / fashion / fitness / finance。 */
  @Column()
  category: string;

  /** 检索关键词（中英混合均可），如 ["水果","苹果","apple","fruit"]。 */
  @Column({ type: 'simple-json', default: '[]' })
  keywords: string[];

  /** UI 角色：hero / product / avatar / category-icon / illustration / background。 */
  @Column()
  role: string;

  @Column({ type: 'text', default: '' })
  prompt: string;

  @Column({ type: 'text', default: '' })
  alt: string;

  /** 可直接用作 core.image src 的本地 URL，如 `/template-assets/pool/fruit/apple-product.png`。 */
  @Column()
  url: string;

  /** 存储层内部 key（相对路径）。 */
  @Column()
  storageKey: string;

  /**
   * 语义检索用的「已归一化」embedding 向量（本地用 JSON 存）。
   * 入库时由 alt/category/keywords/prompt 算出；查询时与请求向量做点积取最近邻。
   * 规模化时改用 pgvector / sqlite-vss 的向量列。见 docs/asset-library-embedding-design.md。
   */
  @Column({ type: 'simple-json', nullable: true })
  embedding: number[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
