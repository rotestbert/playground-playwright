/**
 * Shared domain types for all factories.
 * Aligned with src/schema.graphql + src/services/payment.service.ts
 */

import type { Currency, TransactionStatus } from '../services/payment.service.js';

// ─── Enums (mirrored from schema.graphql) ─────────────────────────────────────

export type Role = 'ADMIN' | 'USER';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export type SortDirection = 'ASC' | 'DESC';

// ─── Core models ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;       // cents
  stock: number;
  sku: string;
  imageUrl: string;
  isFeatured: boolean;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;   // cents, snapshot at time of order
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  total: number;       // cents
  shippingAddress: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  orderId: string;
  customerId: string;
  amount: number;      // cents
  currency: Currency;
  status: TransactionStatus;
  gatewayTransactionId: string;
  refundedAmount: number;
  cardLast4: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;      // 1–5
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Graph types (models with nested relations pre-loaded) ─────────────────────

export type UserGraph = User & {
  orders: OrderGraph[];
};

export type ProductGraph = Product & {
  category: Category;
  reviews: ReviewGraph[];
};

export type ReviewGraph = Review & {
  user: User;
};

export type OrderItemGraph = OrderItem & {
  product: Product;
};

export type OrderGraph = Order & {
  items: OrderItemGraph[];
  payment?: Payment;
  user: User;
};

// ─── Factory input types ───────────────────────────────────────────────────────

export type PartialUser     = Partial<Omit<User,     'id' | 'createdAt' | 'updatedAt'>>;
export type PartialCategory = Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>;
export type PartialProduct  = Partial<Omit<Product,  'id' | 'createdAt' | 'updatedAt'>>;
export type PartialOrder    = Partial<Omit<Order,    'id' | 'createdAt' | 'updatedAt'>>;
export type PartialPayment  = Partial<Omit<Payment,  'id' | 'createdAt' | 'updatedAt'>>;
export type PartialOrderItem = Partial<Omit<OrderItem, 'id'>>;
export type PartialReview   = Partial<Omit<Review,   'id' | 'createdAt' | 'updatedAt'>>;
