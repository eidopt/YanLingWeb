import type { AssetLibrarySpec } from '../src/templates/asset-library.service';

/**
 * 预生成素材库清单。按「大类 × 主体 × 形式(role)」组合展开，~540 条、各大类尽量均衡
 * （每类 8 主体 × 4 形式 = 32）。
 *
 * prompt 用英文（图片模型更稳），alt 用中文，keywords 自动含 中文主体 + 英文主体 + 大类词。
 */
interface SubjectSpec {
  /** 英文主体名，用于 prompt + slug + keywords */
  en: string;
  /** 中文主体名，用于 alt + keywords */
  zh: string;
}

type AssetRole = 'product' | 'hero' | 'category-icon' | 'avatar' | 'illustration' | 'background';

interface CategoryGroup {
  category: string;
  categoryZh: string;
  subjects: SubjectSpec[];
  roles: AssetRole[];
}

const ROLE_PROMPT: Record<AssetRole, (subjectEn: string) => string> = {
  product: (s) => `Clean studio product photo of ${s}, centered, soft shadow, plain light background, e-commerce style, high detail.`,
  hero: (s) => `Vibrant lifestyle hero banner featuring ${s}, bright natural light, generous negative space for overlay text, modern app marketing style.`,
  'category-icon': (s) => `Rounded flat icon representing ${s}, simple friendly shapes on pale solid background, mobile app category tile style.`,
  avatar: (s) => `Friendly circular avatar portrait of ${s}, flat modern illustration, soft solid background.`,
  illustration: (s) => `Modern flat vector illustration about ${s}, friendly colorful, app onboarding style, minimal background.`,
  background: (s) => `Subtle abstract background inspired by ${s}, soft gradient, low contrast, suitable behind UI text.`,
};

const ROLE_ZH: Record<AssetRole, string> = {
  product: '商品图',
  hero: '主图',
  'category-icon': '分类图标',
  avatar: '头像',
  illustration: '插画',
  background: '背景',
};

const COMMERCE_ROLES: AssetRole[] = ['product', 'hero', 'category-icon', 'illustration'];
const SCENE_ROLES: AssetRole[] = ['hero', 'illustration', 'category-icon', 'background'];

const GROUPS: CategoryGroup[] = [
  {
    category: 'fruit',
    categoryZh: '水果',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'red apple', zh: '苹果' },
      { en: 'orange', zh: '橘子' },
      { en: 'strawberry', zh: '草莓' },
      { en: 'banana', zh: '香蕉' },
      { en: 'blueberry', zh: '蓝莓' },
      { en: 'grapes', zh: '葡萄' },
      { en: 'watermelon', zh: '西瓜' },
      { en: 'mango', zh: '芒果' },
    ],
  },
  {
    category: 'vegetable',
    categoryZh: '蔬菜',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'lettuce', zh: '生菜' },
      { en: 'tomato', zh: '番茄' },
      { en: 'carrot', zh: '胡萝卜' },
      { en: 'broccoli', zh: '西兰花' },
      { en: 'cucumber', zh: '黄瓜' },
      { en: 'potato', zh: '土豆' },
      { en: 'spinach', zh: '菠菜' },
      { en: 'corn', zh: '玉米' },
    ],
  },
  {
    category: 'meat',
    categoryZh: '肉类',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'beef', zh: '牛肉' },
      { en: 'chicken', zh: '鸡肉' },
      { en: 'pork', zh: '猪肉' },
      { en: 'lamb', zh: '羊肉' },
      { en: 'bacon', zh: '培根' },
      { en: 'sausage', zh: '香肠' },
      { en: 'pork ribs', zh: '排骨' },
      { en: 'chicken drumstick', zh: '鸡腿' },
    ],
  },
  {
    category: 'seafood',
    categoryZh: '海鲜',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'salmon', zh: '三文鱼' },
      { en: 'shrimp', zh: '虾' },
      { en: 'crab', zh: '螃蟹' },
      { en: 'oyster', zh: '生蚝' },
      { en: 'squid', zh: '鱿鱼' },
      { en: 'lobster', zh: '龙虾' },
      { en: 'tuna', zh: '金枪鱼' },
      { en: 'clam', zh: '蛤蜊' },
    ],
  },
  {
    category: 'dairy',
    categoryZh: '乳品',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'milk bottle', zh: '牛奶' },
      { en: 'eggs', zh: '鸡蛋' },
      { en: 'cheese', zh: '奶酪' },
      { en: 'yogurt', zh: '酸奶' },
      { en: 'butter', zh: '黄油' },
      { en: 'cream', zh: '奶油' },
      { en: 'milk powder', zh: '奶粉' },
      { en: 'ice cream', zh: '冰淇淋' },
    ],
  },
  {
    category: 'food',
    categoryZh: '美食',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'latte coffee', zh: '咖啡' },
      { en: 'gourmet burger', zh: '汉堡' },
      { en: 'dessert cake', zh: '甜点' },
      { en: 'pizza', zh: '披萨' },
      { en: 'noodles', zh: '面条' },
      { en: 'sushi', zh: '寿司' },
      { en: 'salad bowl', zh: '沙拉' },
      { en: 'breakfast plate', zh: '早餐' },
    ],
  },
  {
    category: 'beverage',
    categoryZh: '饮品',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'bubble tea', zh: '奶茶' },
      { en: 'fresh juice', zh: '果汁' },
      { en: 'soda drink', zh: '汽水' },
      { en: 'fruit smoothie', zh: '冰沙' },
      { en: 'beer', zh: '啤酒' },
      { en: 'red wine', zh: '红酒' },
      { en: 'hot tea', zh: '茶' },
      { en: 'cocktail', zh: '鸡尾酒' },
    ],
  },
  {
    category: 'fashion',
    categoryZh: '服饰',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'streetwear hoodie', zh: '卫衣' },
      { en: 'white sneakers', zh: '运动鞋' },
      { en: 'denim jacket', zh: '牛仔外套' },
      { en: 'dress', zh: '连衣裙' },
      { en: 'handbag', zh: '手提包' },
      { en: 't-shirt', zh: 'T恤' },
      { en: 'wrist watch', zh: '手表' },
      { en: 'sunglasses', zh: '墨镜' },
    ],
  },
  {
    category: 'beauty',
    categoryZh: '美妆',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'lipstick', zh: '口红' },
      { en: 'perfume bottle', zh: '香水' },
      { en: 'skincare bottle', zh: '护肤品' },
      { en: 'makeup palette', zh: '彩妆盘' },
      { en: 'face cream jar', zh: '面霜' },
      { en: 'nail polish', zh: '指甲油' },
      { en: 'mascara', zh: '睫毛膏' },
      { en: 'facial serum', zh: '精华液' },
    ],
  },
  {
    category: 'home',
    categoryZh: '家居',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'sofa', zh: '沙发' },
      { en: 'table lamp', zh: '台灯' },
      { en: 'potted plant', zh: '绿植' },
      { en: 'kitchenware set', zh: '厨具' },
      { en: 'bed', zh: '床' },
      { en: 'chair', zh: '椅子' },
      { en: 'rug', zh: '地毯' },
      { en: 'bookshelf', zh: '书架' },
    ],
  },
  {
    category: 'pet',
    categoryZh: '宠物',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'dog', zh: '狗' },
      { en: 'cat', zh: '猫' },
      { en: 'rabbit', zh: '兔子' },
      { en: 'hamster', zh: '仓鼠' },
      { en: 'parrot bird', zh: '鸟' },
      { en: 'fish tank', zh: '鱼缸' },
      { en: 'pet food bag', zh: '宠物粮' },
      { en: 'dog toy', zh: '宠物玩具' },
    ],
  },
  {
    category: 'digital',
    categoryZh: '数码',
    roles: COMMERCE_ROLES,
    subjects: [
      { en: 'smartphone', zh: '手机' },
      { en: 'laptop', zh: '笔记本电脑' },
      { en: 'headphones', zh: '耳机' },
      { en: 'smartwatch', zh: '智能手表' },
      { en: 'camera', zh: '相机' },
      { en: 'tablet', zh: '平板' },
      { en: 'keyboard', zh: '键盘' },
      { en: 'speaker', zh: '音箱' },
    ],
  },
  {
    category: 'fitness',
    categoryZh: '健身',
    roles: SCENE_ROLES,
    subjects: [
      { en: 'person doing yoga', zh: '瑜伽' },
      { en: 'running on a track', zh: '跑步' },
      { en: 'dumbbell workout', zh: '力量训练' },
      { en: 'cycling', zh: '骑行' },
      { en: 'swimming', zh: '游泳' },
      { en: 'basketball', zh: '篮球' },
      { en: 'stretching exercise', zh: '拉伸' },
      { en: 'gym equipment', zh: '健身器材' },
    ],
  },
  {
    category: 'travel',
    categoryZh: '旅行',
    roles: SCENE_ROLES,
    subjects: [
      { en: 'tropical beach resort', zh: '海滩度假' },
      { en: 'mountain landscape', zh: '山景' },
      { en: 'city skyline at dusk', zh: '城市天际线' },
      { en: 'forest trail', zh: '森林' },
      { en: 'desert dunes', zh: '沙漠' },
      { en: 'calm lake', zh: '湖泊' },
      { en: 'airplane in sky', zh: '飞机' },
      { en: 'cozy hotel room', zh: '酒店房间' },
    ],
  },
  {
    category: 'education',
    categoryZh: '教育',
    roles: SCENE_ROLES,
    subjects: [
      { en: 'stack of books', zh: '书本' },
      { en: 'graduation cap', zh: '学士帽' },
      { en: 'classroom', zh: '教室' },
      { en: 'online course on laptop', zh: '在线课程' },
      { en: 'notebook and pen', zh: '笔记本' },
      { en: 'colored pencils', zh: '彩色铅笔' },
      { en: 'globe', zh: '地球仪' },
      { en: 'microscope', zh: '显微镜' },
    ],
  },
  {
    category: 'finance',
    categoryZh: '理财',
    roles: SCENE_ROLES,
    subjects: [
      { en: 'growth chart and coins', zh: '资产增长' },
      { en: 'digital wallet', zh: '电子钱包' },
      { en: 'credit card', zh: '银行卡' },
      { en: 'stack of coins', zh: '金币' },
      { en: 'piggy bank', zh: '存钱罐' },
      { en: 'calculator', zh: '计算器' },
      { en: 'safe box', zh: '保险箱' },
      { en: 'invoice document', zh: '账单' },
    ],
  },
  {
    // 人物保持"代表性样本"，不枚举人种/性别等属性维度（会组合爆炸）。
    // 特定属性（如"亚洲女性"）由"模板 asset 描述驱动现生 + 自动入库"按需覆盖。
    category: 'people',
    categoryZh: '人物',
    roles: ['avatar', 'illustration', 'hero', 'background'],
    subjects: [
      { en: 'a smiling young woman', zh: '年轻女性' },
      { en: 'a smiling young man', zh: '年轻男性' },
      { en: 'a businessman', zh: '商务男士' },
      { en: 'a businesswoman', zh: '商务女士' },
      { en: 'a friendly elderly person', zh: '老人' },
      { en: 'a happy child', zh: '儿童' },
      { en: 'a doctor', zh: '医生' },
      { en: 'a chef', zh: '厨师' },
    ],
  },
];

function buildManifest(): AssetLibrarySpec[] {
  const specs: AssetLibrarySpec[] = [];
  for (const group of GROUPS) {
    for (const subject of group.subjects) {
      for (const role of group.roles) {
        const slug = `${group.category}-${subject.en.replace(/[^a-z0-9]+/gi, '-')}-${role}`
          .toLowerCase()
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        specs.push({
          slug,
          category: group.category,
          role,
          alt: `${subject.zh}${ROLE_ZH[role]}`,
          // keywords 自动含 中文大类 + 大类 key + 中文主体 + 英文主体 + role
          keywords: [group.categoryZh, group.category, subject.zh, subject.en, role],
          prompt: ROLE_PROMPT[role](subject.en),
        });
      }
    }
  }
  return specs;
}

export const ASSET_LIBRARY_MANIFEST: AssetLibrarySpec[] = buildManifest();
