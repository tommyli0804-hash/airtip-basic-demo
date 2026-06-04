import { test, expect } from '@playwright/test';

const TOTAL_CHANNELS = 25; // 5 fingers × 5 pockets

test.describe('应用加载', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', () => {});
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 5000 });
  });

  test('页面标题正确', async ({ page }) => {
    await expect(page).toHaveTitle('气动触觉执行器 Demo');
  });

  test('HUD 状态元素存在', async ({ page }) => {
    await expect(page.locator('#leap-status')).toBeVisible();
    await expect(page.locator('#serial-status')).toBeVisible();
    await expect(page.locator('#serial-btn')).toBeVisible();
  });

  test('串口按钮默认显示"连接串口"', async ({ page }) => {
    await expect(page.locator('#serial-btn')).toHaveText('连接串口');
  });

  test('25 个气压通道 DOM 存在且值在合法范围', async ({ page }) => {
    for (let i = 0; i < TOTAL_CHANNELS; i++) {
      await expect(page.locator(`#bar-${i}`)).toBeAttached();
      const text = await page.locator(`#val-${i}`).textContent();
      const val = Number(text);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(255);
    }
  });

  test('5 行手指标签存在', async ({ page }) => {
    const rows = page.locator('.finger-row');
    await expect(rows).toHaveCount(5);
    const labels = page.locator('.finger-label');
    const texts = await labels.allTextContents();
    expect(texts).toEqual(['拇', '食', '中', '环', '小']);
  });

  test('5 列气囊方向标头存在', async ({ page }) => {
    const headers = page.locator('.pocket-header span');
    const texts = await headers.allTextContents();
    expect(texts).toEqual(['指尖', '指腹', '指背', '内侧', '外侧']);
  });

  test('canvas 被渲染且有尺寸', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);
  });

  test('Mock 串口模式默认激活', async ({ page }) => {
    await expect(page.locator('#serial-status')).toHaveText('Serial: Mock 模式');
  });

  test('无 Leap 时显示 Gumball 模拟状态', async ({ page }) => {
    const text = await page.locator('#leap-status').textContent();
    expect(text).toMatch(/Gumball 模拟/);
  });
});

test.describe('Gumball 模拟交互', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', () => {});
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 5000 });
  });

  test('Gumball 可见且所有通道值在合法范围', async ({ page }) => {
    // Gumball 的 helper 会渲染到 canvas，无法直接检测 DOM
    // 验证手部初始位置产生的通道值在合法范围
    await page.waitForTimeout(200);
    for (let i = 0; i < TOTAL_CHANNELS; i++) {
      const text = await page.locator(`#val-${i}`).textContent();
      const val = Number(text);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(255);
    }
  });

  test('滚轮调整握力不崩溃', async ({ page }) => {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(100);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(100);
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('canvas 在 resize 后调整大小', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(200);
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box.width).toBe(800);
    expect(box.height).toBe(600);
  });
});
