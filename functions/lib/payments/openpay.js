"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenPayGateway = void 0;
function normalizeChargeStatus(status) {
    if (status === "completed")
        return "completed";
    if (status === "failed" || status === "cancelled")
        return "failed";
    return "pending";
}
function normalizeSubscriptionStatus(status) {
    if (status === "active")
        return "active";
    if (status === "cancelled" || status === "failed")
        return "failed";
    if (status === "paused")
        return "paused";
    return "pending";
}
class OpenPayGateway {
    constructor(merchantId, privateKey, isProduction = false) {
        this.baseUrl = `${isProduction ? "https://api.openpay.mx" : "https://sandbox-api.openpay.mx"}/v1/${merchantId}`;
        this.authHeader = `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;
    }
    async request(method, resourcePath, body) {
        const response = await fetch(`${this.baseUrl}${resourcePath}`, {
            method,
            headers: {
                "Authorization": this.authHeader,
                "Content-Type": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (response.status === 204) {
            return undefined;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error("OpenPay API Error:", payload);
            throw new Error(`OpenPay request failed with status ${response.status}`);
        }
        return payload;
    }
    async createCharge(amount, currency, options) {
        const charge = await this.request("POST", "/charges", {
            source_id: options.token,
            method: "card",
            amount,
            currency,
            description: options.description,
            order_id: options.externalReference,
            device_session_id: options.deviceId,
            customer: {
                email: options.email
            }
        });
        return {
            id: charge.id,
            status: normalizeChargeStatus(charge.status)
        };
    }
    async createSubscription(plan, customer, externalReference) {
        const createdCustomer = await this.request("POST", "/customers", {
            name: customer.name || "Client",
            last_name: "Vishnu",
            email: customer.email,
            requires_account: false,
            external_id: externalReference
        });
        const subscription = await this.request("POST", `/customers/${createdCustomer.id}/subscriptions`, { plan_id: plan.id });
        return {
            id: subscription.id,
            status: normalizeSubscriptionStatus(subscription.status),
            gatewayUrl: "openpay-integration-required"
        };
    }
    async cancelSubscription(subscriptionId) {
        console.log("Canceling OpenPay subscription:", subscriptionId);
    }
    async handleWebhook(req) {
        var _a, _b, _c;
        const body = req.body;
        if (!body || !body.type)
            return null;
        const type = body.type.includes("subscription") ? "subscription" : "payment";
        return {
            gateway: "openpay",
            type,
            externalId: body.transaction_id || ((_a = body.subscription) === null || _a === void 0 ? void 0 : _a.id) || body.id,
            externalReference: body.order_id || ((_b = body.transaction) === null || _b === void 0 ? void 0 : _b.order_id) || ((_c = body.subscription) === null || _c === void 0 ? void 0 : _c.external_id),
            status: body.type,
            raw: body
        };
    }
    async getPaymentStatus(paymentId) {
        return this.request("GET", `/charges/${paymentId}`);
    }
}
exports.OpenPayGateway = OpenPayGateway;
//# sourceMappingURL=openpay.js.map