import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_API_VERSION } from '../config.js';

export const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
