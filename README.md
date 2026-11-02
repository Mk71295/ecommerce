# E-commerce API (NestJS + Mongoose)

NestJS backend with **Mongoose only** (`@nestjs/mongoose`, no other ORM). Modules: `users`, `products`, `cart`, `orders`, `payments`, plus `auth` (JWT).

## Run

```bash
npm install --legacy-peer-deps   # needed with the current Nest 12 template
cp .env.example .env             # then edit values
npm run start:dev                # http://localhost:3000/api
```

Needs a running MongoDB (`MONGODB_URI`). If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, an admin user is created on first start.

## Structure

```
src/
  auth/       register, login, JwtAuthGuard, RolesGuard
  users/      profile, admin user list
  products/   catalog (search, filter, sort, pagination), atomic stock reserve/release
  cart/       one cart per user, always priced from live product data
  orders/     checkout from cart, status workflow, cancellation
  payments/   COD / card / wallet, gateway interface (mock included), refunds
  common/     enums, guards' decorators, pipes, pagination
```

## Endpoints (prefix `/api`)

| Method | Path | Access |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | public |
| GET / PATCH | `/users/me` | user |
| GET | `/users` | admin |
| GET | `/products` (`search, category, minPrice, maxPrice, sort, page, limit`), `/products/:id` | public |
| POST / PATCH / DELETE | `/products`, `/products/:id` | admin (delete = soft delete) |
| GET | `/cart` | user |
| POST | `/cart/items` `{ productId, quantity }` | user |
| PATCH / DELETE | `/cart/items/:productId` | user |
| DELETE | `/cart` | user |
| POST | `/orders` `{ shippingAddress }` (checkout the cart) | user |
| GET | `/orders`, `/orders/:id` | user (own) |
| POST | `/orders/:id/cancel` | user (own, unpaid only) |
| GET | `/orders/all` | admin |
| PATCH | `/orders/:id/status` | admin |
| POST | `/payments` `{ orderId, method, token? }` | user |
| GET | `/payments`, `/payments/:id` | user (own) / admin |
| POST | `/payments/:id/confirm` (COD cash collected) | admin |
| POST | `/payments/:id/refund` | admin |

Send `Authorization: Bearer <accessToken>` on protected routes.

## How the flow works

1. **Cart**: add/update/remove items. Stock is checked on every change.
2. **Checkout** (`POST /orders`): lines are priced from current products, stock is taken with atomic conditional updates (`stock >= qty`), the order stores a snapshot of name/price, and the cart is cleared. If any step fails, reserved stock is put back.
3. **Pay** (`POST /payments`):
   - `card` / `wallet`: charged through `PaymentGateway`; success moves the order `pending → paid`, failure returns `402` and the order stays payable.
   - `cod`: order moves to `processing`, payment stays `pending` until an admin calls `/confirm`.
   - A partial unique index allows only one active payment per order (no double charge).
4. **Fulfilment** (admin): `paid → processing → shipped → delivered`. Cancelling an order returns its stock.

## Notes

- **Mock gateway**: `MockPaymentGateway` approves everything except `token: "tok_declined"`. To go live, implement `PaymentGateway` for your provider (Paymob, Stripe, ...) and swap it in `payments.module.ts`. Never send raw card numbers to this API; use the provider's client-side tokenization.
- Prices are stored as numbers rounded to 2 decimals. Consider integer minor units (piastres/cents) before handling real money at scale.
- Stock handling uses atomic updates, so it works on a standalone MongoDB (no replica set needed).
- Refunding a payment does not cancel the order; do both from the admin side.
- Unit tests: `npm test`.
