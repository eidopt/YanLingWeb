import { expect, test } from '@playwright/test';

const sourceExportBaseUrl = process.env.E2E_SOURCE_EXPORT_BASE_URL;

test.describe('source export runtime', () => {
  test.skip(!sourceExportBaseUrl, 'E2E_SOURCE_EXPORT_BASE_URL is required');

  test('renders generated React source export and navigates pages', async ({ page }) => {
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

    await page.goto(sourceExportBaseUrl ?? '/');

    await expect(page.getByText('Maintainable source export')).toBeVisible();
    await expect(page.getByPlaceholder('Search generated source')).toBeVisible();
    await expect(page.getByText('Draft')).toBeVisible();
    await expect(page).toHaveScreenshot('source-export-home.png', {
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Open details' }).click();

    await expect(page.getByText('Editable generated page source')).toBeVisible();
    await expect(page.getByText('Unsupported component')).toBeVisible();
    await expect(page).toHaveScreenshot('source-export-details.png', {
      fullPage: true,
    });

    expect(browserErrors).toEqual([]);
  });
});
