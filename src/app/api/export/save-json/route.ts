import fs from 'fs/promises';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import os from 'os';
import path from 'path';

const OUTPUT_DIR = path.join(os.homedir(), 'Documents', 'ai-app-exports');

export async function POST(req: NextRequest) {
  const { filename, content } = await req.json() as { filename: string; content: string };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  return NextResponse.json({ filePath });
}
