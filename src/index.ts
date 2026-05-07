import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { env, isProd } from "./config/env";
import { authRoutes } from "./modules/auth/routes";
import { authContext } from "./middlewares/auth";
import { adminGuard } from "./middlewares/admin";
import { rateLimitMiddleware } from "./middlewares/rate-limit";
import { catalogModule } from "./modules/catalog";
import { adminBulkImportModule } from "./modules/catalog/bulk-import";
import { topupRoutes } from "./modules/wallet/topup-routes";
import { walletRoutes } from "./modules/wallet/wallet-routes";
import { webhookRoutes } from "./modules/webhook/routes";
import { cartRoutes } from "./modules/cart/routes";
import { checkoutRoutes } from "./modules/orders/checkout-routes";
import {
  userOrderRoutes,
  adminOrderRoutes,
} from "./modules/orders/order-routes";
import { refundRoutes } from "./modules/orders/refund-routes";
import { adminOrdersCsvModule } from "./modules/orders/csv-export";
import { adminConfigModule } from "./modules/admin-config";
import { adminIpModule } from "./modules/admin-ip";
import { adminWebhookEventsModule } from "./modules/admin-webhook/events";
import { startWebhookEventsRetentionJob } from "./modules/admin-webhook/cleanup";
import { migrateLegacyImagesIfNeeded } from "./lib/migrate-uploads-to-r2";
import {
  publicReviews,
  userReviews,
  adminReviews,
} from "./modules/reviews/routes";
import { publicContact, adminContact } from "./modules/contact/routes";
import { adminDashboardModule } from "./modules/admin-dashboard";
import { adminSalesChartModule } from "./modules/admin-dashboard/sales-chart";
import { adminUsersModule } from "./modules/admin-users";
import { adminAuditModule } from "./modules/admin-audit";
import { adminPromoModule } from "./modules/promo/admin-routes";
import { publicPromoRoutes } from "./modules/promo/public-routes";
import { wishlistRoutes } from "./modules/wishlist/routes";

const app = new Elysia()
  .use(
    cors({
      origin: env.FRONTEND_ORIGINS,
      credentials: true,
    }),
  )
  .use(rateLimitMiddleware)
  .use(authRoutes)
  .use(authContext)
  .use(adminGuard)
  .use(catalogModule)
  .use(adminBulkImportModule)
  .use(cartRoutes)
  .use(checkoutRoutes)
  .use(userOrderRoutes)
  .use(adminOrderRoutes)
  .use(refundRoutes)
  .use(adminOrdersCsvModule)
  .use(topupRoutes)
  .use(walletRoutes)
  .use(webhookRoutes)
  .use(adminConfigModule)
  .use(adminIpModule)
  .use(adminWebhookEventsModule)
  .use(publicReviews)
  .use(userReviews)
  .use(adminReviews)
  .use(publicContact)
  .use(adminContact)
  .use(adminDashboardModule)
  .use(adminSalesChartModule)
  .use(adminUsersModule)
  .use(adminAuditModule)
  .use(adminPromoModule)
  .use(publicPromoRoutes)
  .use(wishlistRoutes)
  .get("/health", () => ({ ok: true, env: env.NODE_ENV }))
  .get("/api/me", ({ user }) => ({ user }), {
    requireAuth: true,
  })
  .get("/api/admin/ping", ({ user, clientIp }) => ({ user, clientIp }), {
    requireAdmin: true,
  })
  .onError(({ code, error, request, set }) => {
    const path = (() => {
      try {
        return new URL(request.url).pathname;
      } catch {
        return request.url;
      }
    })();
    console.error(
      "[unhandled]",
      code,
      request.method,
      path,
      error instanceof Error ? error.message : error,
    );
    if (code === "VALIDATION") {
      set.status = 400;
      return isProd
        ? { error: "validation_error" }
        : {
            error: "validation_error",
            detail: error instanceof Error ? error.message : String(error),
          };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "not_found" };
    }
    set.status = 500;
    return isProd
      ? { error: "internal_error" }
      : {
          error: code,
          message: error instanceof Error ? error.message : String(error),
        };
  })
  .listen(env.PORT);

startWebhookEventsRetentionJob();

// Move any rows still pointing at the old /uploads/* local paths into S3.
// Idempotent: skips if no legacy rows or storage is not configured.
migrateLegacyImagesIfNeeded().catch((e) =>
  console.error("[migrate-uploads-to-r2]", e),
);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);

export type App = typeof app;
