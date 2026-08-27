import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing target URL' }, { status: 400 });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    
    // 尝试不同的请求头策略
    let response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: `${parsedTarget.protocol}//${parsedTarget.host}/`,
        Accept: '*/*',
      },
    });

    if (!response.ok && (response.status === 403 || response.status === 401 || response.status === 522)) {
      // 备用方案：不带 Referer 重新请求
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      });
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream returned status ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('Cache-Control', 'public, max-age=3600');

    // 检查是否为 M3U8 播放列表
    if (
      contentType.includes('mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      targetUrl.includes('.m3u8')
    ) {
      headers.set('Content-Type', 'application/vnd.apple.mpegurl');
      const m3u8Text = await response.text();
      const baseUrl = new URL(targetUrl);
      const lines = m3u8Text.split('\n');

      const rewrittenLines = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          return line;
        }
        try {
          const absoluteUrl = new URL(trimmed, baseUrl).href;
          return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        } catch {
          return line;
        }
      });

      return new Response(rewrittenLines.join('\n'), { headers });
    }

    // 二进制切片 (.ts / .m4s / mp4 等)
    headers.set('Content-Type', contentType || 'video/mp2t');
    return new Response(response.body, { headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Proxy error' }, { status: 500 });
  }
}
