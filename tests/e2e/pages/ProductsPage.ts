import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';
import type { AddedProduct } from '../../fixtures/checkout.js';

/**
 * POM for https://automationexercise.com/products
 *
 * The page renders a grid of product cards. On hover each card reveals an
 * overlay with an "Add to cart" button. After clicking it, a modal appears
 * offering either "Continue Shopping" or "View Cart".
 */
export class ProductsPage extends BasePage {
  readonly pageHeading: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly productCards: Locator;

  // "Added to cart" modal
  readonly cartModal: Locator;
  readonly cartModalMessage: Locator;
  readonly cartModalViewCartLink: Locator;
  readonly cartModalContinueButton: Locator;

  constructor(page: Page) {
    super(page);

    this.pageHeading = page.getByRole('heading', { name: /all products/i });
    this.searchInput = page.locator('#search_product');
    this.searchButton = page.locator('#submit_search');

    // Each card wraps both the image area and the productinfo section
    this.productCards = page.locator('.product-image-wrapper');

    this.cartModal = page.locator('#cartModal');
    this.cartModalMessage = page.locator('#cartModal .modal-body p').first();
    this.cartModalViewCartLink = page.locator('#cartModal').getByRole('link', { name: /view cart/i });
    this.cartModalContinueButton = page.locator('#cartModal').getByRole('button', { name: /continue shopping/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/products');
  }

  /**
   * Adds the first product in the grid to the cart.
   * Returns the product name and price so callers can assert on cart contents.
   * Dismisses the confirmation modal and stays on the products page.
   */
  async addFirstProductToCart(): Promise<AddedProduct> {
    const firstCard = this.productCards.first();

    const name = (await firstCard.locator('.productinfo p').textContent()) ?? '';
    const price = (await firstCard.locator('.productinfo h2').textContent()) ?? '';

    // Hover to reveal the overlay Add to Cart button, then click
    await firstCard.hover();
    await firstCard.locator('.add-to-cart').first().click();

    await this.cartModal.waitFor({ state: 'visible' });
    await this.cartModalContinueButton.click();
    await this.cartModal.waitFor({ state: 'hidden' });

    return { name: name.trim(), price: price.trim() };
  }

  /**
   * Adds the first product and then navigates straight to the cart
   * by clicking "View Cart" inside the modal.
   */
  async addFirstProductAndGoToCart(): Promise<AddedProduct> {
    const firstCard = this.productCards.first();

    const name = (await firstCard.locator('.productinfo p').textContent()) ?? '';
    const price = (await firstCard.locator('.productinfo h2').textContent()) ?? '';

    await firstCard.hover();
    await firstCard.locator('.add-to-cart').first().click();

    await this.cartModal.waitFor({ state: 'visible' });
    await this.cartModalViewCartLink.click();

    return { name: name.trim(), price: price.trim() };
  }

  /** Returns the number of product cards currently visible on the page. */
  async getProductCount(): Promise<number> {
    return this.productCards.count();
  }
}
