import { exec } from 'child_process';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { folderPath } = await req.json() as { folderPath: string };

  const cmd = process.platform === 'darwin'
    ? `open "${folderPath}"`
    : process.platform === 'win32'
      ? `explorer "${folderPath}"`
      : `xdg-open "${folderPath}"`;

  await new Promise<void>((resolve, reject) => {
    exec(cmd, (err) => {
      if (err) { reject(err); } else { resolve(); }
    });
  });

  return NextResponse.json({ ok: true });
}
