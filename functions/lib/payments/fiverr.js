"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FiverrGateway = void 0;
class FiverrGateway {
    constructor(gigUrl) {
        this.gigUrl = gigUrl; // e.g., "https://www.fiverr.com/..."
    }
    async createCharge(amount, currency, options) {
        // Generate a checkout redirect URL with tracking parameters
        const redirectUrl = new URL(this.gigUrl);
        redirectUrl.searchParams.append("ref", options.externalReference);
        redirectUrl.searchParams.append("context", "vishnu_portal");
        return {
            id: "fiverr_redirect",
            status: 'pending',
            redirectUrl: redirectUrl.toString()
        };
    }
    async createSubscription(_plan, _customer, _externalReference) {
        // Fiverr does not support Direct API subscription creation
        throw new Error("Fiverr does not support programmatic subscriptions via API.");
    }
    async cancelSubscription(_subscriptionId) {
        throw new Error("Fiverr does not support programmatic cancellation.");
    }
    async handleWebhook(req) {
        // If we use an email scraper or Zapier integration for Fiverr completed orders:
        const body = req.body;
        if ((body === null || body === void 0 ? void 0 : body.source) === 'fiverr_automation') {
            return {
                gateway: "fiverr",
                type: "payment",
                externalId: body.order_id,
                status: body.status, // "completed"
                externalReference: body.ref,
                raw: body
            };
        }
        return null;
    }
    async getPaymentStatus(_paymentId) {
        return { status: "unknown_in_fiverr" };
    }
}
exports.FiverrGateway = FiverrGateway;
//# sourceMappingURL=fiverr.js.map