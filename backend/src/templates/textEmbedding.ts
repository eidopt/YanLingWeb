import OpenAI from 'openai';

/** 文本 embedding 调用所需的最小配置。 */
export interface EmbeddingConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

interface EmbeddingResponseItem {
  embedding?: number[];
}

interface EmbeddingResponse {
  data?: EmbeddingResponseItem[];
}

/**
 * 把文本转成「已归一化的单位向量」。归一化后，余弦相似度 = 点积（见 dot）。
 * 用于素材库的语义检索（入库存向量、查询比对）。
 */
export async function embedText(config: EmbeddingConfig, text: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  const response = await openai.embeddings.create({ model: config.model, input: text });
  const vector = (response as EmbeddingResponse).data?.[0]?.embedding;
  if (!vector || vector.length === 0) {
    throw new Error('embedding provider returned no vector');
  }
  return normalizeVector(vector);
}

/** 归一化成单位长度向量；零向量原样返回。 */
export function normalizeVector(vector: number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

/** 点积。两个向量都已归一化时，点积即余弦相似度，范围约 [-1, 1]。 */
export function dot(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
