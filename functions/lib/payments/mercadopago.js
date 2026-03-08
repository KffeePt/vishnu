"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MercadoPagoGateway = void 0;
const mercadopago_1 = require("mercadopago");
// Note: Ensure MERCADOPAGO_ACCESS_TOKEN is set in Firebase Secrets
class MercadoPagoGateway {
    constructor(accessToken) {
        this.client = new mercadopago_1.MercadoPagoConfig({ accessToken });
    }
    async createCharge(amount, currency, options) {
        var _a;
        const payment = new mercadopago_1.Payment(this.client);
        // Minimal implementation for standard card payment
        const body = {
            transaction_amount: amount,
            description: options.description,
            payment_method_id: options.paymentMethodId || "visa",
            payer: {
                email: options.email,
            },
            token: options.token,
            external_reference: options.externalReference,
            installments: 1
        };
        try {
            const response = await payment.create({ body });
            return {
                id: ((_a = response.id) === null || _a === void 0 ? void 0 : _a.toString()) || "",
                status: response.status === 'approved' ? 'completed' : (response.status === 'rejected' ? 'failed' : 'pending')
            };
        }
        catch (e) {
            console.error("MercadoPago Charge Error:", e);
            throw e;
        }
    }
    async createSubscription(plan, customer, externalReference) {
        const preApproval = new mercadopago_1.PreApproval(this.client);
        const body = {
            reason: plan.name,
            external_reference: externalReference,
            payer_email: customer.email,
            auto_recurring: {
                frequency: 1,
                frequency_type: plan.interval === 'month' ? 'months' : 'years',
                transaction_amount: plan.price,
                currency_id: plan.currency,
            },
            back_url: "https://vishnu-dashboard.web.app/billing?gateway=mercadopago",
            status: "pending"
        };
        try {
            const response = await preApproval.create({ body });
            return {
                id: response.id || "",
                status: 'pending',
                gatewayUrl: response.init_point
            };
        }
        catch (e) {
            console.error("MercadoPago Subscription Error:", e);
            throw e;
        }
    }
    async cancelSubscription(subscriptionId) {
        const preApproval = new mercadopago_1.PreApproval(this.client);
        await preApproval.update({ id: subscriptionId, body: { status: "cancelled" } });
    }
    async handleWebhook(req) {
        var _a;
        const body = req.body;
        // Basic mapping from MercadoPago's Webhook (Data type can be "payment" or "subscription")
        if (!body || !body.type)
            return null;
        let type = "payment";
        if (body.type === "subscription_preapproval")
            type = "subscription";
        return {
            gateway: "mercadopago",
            type,
            externalId: (_a = body.data) === null || _a === void 0 ? void 0 : _a.id,
            status: body.action || "updated",
            raw: body
        };
    }
    async getPaymentStatus(paymentId) {
        const payment = new mercadopago_1.Payment(this.client);
        return payment.get({ id: paymentId });
    }
}
exports.MercadoPagoGateway = MercadoPagoGateway;
//# sourceMappingURL=mercadopago.js.map