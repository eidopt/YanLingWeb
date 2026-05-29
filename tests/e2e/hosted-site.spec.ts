import { expect, test } from '@playwright/test';

test.describe('hosted site runtime', () => {
  test('renders the static hosted-site fallback without browser errors', async ({ page }) => {
    const browserErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') {
        browserErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      browserErrors.push(error.message);
    });
    page.on('requestfailed', (request) => {
      browserErrors.push(`Request failed: ${request.url()} ${request.failure()?.errorText ?? 'unknown'}`);
    });
    await page.route('https://fonts.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await page.route('https://fonts.gstatic.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'font/woff2', body: '' }),
    );

    await page.goto('/sites/e2e-static');
    await page.addStyleTag({
      content: '[aria-label="Open Next.js Dev Tools"] { display: none !important; }',
    });

    await expect(page.getByText('YanLingWeb static preview')).toBeVisible();
    await expect(page.getByText(/Rendering e2e-static/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview ready' })).toBeVisible();
    await expect(page).toHaveScreenshot('hosted-static-preview.png', {
      fullPage: true,
    });

    expect(browserErrors).toEqual([]);
  });
});
