"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenPayGateway = void 0;
const openpay_1 = __importDefault(require("openpay"));
class OpenPayGateway {
    constructor(merchantId, privateKey, isProduction = false) {
        // Basic OpenPay initialization
        this.openpay = new openpay_1.default(merchantId, privateKey, isProduction);
    }
    async createCharge(amount, currency, options) {
        const chargeRequest = {
            source_id: options.token,
            method: 'card',
            amount: amount,
            currency: currency,
            description: options.description,
            order_id: options.externalReference,
            device_session_id: options.deviceId,
            customer: {
                email: options.email
            }
        };
        return new Promise((resolve, reject) => {
            this.openpay.charges.create(chargeRequest, (error, charge) => {
                if (error) {
                    console.error("OpenPay Charge Error:", error);
                    reject(error);
                }
                else {
                    resolve({
                        id: charge.id,
                        status: charge.status === 'completed' ? 'completed' : 'pending'
                    });
                }
            });
        });
    }
    async createSubscription(plan, customer, externalReference) {
        return new Promise((resolve, reject) => {
            // Find or create customer (skipping full flow for brevity)
            const customerRequest = {
                name: customer.name || "Client",
                last_name: "Vishnu",
                email: customer.email,
                requires_account: false
            };
            this.openpay.customers.create(customerRequest, (error, c) => {
                if (error)
                    return reject(error);
                const subscriptionRequest = {
                    plan_id: plan.id,
                };
                this.openpay.customers.subscriptions.create(c.id, subscriptionRequest, (err, sub) => {
                    if (err)
                        return reject(err);
                    resolve({
                        id: sub.id,
                        status: sub.status === 'active' ? 'active' : 'pending',
                        gatewayUrl: "openpay-integration-required" // Normally standard form
                    });
                });
            });
        });
    }
    async cancelSubscription(subscriptionId) {
        // Requires customer_id + subscription_id in OpenPay
        console.log("Canceling OpenPay subscription:", subscriptionId);
    }
    async handleWebhook(req) {
        var _a;
        const body = req.body;
        if (!body || !body.type)
            return null;
        let type = "payment";
        if (body.type.includes("subscription"))
            type = "subscription";
        return {
            gateway: "openpay",
            type,
            externalId: body.transaction_id || ((_a = body.subscription) === null || _a === void 0 ? void 0 : _a.id),
            status: body.type,
            raw: body
        };
    }
    async getPaymentStatus(paymentId) {
        return new Promise((resolve, reject) => {
            this.openpay.charges.get(paymentId, (error, charge) => {
                if (error)
                    reject(error);
                else
                    resolve(charge);
            });
        });
    }
}
exports.OpenPayGateway = OpenPayGateway;
//# sourceMappingURL=openpay.js.map