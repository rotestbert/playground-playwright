/**
 * DbAdapter — pluggable persistence layer for factories.
 *
 * The default MemoryAdapter keeps all data in plain Maps, making it safe
 * to use in unit tests without spinning up a real database. Swap it out
 * for a real adapter (Prisma, Knex, etc.) in integration tests.
 */

import type {
  User, Category, Product, Order, OrderItem, Payment, Review,
} from './types.js';

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface DbAdapter {
  // Users
  saveUser(user: User): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  // Categories
  saveCategory(category: Category): Promise<Category>;
  getCategory(id: string): Promise<Category | undefined>;
  getAllCategories(): Promise<Category[]>;
  deleteCategory(id: string): Promise<void>;

  // Products
  saveProduct(product: Product): Promise<Product>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductsByCategoryId(categoryId: string): Promise<Product[]>;
  getAllProducts(): Promise<Product[]>;
  deleteProduct(id: string): Promise<void>;

  // Orders
  saveOrder(order: Order): Promise<Order>;
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByUserId(userId: string): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;
  deleteOrder(id: string): Promise<void>;

  // OrderItems
  saveOrderItem(item: OrderItem): Promise<OrderItem>;
  getOrderItem(id: string): Promise<OrderItem | undefined>;
  getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]>;
  deleteOrderItem(id: string): Promise<void>;

  // Payments
  savePayment(payment: Payment): Promise<Payment>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByOrderId(orderId: string): Promise<Payment | undefined>;
  getAllPayments(): Promise<Payment[]>;
  deletePayment(id: string): Promise<void>;

  // Reviews
  saveReview(review: Review): Promise<Review>;
  getReview(id: string): Promise<Review | undefined>;
  getReviewsByProductId(productId: string): Promise<Review[]>;
  getReviewsByUserId(userId: string): Promise<Review[]>;
  deleteReview(id: string): Promise<void>;

  /** Wipe every table — used by the cleanup script and test teardown. */
  reset(): Promise<void>;
}

// ─── In-memory implementation ─────────────────────────────────────────────────

export class MemoryAdapter implements DbAdapter {
  private users      = new Map<string, User>();
  private categories = new Map<string, Category>();
  private products   = new Map<string, Product>();
  private orders     = new Map<string, Order>();
  private orderItems = new Map<string, OrderItem>();
  private payments   = new Map<string, Payment>();
  private reviews    = new Map<string, Review>();

  // ── Users ──────────────────────────────────────────────────────────────────

  async saveUser(user: User): Promise<User> {
    this.users.set(user.id, { ...user });
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    for (const u of this.users.values()) {
      if (u.email === email) return u;
    }
    return undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return [...this.users.values()];
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async saveCategory(category: Category): Promise<Category> {
    this.categories.set(category.id, { ...category });
    return category;
  }

  async getCategory(id: string): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async getAllCategories(): Promise<Category[]> {
    return [...this.categories.values()];
  }

  async deleteCategory(id: string): Promise<void> {
    this.categories.delete(id);
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async saveProduct(product: Product): Promise<Product> {
    this.products.set(product.id, { ...product });
    return product;
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async getProductsByCategoryId(categoryId: string): Promise<Product[]> {
    return [...this.products.values()].filter((p) => p.categoryId === categoryId);
  }

  async getAllProducts(): Promise<Product[]> {
    return [...this.products.values()];
  }

  async deleteProduct(id: string): Promise<void> {
    this.products.delete(id);
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async saveOrder(order: Order): Promise<Order> {
    this.orders.set(order.id, { ...order });
    return order;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrdersByUserId(userId: string): Promise<Order[]> {
    return [...this.orders.values()].filter((o) => o.userId === userId);
  }

  async getAllOrders(): Promise<Order[]> {
    return [...this.orders.values()];
  }

  async deleteOrder(id: string): Promise<void> {
    this.orders.delete(id);
  }

  // ── OrderItems ─────────────────────────────────────────────────────────────

  async saveOrderItem(item: OrderItem): Promise<OrderItem> {
    this.orderItems.set(item.id, { ...item });
    return item;
  }

  async getOrderItem(id: string): Promise<OrderItem | undefined> {
    return this.orderItems.get(id);
  }

  async getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]> {
    return [...this.orderItems.values()].filter((i) => i.orderId === orderId);
  }

  async deleteOrderItem(id: string): Promise<void> {
    this.orderItems.delete(id);
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  async savePayment(payment: Payment): Promise<Payment> {
    this.payments.set(payment.id, { ...payment });
    return payment;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async getPaymentByOrderId(orderId: string): Promise<Payment | undefined> {
    for (const p of this.payments.values()) {
      if (p.orderId === orderId) return p;
    }
    return undefined;
  }

  async getAllPayments(): Promise<Payment[]> {
    return [...this.payments.values()];
  }

  async deletePayment(id: string): Promise<void> {
    this.payments.delete(id);
  }

  // ── Reviews ────────────────────────────────────────────────────────────────

  async saveReview(review: Review): Promise<Review> {
    this.reviews.set(review.id, { ...review });
    return review;
  }

  async getReview(id: string): Promise<Review | undefined> {
    return this.reviews.get(id);
  }

  async getReviewsByProductId(productId: string): Promise<Review[]> {
    return [...this.reviews.values()].filter((r) => r.productId === productId);
  }

  async getReviewsByUserId(userId: string): Promise<Review[]> {
    return [...this.reviews.values()].filter((r) => r.userId === userId);
  }

  async deleteReview(id: string): Promise<void> {
    this.reviews.delete(id);
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  async reset(): Promise<void> {
    this.users.clear();
    this.categories.clear();
    this.products.clear();
    this.orders.clear();
    this.orderItems.clear();
    this.payments.clear();
    this.reviews.clear();
  }
}
