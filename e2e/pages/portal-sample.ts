import type { Page } from '@playwright/test'

export class PortalSample {
  constructor(private readonly page: Page) {}
  get heading() { return this.page.getByRole('heading', { name: 'Your photos', exact: true }) }
  get navigation() { return this.page.getByRole('button', { name: 'Photos', exact: true }) }
  async open() { await this.page.goto('/portal/sample') }
}
