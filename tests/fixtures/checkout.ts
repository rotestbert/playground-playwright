/**
 * Shared test data for the checkout flow.
 * https://automationexercise.com
 */

export interface CardDetails {
  nameOnCard: string;
  cardNumber: string;
  cvc: string;
  expiryMonth: string;
  expiryYear: string;
}

export interface AddedProduct {
  name: string;
  price: string;
}

/** A card that the site accepts and completes payment. */
export const VALID_CARD: CardDetails = {
  nameOnCard: 'Test User',
  cardNumber: '4111111111111111',
  cvc: '123',
  expiryMonth: '12',
  expiryYear: '2028',
};

/** A card with all fields intentionally empty — triggers required-field validation. */
export const EMPTY_CARD: CardDetails = {
  nameOnCard: '',
  cardNumber: '',
  cvc: '',
  expiryMonth: '',
  expiryYear: '',
};

/** A card with a past expiry year — site should reject it. */
export const EXPIRED_CARD: CardDetails = {
  nameOnCard: 'Expired Holder',
  cardNumber: '4111111111111111',
  cvc: '123',
  expiryMonth: '01',
  expiryYear: '2020',
};
