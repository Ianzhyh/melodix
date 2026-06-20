import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { start, stop, ping } from '../helpers/sidecar-runner';

const PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : 45000;

describe('Sidecar Server Integration', () => {
  beforeAll(async () => {
    await start(PORT);
  }, 10000);

  afterAll(async () => {
    await stop();
  });

  it('should respond to ping', async () => {
    const alive = await ping(PORT);
    expect(alive).toBe(true);
  });

  it('should query search endpoint within 3 seconds and return valid JSON', async () => {
    const startTime = Date.now();
    const res = await fetch(`http://localhost:${PORT}/?server=tencent&type=search&keywords=晴天`);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(3000);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('id');
    expect(data[0].name).toBe('晴天');
  });

  it('should query url endpoint within 3 seconds and return valid JSON', async () => {
    const startTime = Date.now();
    const res = await fetch(`http://localhost:${PORT}/?server=tencent&type=url&id=35847388`);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(3000);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('url');
  });

  it('should query lrc endpoint within 3 seconds and return encrypted lyric text', async () => {
    const startTime = Date.now();
    const res = await fetch(`http://localhost:${PORT}/?server=tencent&type=lrc&id=35847388`);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(3000);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toBe('7d0e90f006801f32021c30512a3e23cb8eb6fac399d339ba00c2b90fce0ff0b3937a892d93fce43fe184ce918e35d9a53ec12bd294efe293b0148bba31ceb55a3d49f0f79fc9d689fedbed98a2e7f2da157f0deffc6258d8ce92f8162b10acc9701b52ea39949cc83cf456c931d16df843a308d83593ef19f4a15d4ccba45f650527f6ae818a0482a2c76b6036205820f2cec1d4f5bbe59a615d4664bd11e03f8f1f16c06e2ebd41');
  });

  it('should query pic endpoint within 3 seconds and return cover image stream', async () => {
    const startTime = Date.now();
    const res = await fetch(`http://localhost:${PORT}/?server=tencent&type=pic&id=35847388&size=800`);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(3000);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');

    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
